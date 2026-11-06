import "server-only";
import { cookies, headers } from "next/headers";
import { prisma } from "@/lib/db";
import { codeEmail, sendEmail } from "@/lib/email";
import { consume, consumeEmailBudget, isExhausted, limits, pruneRateLimits, refund } from "@/lib/rate-limit";
import {
  CHALLENGE_TTL_MS,
  MAX_ATTEMPTS,
  MAX_SENDS,
  REDEEM_WINDOW_MS,
  RESEND_COOLDOWN_MS,
  codeMatches,
  generateCode,
  generateToken,
  hashCode,
  hashToken,
  maskEmail,
} from "@/lib/otp";

// Two-factor sign-in: after the password (LOGIN) or the sign-up form (SIGNUP)
// checks out, we email a 6-digit code and remember the attempt as a challenge.
// The browser identifies its challenge by a random token in an httpOnly cookie.
// A session is only ever issued by redeemChallenge(), which requires a challenge
// whose code was verified moments ago and which has not been used before.

const COOKIE = "tc_2fa";

export type ChallengeKind = "LOGIN" | "SIGNUP";
export type SignupPayload = { username: string; name: string | null; passwordHash: string };

/**
 * "emails": too many code emails for this address, IP or the whole app.
 * "failures": too many wrong codes for this account recently.
 */
export class RateLimitError extends Error {
  constructor(readonly reason: "emails" | "failures") {
    super(`rate limited: ${reason}`);
  }
}

function secret(): string {
  const s = process.env.AUTH_SECRET;
  if (!s) throw new Error("AUTH_SECRET is not set.");
  return s;
}

/** The pending challenge's token from the browser's cookie, if any. */
export async function readChallengeToken(): Promise<string | null> {
  return (await cookies()).get(COOKIE)?.value ?? null;
}

export async function clearChallengeCookie(): Promise<void> {
  (await cookies()).delete(COOKIE);
}

/**
 * Create a challenge, email its code and set the challenge cookie.
 * Throws RateLimitError if this account/address has requested too many codes.
 */
export async function startChallenge(opts: {
  kind: ChallengeKind;
  email: string;
  username: string;
  userId?: string;
  payload?: SignupPayload;
}): Promise<void> {
  const now = Date.now();

  // Opportunistic cleanup of stale challenges and rate-limit counters.
  await prisma.emailChallenge.deleteMany({ where: { createdAt: { lt: new Date(now - 24 * 3600 * 1000) } } });
  await pruneRateLimits();

  // An account that has had too many wrong codes gets no new codes for a while,
  // however many challenges are started, so a password alone can't be used to
  // grind through codes.
  if (await isExhausted(limits.failedCodes(opts.kind, opts.email))) throw new RateLimitError("failures");
  const budget = await consumeEmailBudget(opts.kind, opts.email);
  if (!budget.ok) throw new RateLimitError("emails");

  const token = generateToken();
  const tokenHash = hashToken(token);
  const code = generateCode();
  const challenge = await prisma.emailChallenge.create({
    data: {
      tokenHash,
      kind: opts.kind,
      userId: opts.userId ?? null,
      email: opts.email,
      payload: opts.payload ? JSON.stringify(opts.payload) : null,
      codeHash: hashCode(code, tokenHash, secret()),
      expiresAt: new Date(now + CHALLENGE_TTL_MS),
    },
  });

  try {
    await sendEmail(
      codeEmail({ to: opts.email, code, username: opts.username, purpose: opts.kind === "SIGNUP" ? "signup" : "login" }),
    );
  } catch (err) {
    await prisma.emailChallenge.delete({ where: { id: challenge.id } });
    await budget.refund();
    throw err;
  }

  (await cookies()).set(COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    // Like Auth.js's own cookies: Secure whenever the site is served over HTTPS.
    secure: await isHttps(),
    path: "/",
    maxAge: Math.ceil((CHALLENGE_TTL_MS * 3) / 1000),
  });
}

async function isHttps(): Promise<boolean> {
  // Same inputs Auth.js uses for its own cookies.
  const configured = process.env.AUTH_URL ?? process.env.NEXTAUTH_URL;
  if (configured) {
    try {
      return new URL(configured).protocol === "https:";
    } catch {
      // fall through to the request
    }
  }
  return (await headers()).get("x-forwarded-proto")?.split(",")[0].trim().toLowerCase() === "https";
}

async function currentChallenge() {
  const token = await readChallengeToken();
  if (!token) return null;
  return prisma.emailChallenge.findUnique({ where: { tokenHash: hashToken(token) } });
}

function isUsable(c: { expiresAt: Date; consumedAt: Date | null; attempts: number }): boolean {
  return !c.consumedAt && c.expiresAt.getTime() > Date.now() && c.attempts < MAX_ATTEMPTS;
}

/** What the /verify page needs to know about the pending challenge, if any. */
export async function getChallengeInfo() {
  const c = await currentChallenge();
  if (!c || !isUsable(c)) return null;
  return {
    kind: c.kind as ChallengeKind,
    maskedEmail: maskEmail(c.email),
    attemptsLeft: MAX_ATTEMPTS - c.attempts,
    canResend: c.sendCount < MAX_SENDS,
  };
}

export type VerifyResult =
  | { ok: true; kind: ChallengeKind; payload: SignupPayload | null; email: string }
  | { ok: false; reason: "missing" | "expired" | "locked" | "invalid"; attemptsLeft?: number };

