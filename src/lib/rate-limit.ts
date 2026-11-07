import "server-only";
import { headers } from "next/headers";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { pickClientIp } from "@/lib/client-ip";
import { mailboxKey } from "@/lib/mailbox";

// Fixed-window counters stored in the database, so limits hold across
// processes and restarts. Every step is a single conditional statement, so
// concurrent requests cannot both slip under a limit (no read-then-write race).

export type Limit = { key: string; max: number; windowMs: number };

async function ensureFreshWindow({ key, windowMs }: Limit, now: Date): Promise<void> {
  try {
    await prisma.rateLimit.create({ data: { key, count: 0, windowStart: now } });
  } catch (err) {
    if (!(err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002")) throw err;
    // Row exists: start a new window if the old one has ended.
    await prisma.rateLimit.updateMany({
      where: { key, windowStart: { lt: new Date(now.getTime() - windowMs) } },
      data: { count: 0, windowStart: now },
    });
  }
}

/** Use one unit of each limit; all-or-nothing. Returns false if any limit is exhausted. */
/** Delete counters whose window ended long ago (the longest window is 24 h). */
export async function pruneRateLimits(): Promise<void> {
  await prisma.rateLimit.deleteMany({ where: { windowStart: { lt: new Date(Date.now() - 48 * HOUR) } } });
}

export async function consume(...limits: Limit[]): Promise<boolean> {
  const now = new Date();
  const taken: Limit[] = [];
  for (const limit of limits) {
    await ensureFreshWindow(limit, now);
    const { count } = await prisma.rateLimit.updateMany({
      where: { key: limit.key, count: { lt: limit.max } },
      data: { count: { increment: 1 } },
    });
    if (!count) {
      // Give back what we already took so a refused request costs nothing.
      await Promise.all(taken.map((l) => refund(l)));
      return false;
    }
    taken.push(limit);
  }
  return true;
}

/** Return one unit (e.g. when the action it paid for failed). */
export async function refund({ key }: Limit): Promise<void> {
  await prisma.rateLimit.updateMany({ where: { key, count: { gt: 0 } }, data: { count: { decrement: 1 } } });
}

/** True if the limit is already used up, without consuming anything. */
export async function isExhausted({ key, max, windowMs }: Limit): Promise<boolean> {
  const row = await prisma.rateLimit.findUnique({ where: { key } });
  if (!row || row.windowStart.getTime() < Date.now() - windowMs) return false;
  return row.count >= max;
}

/**
 * Best-effort client IP. Uses the right-most X-Forwarded-For entry, which is the
 * one added by the closest proxy (or by Next.js from the socket when there is
 * no proxy). Deploy behind a proxy that sets X-Forwarded-For; otherwise clients
 * can choose their own value, and only the global limits still apply.
 */
export async function clientIp(): Promise<string> {
  return pickClientIp(await headers(), process.env.CLIENT_IP_HEADER);
}


const MINUTE = 60_000;
const HOUR = 60 * MINUTE;

/** All limits used by the sign-in flow, in one place. */
type Kind = "LOGIN" | "SIGNUP" | "RESET";

export const limits = {
  /** Login/sign-up/reset form submissions per IP (checked before any password hashing). */
  authAttemptsPerIp: (ip: string): Limit => ({ key: `auth:ip:${ip}`, max: 30, windowMs: 15 * MINUTE }),
  /**
   * Code emails (first sends and resends) to one mailbox. Resets count
   * separately, so resets someone else starts can't use up the owner's login
   * codes.
   */
  emailsPerMailbox: (kind: Kind, email: string): Limit => ({
    key: `send:${kind === "RESET" ? "reset" : "to"}:${mailboxKey(email)}`,
    max: 5,
    windowMs: 15 * MINUTE,
  }),
  /** Code emails triggered from one IP. */
  emailsPerIp: (ip: string): Limit => ({ key: `send:ip:${ip}`, max: 20, windowMs: HOUR }),
  /**
   * Code emails across the whole app, to protect the Resend quota. Logins get
   * the largest share to themselves; sign-ups and resets, which need no
   * credentials, each have their own, so floods of either can't stop existing
   * users from logging in.
   */
  emailsGlobal: (kind: Kind): Limit => {
    const total = Number(process.env.EMAIL_HOURLY_LIMIT) || 300;
    if (kind === "LOGIN") return { key: "send:global:login", max: Math.ceil(total * 0.7), windowMs: HOUR };
    return { key: `send:global:${kind.toLowerCase()}`, max: Math.floor(total * 0.3), windowMs: HOUR };
  },
};

const DAY = 24 * HOUR;

/**
 * Wrong-code budgets that outlive a single sign-in attempt. Once one is used
 * up, no new codes of that kind are sent until it resets.
 * - LOGIN: per account (only someone with that account's password can spend
 *   it, and it can't block other accounts on the same email).
 * - SIGNUP: per mailbox, separate from logins.
 * - RESET: per IP and mailbox, plus a looser per-mailbox ceiling on guessing,
 *   so a stranger can't lock the owner out of resetting with a few wrong codes.
 */
export function failureLimits(kind: Kind, who: { email: string; userId?: string | null; ip: string }): Limit[] {
  if (kind === "LOGIN" && who.userId) return [{ key: `fail:login:user:${who.userId}`, max: 10, windowMs: DAY }];
  if (kind === "RESET") {
    return [
      { key: `fail:reset:ip:${who.ip}:${mailboxKey(who.email)}`, max: 10, windowMs: DAY },
      { key: `fail:reset:${mailboxKey(who.email)}`, max: 50, windowMs: DAY },
    ];
  }
  return [{ key: `fail:${kind.toLowerCase()}:${mailboxKey(who.email)}`, max: 10, windowMs: DAY }];
}

/** Consume the email-sending budget for one code email to `email`. */
export async function consumeEmailBudget(
  kind: Kind,
  email: string,
): Promise<{ ok: boolean; refund: () => Promise<void> }> {
  const ip = await clientIp();
  const used = [limits.emailsPerMailbox(kind, email), limits.emailsPerIp(ip), limits.emailsGlobal(kind)];
  const ok = await consume(...used);
  return { ok, refund: async () => void (await Promise.all(used.map((l) => refund(l)))) };
}
