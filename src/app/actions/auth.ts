"use server";

import bcrypt from "bcryptjs";
import { redirect } from "next/navigation";
import { AuthError } from "next-auth";
import { signIn, signOut } from "@/auth";
import {
  RateLimitError,
  clearChallengeCookie,
  readChallengeToken,
  resendChallengeCode,
  startChallenge,
  verifyChallengeCode,
} from "@/lib/challenges";
import { prisma } from "@/lib/db";
import { accountStatus, blockedMessage } from "@/lib/moderation";
import { normalizeCode } from "@/lib/otp";
import { clientIp, consume, limits } from "@/lib/rate-limit";
import { safeNext } from "@/lib/session";
import { fieldErrors, signupSchema, usernameSchema } from "@/lib/validation";
import { pickValues, type FormState } from "./types";

// Compared against when the username doesn't exist, so a wrong username takes
// as long as a wrong password and doesn't reveal which accounts exist.
const DUMMY_HASH = "$2b$12$7hjqIRdVrNU9Fygp5X6pKO72.iH4XW2kdSy3ueuK3Zv3J.0Ea4Rb6";

const TOO_MANY_ATTEMPTS = "Too many attempts from your network. Please wait 15 minutes and try again.";

function rateLimitMessage(err: RateLimitError): string {
  return err.reason === "failures"
    ? "Too many wrong codes were entered for this account. Please try again tomorrow."
    : "Too many codes were requested. Please wait a few minutes and try again.";
}

/** Throttle login/sign-up submissions per IP, before any password hashing. */
async function allowAttempt(): Promise<boolean> {
  return consume(limits.authAttemptsPerIp(await clientIp()));
}
const EMAIL_FAILED = "We couldn't send the verification email. Please try again in a moment.";

function verifyUrl(next: string): string {
  return next === "/" ? "/verify" : `/verify?next=${encodeURIComponent(next)}`;
}

/** Step 1 of sign-up: validate the form and email a code. The account is created after verification. */
export async function signup(_prev: FormState, formData: FormData): Promise<FormState> {
  const values = pickValues(formData, ["username", "email", "name"]);
  const parsed = signupSchema.safeParse({
    username: formData.get("username"),
    email: formData.get("email"),
    name: formData.get("name") ?? "",
    password: formData.get("password"),
    confirmPassword: formData.get("confirmPassword"),
  });
  if (!parsed.success) return { fieldErrors: fieldErrors(parsed.error), values };
  const { username, email, name, password } = parsed.data;
  if (!(await allowAttempt())) return { error: TOO_MANY_ATTEMPTS, values };

  const [byName, byEmail] = await Promise.all([
    prisma.user.findUnique({ where: { username }, select: { id: true } }),
    prisma.user.findUnique({ where: { email }, select: { id: true } }),
  ]);
  const taken: Record<string, string> = {};
  if (byName) taken.username = "That username is already taken.";
  if (byEmail) taken.email = "An account with this email already exists. Log in instead.";
  if (byName || byEmail) return { fieldErrors: taken, values };

  try {
    await startChallenge({
      kind: "SIGNUP",
      email,
      username,
      payload: { username, name: name || null, passwordHash: await bcrypt.hash(password, 12) },
    });
  } catch (err) {
    if (err instanceof RateLimitError) return { error: rateLimitMessage(err), values };
    console.error("signup: failed to send code", err);
    return { error: EMAIL_FAILED, values };
  }
  redirect(verifyUrl(safeNext(formData.get("next"))));
}