/** Check a code against the pending challenge. Every check uses up one attempt. */
export async function verifyChallengeCode(code: string): Promise<VerifyResult> {
  const c = await currentChallenge();
  if (!c || c.consumedAt) return { ok: false, reason: "missing" };
  if (c.expiresAt.getTime() <= Date.now()) return { ok: false, reason: "expired" };

  // Count the attempt atomically so parallel guesses can't exceed the limit.
  const { count } = await prisma.emailChallenge.updateMany({
    where: { id: c.id, attempts: { lt: MAX_ATTEMPTS }, consumedAt: null },
    data: { attempts: { increment: 1 } },
  });
  if (!count) return { ok: false, reason: "locked" };

  // Charge the account-wide budget *before* comparing, so parallel guesses
  // can't all be compared while the budget still looks unspent. A correct
  // code gets its unit back below.
  const accountFailures = limits.failedCodes(c.kind as ChallengeKind, c.email);
  if (!(await consume(accountFailures))) return lock(c.id);

  if (!codeMatches(code, c.tokenHash, secret(), c.codeHash)) {
    const left = MAX_ATTEMPTS - (c.attempts + 1);
    return left > 0 ? { ok: false, reason: "invalid", attemptsLeft: left } : { ok: false, reason: "locked" };
  }
  await refund(accountFailures);

  await prisma.emailChallenge.update({ where: { id: c.id }, data: { verifiedAt: new Date() } });
  return {
    ok: true,
    kind: c.kind as ChallengeKind,
    payload: c.payload ? (JSON.parse(c.payload) as SignupPayload) : null,
    email: c.email,
  };
}

async function lock(id: string): Promise<VerifyResult> {
  await prisma.emailChallenge.update({ where: { id }, data: { attempts: MAX_ATTEMPTS } });
  return { ok: false, reason: "locked" };
}

export type ResendResult =
  | { ok: true }
  | { ok: false; reason: "missing" | "cooldown" | "limit" | "rate"; waitSeconds?: number };

/** Email a fresh code for the pending challenge (the old code stops working). */
export async function resendChallengeCode(): Promise<ResendResult> {
  const c = await currentChallenge();
  if (!c || !isUsable(c) || c.verifiedAt) return { ok: false, reason: "missing" };
  if (c.sendCount >= MAX_SENDS) return { ok: false, reason: "limit" };
  const wait = c.lastSentAt.getTime() + RESEND_COOLDOWN_MS - Date.now();
  if (wait > 0) return { ok: false, reason: "cooldown", waitSeconds: Math.ceil(wait / 1000) };

  const username =
    c.kind === "SIGNUP"
      ? (JSON.parse(c.payload ?? "{}") as SignupPayload).username
      : (await prisma.user.findUnique({ where: { id: c.userId ?? "" }, select: { username: true } }))?.username ?? "";

  const budget = await consumeEmailBudget(c.kind as ChallengeKind, c.email);
  if (!budget.ok) return { ok: false, reason: "rate" };

  const code = generateCode();
  const now = Date.now();
  // Guard on sendCount so two concurrent resends can't both go through.
  const { count } = await prisma.emailChallenge.updateMany({
    where: { id: c.id, sendCount: c.sendCount },
    data: {
      codeHash: hashCode(code, c.tokenHash, secret()),
      sendCount: { increment: 1 },
      lastSentAt: new Date(now),
      // Give the new code its full lifetime, but never extend a challenge past 30 minutes.
      expiresAt: new Date(Math.min(now + CHALLENGE_TTL_MS, c.createdAt.getTime() + 3 * CHALLENGE_TTL_MS)),
    },
  });
  if (!count) {
    await budget.refund();
    return { ok: false, reason: "cooldown", waitSeconds: Math.ceil(RESEND_COOLDOWN_MS / 1000) };
  }

  try {
    await sendEmail(codeEmail({ to: c.email, code, username, purpose: c.kind === "SIGNUP" ? "signup" : "login" }));
  } catch (err) {
    // The new code (probably) never arrived: put the previous code back so the
    // email the user already has keeps working, and let them retry right away.
    // sendEmail times out well within the resend cooldown, so no second resend
    // can have started in the meantime.
    try {
      await prisma.emailChallenge.updateMany({
        where: { id: c.id, sendCount: c.sendCount + 1 },
        data: { codeHash: c.codeHash, sendCount: c.sendCount, lastSentAt: c.lastSentAt, expiresAt: c.expiresAt },
      });
    } finally {
      await budget.refund();
    }
    throw err;
  }
  return { ok: true };
}

/**
 * Turn a just-verified challenge into a user id, exactly once. For sign-ups
 * this creates the account. Called only from the Auth.js credentials provider.
 * Returns null if the token is unknown, unverified, stale or already used.
 */
export async function redeemChallenge(token: string): Promise<string | null> {
  const c = await prisma.emailChallenge.findUnique({ where: { tokenHash: hashToken(token) } });
  if (!c?.verifiedAt || c.consumedAt) return null;
  if (c.verifiedAt.getTime() < Date.now() - REDEEM_WINDOW_MS) return null;

  return prisma.$transaction(async (tx) => {
    const { count } = await tx.emailChallenge.updateMany({
      where: { id: c.id, consumedAt: null },
      data: { consumedAt: new Date() },
    });
    if (!count) return null;

    if (c.kind === "LOGIN") {
      if (!c.userId) return null;
      const user = await tx.user.findUnique({ where: { id: c.userId }, select: { id: true } });
      return user?.id ?? null;
    }

    const p = JSON.parse(c.payload ?? "null") as SignupPayload | null;
    if (!p) return null;
    // Throws a unique-constraint error if the name/email was taken meanwhile,
    // which rolls back the consumption above.
    const user = await tx.user.create({
      data: {
        username: p.username,
        name: p.name,
        email: c.email,
        emailVerified: new Date(),
        passwordHash: p.passwordHash,
      },
    });
    return user.id;
  });
}
