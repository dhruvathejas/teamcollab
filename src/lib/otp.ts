// Pure helpers for emailed one-time codes (no database or framework imports,
// so they can be unit tested directly).
import { createHash, createHmac, randomBytes, randomInt, timingSafeEqual } from "node:crypto";

export const CODE_LENGTH = 6;
/** How long a code (and the whole challenge) stays valid. */
export const CHALLENGE_TTL_MS = 10 * 60 * 1000;
/** Wrong guesses allowed per challenge before it is locked. */
export const MAX_ATTEMPTS = 5;
/** Codes that can be sent for one challenge (the first + resends). */
export const MAX_SENDS = 5;
/** Minimum wait between sends for one challenge. */
export const RESEND_COOLDOWN_MS = 30 * 1000;
/** A verified challenge must be turned into a session within this window. */
export const REDEEM_WINDOW_MS = 2 * 60 * 1000;

/** A uniformly random numeric code, e.g. "042917". */
export function generateCode(): string {
  return randomInt(0, 10 ** CODE_LENGTH).toString().padStart(CODE_LENGTH, "0");
}

/** An unguessable token for the challenge cookie. */
export function generateToken(): string {
  return randomBytes(32).toString("base64url");
}

export function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

/**
 * Keyed hash of a code, bound to its challenge. With only 10^6 possible codes a
 * plain hash would be trivially reversible from a database dump; the server
 * secret prevents that.
 */
export function hashCode(code: string, challengeId: string, secret: string): string {
  return createHmac("sha256", secret).update(`${challengeId}:${code}`).digest("hex");
}

export function codeMatches(code: string, challengeId: string, secret: string, expectedHash: string): boolean {
  const actual = Buffer.from(hashCode(code, challengeId, secret), "hex");
  const expected = Buffer.from(expectedHash, "hex");
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}

/** Accept "123 456", "123-456" etc.; returns null unless exactly six digits remain. */
export function normalizeCode(input: unknown): string | null {
  if (typeof input !== "string") return null;
  const digits = input.replace(/[\s-]/g, "");
  return new RegExp(`^\\d{${CODE_LENGTH}}$`).test(digits) ? digits : null;
}

/** "satyaram@gmail.com" -> "sa••••••@gmail.com" */
export function maskEmail(email: string): string {
  const at = email.lastIndexOf("@");
  if (at < 1) return "•••";
  const local = email.slice(0, at);
  const shown = local.slice(0, Math.min(2, Math.max(1, local.length - 1)));
  return `${shown}${"•".repeat(Math.max(3, local.length - shown.length))}${email.slice(at)}`;
}
