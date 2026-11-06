import "server-only";
import { cache } from "react";
import { redirect } from "next/navigation";
import { connection } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/db";
import { accountStatus, isSiteAdmin, sessionIsValid } from "@/lib/moderation";

export type CurrentUser = {
  id: string;
  username: string;
  name: string | null;
  /** Site administrator: owner powers over every team, can moderate accounts. */
  siteAdmin: boolean;
};

/**
 * The signed-in user, read fresh from the database. Reads cookies, so callers
 * must render inside <Suspense>. Deduplicated per request.
 */
export const getCurrentUser = cache(async (): Promise<CurrentUser | null> => {
  // Auth.js may re-sign the session cookie (which uses crypto randomness), so
  // this must only run for a real request, never during (runtime) prerendering.
  await connection();
  const session = await auth();
  const id = session?.user?.id;
  if (!id) return null;
  const user = await prisma.user.findUnique({
    where: { id },
    select: {
      id: true,
      username: true,
      name: true,
      email: true,
      emailVerified: true,
      bannedAt: true,
      suspendedUntil: true,
      moderationReason: true,
      sessionsValidAfter: true,
    },
  });
  // Banned, suspended and signed-out-everywhere accounts count as signed out
  // on every page, action and API route, since they all come through here.
  if (!user) return null;
  if (accountStatus(user).state !== "active") return null;
  if (!sessionIsValid(session?.loginAt, user.sessionsValidAfter)) return null;
  return { id: user.id, username: user.username, name: user.name, siteAdmin: isSiteAdmin(user) };
});

/**
 * Require a signed-in user, redirecting to /login otherwise. `returnTo` is
 * where to come back after logging in.
 */
export async function requireUser(returnTo = "/"): Promise<CurrentUser> {
  const user = await getCurrentUser();
  if (!user) redirect(`/login?next=${encodeURIComponent(returnTo)}`);
  return user;
}

export { safeNext } from "./safe-next";
