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
export const limits = {
  /** Login/sign-up form submissions per IP (checked before any password hashing). */
  authAttemptsPerIp: (ip: string): Limit => ({ key: `auth:ip:${ip}`, max: 30, windowMs: 15 * MINUTE }),
  /** Code emails (first sends and resends) to one mailbox. */
  emailsPerMailbox: (email: string): Limit => ({ key: `send:to:${mailboxKey(email)}`, max: 5, windowMs: 15 * MINUTE }),
  /** Code emails triggered from one IP. */
  emailsPerIp: (ip: string): Limit => ({ key: `send:ip:${ip}`, max: 20, windowMs: HOUR }),
  /**
   * Code emails across the whole app, to protect the Resend quota. Sign-ups
   * (which need no credentials) get their own share, so a flood of fake
   * sign-ups can't use up the budget that existing users need to log in.
   */
  emailsGlobal: (kind: "LOGIN" | "SIGNUP"): Limit => {
    const total = Number(process.env.EMAIL_HOURLY_LIMIT) || 300;
    return kind === "LOGIN"
      ? { key: "send:global:login", max: Math.ceil(total * 0.7), windowMs: HOUR }
      : { key: "send:global:signup", max: Math.floor(total * 0.3), windowMs: HOUR };
  },
  /**
   * Wrong codes across all of one account's login attempts. Once used up, no
   * new login codes are sent until the window ends, which caps a
   * password-holding attacker at a handful of guesses per day. Sign-ups have
   * their own budget so nobody can lock an address's owner out by fumbling
   * codes on a sign-up they started with that address.
   */
  failedCodes: (kind: "LOGIN" | "SIGNUP", email: string): Limit => ({
    key: `fail:${kind === "LOGIN" ? "login" : "signup"}:${mailboxKey(email)}`,
    max: 10,
    windowMs: 24 * HOUR,
  }),
};

/** Consume the email-sending budget for one code email to `email`. */
export async function consumeEmailBudget(
  kind: "LOGIN" | "SIGNUP",
  email: string,
): Promise<{ ok: boolean; refund: () => Promise<void> }> {
  const ip = await clientIp();
  const used = [limits.emailsPerMailbox(email), limits.emailsPerIp(ip), limits.emailsGlobal(kind)];
  const ok = await consume(...used);
  return { ok, refund: async () => void (await Promise.all(used.map((l) => refund(l)))) };
}