/** Step 1 of login: check the password and email a code. */
export async function login(_prev: FormState, formData: FormData): Promise<FormState> {
  const values = pickValues(formData, ["username"]);
  if (!(await allowAttempt())) return { error: TOO_MANY_ATTEMPTS, values };
  const username = usernameSchema.safeParse(formData.get("username"));
  const password = formData.get("password");
  const user = username.success
    ? await prisma.user.findUnique({
        where: { username: username.data },
        select: {
          id: true,
          username: true,
          email: true,
          passwordHash: true,
          bannedAt: true,
          suspendedUntil: true,
          moderationReason: true,
        },
      })
    : null;
  const passwordOk = await bcrypt.compare(
    typeof password === "string" ? password : "",
    user?.passwordHash ?? DUMMY_HASH,
  );
  if (!user || !passwordOk) return { error: "Incorrect username or password.", values };
  // Only revealed after the correct password, so it doesn't leak who is banned.
  const blocked = blockedMessage(accountStatus(user));
  if (blocked) return { error: blocked, values };

  try {
    await startChallenge({ kind: "LOGIN", email: user.email, username: user.username, userId: user.id });
  } catch (err) {
    if (err instanceof RateLimitError) return { error: rateLimitMessage(err), values };
    console.error("login: failed to send code", err);
    return { error: EMAIL_FAILED, values };
  }
  redirect(verifyUrl(safeNext(formData.get("next"))));
}

/** Step 2: check the emailed code and, if right, issue the session. */
export async function verifyCode(_prev: FormState, formData: FormData): Promise<FormState> {
  const code = normalizeCode(formData.get("code"));
  if (!code) return { fieldErrors: { code: "Enter the 6-digit code from the email." } };

  const result = await verifyChallengeCode(code);
  if (!result.ok) {
    switch (result.reason) {
      case "invalid":
        return {
          fieldErrors: {
            code: `That code isn't right. ${result.attemptsLeft} attempt${result.attemptsLeft === 1 ? "" : "s"} left.`,
          },
        };
      case "locked":
        return { error: "Too many wrong codes. Please start over.", fieldErrors: { restart: "1" } };
      default:
        return { error: "This code has expired. Please start over.", fieldErrors: { restart: "1" } };
    }
  }

  if (result.kind === "SIGNUP" && result.payload) {
    // Re-check: someone may have registered the name or email since step 1.
    const conflict = await prisma.user.findFirst({
      where: { OR: [{ username: result.payload.username }, { email: result.email }] },
      select: { id: true },
    });
    if (conflict) {
      await clearChallengeCookie();
      return {
        error: "That username or email was registered by someone else in the meantime. Please sign up again.",
        fieldErrors: { restart: "1" },
      };
    }
  }

  const token = (await readChallengeToken()) ?? "";
  try {
    await signIn("email-code", { token, redirectTo: safeNext(formData.get("next")) });
  } catch (err) {
    if (err instanceof AuthError) {
      return { error: "We couldn't sign you in. Please start over.", fieldErrors: { restart: "1" } };
    }
    // Success: signIn throws a redirect. The challenge is single-use, so drop its cookie.
    await clearChallengeCookie();
    throw err;
  }
  return {};
}

export async function resendCode(): Promise<FormState> {
  try {
    const result = await resendChallengeCode();
    if (result.ok) return { success: "We sent a new code. Codes from earlier emails no longer work." };
    if (result.reason === "cooldown") return { error: `Please wait ${result.waitSeconds}s before requesting another code.` };
    if (result.reason === "limit") return { error: "No more codes can be sent for this attempt. Please start over." };
    if (result.reason === "rate") return { error: "Too many codes were requested. Please wait a few minutes and try again." };
    return { error: "This sign-in attempt has expired. Please start over.", fieldErrors: { restart: "1" } };
  } catch (err) {
    console.error("resend: failed to send code", err);
    return { error: "We couldn't send a new code. The code from your earlier email still works, or try again in a moment." };
  }
}

/** Abandon the pending code step and go back to the form it came from, keeping next=. */
export async function cancelVerification(formData: FormData) {
  await clearChallengeCookie();
  const next = safeNext(formData.get("next"));
  const page = formData.get("kind") === "SIGNUP" ? "/signup" : "/login";
  redirect(next === "/" ? page : `${page}?next=${encodeURIComponent(next)}`);
}

export async function logout() {
  await signOut({ redirectTo: "/" });
}
