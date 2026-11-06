"use server";

import { notFound, redirect } from "next/navigation";
import { refresh, revalidatePath } from "next/cache";
import { prisma } from "@/lib/db";
import { isSiteAdmin } from "@/lib/moderation";
import { requireUser } from "@/lib/session";
import { deleteTeamBlobs } from "@/lib/storage";
import { stripNul } from "@/lib/validation";
import type { FormState } from "./types";

// Site-admin moderation. Every action re-checks that the caller is a site
// admin, and site admins themselves can never be moderated.

async function requireSiteAdmin() {
  const admin = await requireUser("/admin");
  if (!admin.siteAdmin) notFound();
  return admin;
}

function field(formData: FormData, key: string): string {
  const v = formData.get(key);
  return typeof v === "string" ? v : "";
}

/** Load the account being moderated; refuses site admins (including yourself). */
async function target(formData: FormData) {
  await requireSiteAdmin();
  const user = await prisma.user.findUnique({ where: { id: field(formData, "userId") } });
  if (!user) return { error: "That account no longer exists." } as const;
  if (isSiteAdmin(user)) return { error: "Site admins can't be moderated." } as const;
  return { user } as const;
}

function reasonFrom(formData: FormData): string | null {
  const r = stripNul(field(formData, "reason")).trim().slice(0, 300);
  return r || null;
}

/** End every session and any half-finished sign-in for this account. */
async function signOutEverywhere(userId: string, now: Date) {
  await prisma.$transaction([
    prisma.user.update({ where: { id: userId }, data: { sessionsValidAfter: now } }),
    prisma.emailChallenge.deleteMany({ where: { userId, consumedAt: null } }),
  ]);
}

export async function banUser(_prev: FormState, formData: FormData): Promise<FormState> {
  const t = await target(formData);
  if ("error" in t) return { error: t.error };
  const now = new Date();
  await prisma.user.update({
    where: { id: t.user.id },
    data: { bannedAt: now, moderationReason: reasonFrom(formData) },
  });
  await signOutEverywhere(t.user.id, now);
  refresh();
  return { success: `@${t.user.username} is banned and has been signed out.` };
}

export async function unbanUser(_prev: FormState, formData: FormData): Promise<FormState> {
  const t = await target(formData);
  if ("error" in t) return { error: t.error };
  await prisma.user.update({
    where: { id: t.user.id },
    data: { bannedAt: null, moderationReason: t.user.suspendedUntil ? t.user.moderationReason : null },
  });
  refresh();
  return { success: `@${t.user.username} is no longer banned.` };
}

export async function suspendUser(_prev: FormState, formData: FormData): Promise<FormState> {
  const t = await target(formData);
  if ("error" in t) return { error: t.error };
  const raw = field(formData, "until");
  const until = /^\d{4}-\d{2}-\d{2}$/.test(raw) ? new Date(`${raw}T00:00:00Z`) : null;
  const now = new Date();
  if (!until || Number.isNaN(until.getTime()) || until <= now) {
    return { fieldErrors: { until: "Pick a date in the future." } };
  }
  if (until.getTime() > now.getTime() + 10 * 365 * 24 * 3600 * 1000) {
    return { fieldErrors: { until: "Suspensions can last at most 10 years. Ban the account instead." } };
  }
  await prisma.user.update({
    where: { id: t.user.id },
    data: { suspendedUntil: until, moderationReason: reasonFrom(formData) },
  });
  await signOutEverywhere(t.user.id, now);
  refresh();
  return { success: `@${t.user.username} is suspended until ${raw} (00:00 UTC) and has been signed out.` };
}

export async function liftSuspension(_prev: FormState, formData: FormData): Promise<FormState> {
  const t = await target(formData);
  if ("error" in t) return { error: t.error };
  await prisma.user.update({
    where: { id: t.user.id },
    data: { suspendedUntil: null, moderationReason: t.user.bannedAt ? t.user.moderationReason : null },
  });
  refresh();
  return { success: `@${t.user.username}'s suspension is lifted.` };
}

export async function forceSignOut(_prev: FormState, formData: FormData): Promise<FormState> {
  const t = await target(formData);
  if ("error" in t) return { error: t.error };
  await signOutEverywhere(t.user.id, new Date());
  refresh();
  return { success: `@${t.user.username} has been signed out everywhere.` };
}

/**
 * Permanently delete an account. Teams it owns (with their files) are deleted
 * too; its memberships, invites, requests and pending sign-ins go with it, and
 * files it uploaded to other teams stay, without an uploader.
 */
export async function deleteUser(_prev: FormState, formData: FormData): Promise<FormState> {
  const t = await target(formData);
  if ("error" in t) return { error: t.error };
  if (field(formData, "confirm").trim() !== t.user.username) {
    return { fieldErrors: { confirm: `Type "${t.user.username}" to confirm.` } };
  }
  const owned = await prisma.team.findMany({ where: { ownerId: t.user.id }, select: { id: true } });
  await prisma.$transaction([
    prisma.team.deleteMany({ where: { ownerId: t.user.id } }),
    prisma.user.delete({ where: { id: t.user.id } }),
  ]);
  for (const team of owned) {
    await deleteTeamBlobs(team.id).catch((err) => console.error("deleteUser: blob cleanup failed", err));
  }
  revalidatePath("/admin");
  // A fresh URL, so the list can't come from a copy of /admin prefetched before the delete.
  redirect(`/admin?deleted=${encodeURIComponent(t.user.username)}`);
}

const ACTIONS = {
  ban: banUser,
  unban: unbanUser,
  suspend: suspendUser,
  lift: liftSuspension,
  signout: forceSignOut,
  delete: deleteUser,
} as const;

/** Single entry point for the moderation panel, so one result message survives the page refresh. */
export async function moderateUser(prev: FormState, formData: FormData): Promise<FormState> {
  const op = field(formData, "op") as keyof typeof ACTIONS;
  const action = ACTIONS[op];
  if (!action) return { error: "Unknown action." };
  return action(prev, formData);
}
