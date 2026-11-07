"use server";

import { notFound, redirect } from "next/navigation";
import { refresh, revalidatePath } from "next/cache";
import { prisma } from "@/lib/db";
import { Prisma } from "@prisma/client";
import {
  canLiftRestriction,
  canMakeAdmin,
  canManageAdmin,
  canModerate,
  grantError,
  resolveOptions,
  type AdminOptions,
  type ModerationAction,
  type Person,
} from "@/lib/admin-rules";
import { adminInfoOf } from "@/lib/moderation";
import { requireUser } from "@/lib/session";
import { deleteTeamBlobs } from "@/lib/storage";
import { stripNul } from "@/lib/validation";
import type { FormState } from "./types";

// Site-admin moderation and admin management. Every action re-checks the
// caller's admin rights against the target's current state in the database,
// using the rules in src/lib/admin-rules.ts.

async function requireSiteAdmin() {
  const admin = await requireUser("/admin");
  if (!admin.siteAdmin) notFound();
  return admin;
}

function field(formData: FormData, key: string): string {
  const v = formData.get(key);
  return typeof v === "string" ? v : "";
}

/** The account an action targets, as a rules Person plus its row. */
async function loadTarget(formData: FormData) {
  const user = await prisma.user.findUnique({
    where: { id: field(formData, "userId") },
    include: { adminGrant: true },
  });
  if (!user) return null;
  const person: Person = { id: user.id, admin: adminInfoOf({ ...user, adminGrant: user.adminGrant }) };
  return { user, person };
}

const REFUSED: Record<ModerationAction, string> = {
  suspend: "This account can't be suspended.",
  ban: "This account can't be banned.",
  delete: "This account can't be deleted.",
  signout: "This account can't be signed out by other admins.",
  removeFromTeam: "This account can't be removed from teams by other admins.",
};

/** Load the account to moderate and check `action` is allowed on it. */
async function target(formData: FormData, action: ModerationAction) {
  const admin = await requireSiteAdmin();
  const t = await loadTarget(formData);
  if (!t) return { error: "That account no longer exists." } as const;
  if (!canModerate({ id: admin.id, admin: admin.admin }, t.person, action)) {
    return { error: t.user.id === admin.id ? "You can't moderate your own account." : REFUSED[action] } as const;
  }
  return { user: t.user } as const;
}

/** Load the account whose ban or suspension is being lifted (canLiftRestriction). */
async function liftTarget(formData: FormData) {
  const admin = await requireSiteAdmin();
  const t = await loadTarget(formData);
  if (!t) return { error: "That account no longer exists." } as const;
  if (!canLiftRestriction({ id: admin.id, admin: admin.admin }, t.person)) {
    return { error: "You can't change your own account's restrictions." } as const;
  }
  return { user: t.user } as const;
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
  const t = await target(formData, "ban");
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
  const t = await liftTarget(formData);
  if ("error" in t) return { error: t.error };
  await prisma.user.update({
    where: { id: t.user.id },
    data: { bannedAt: null, moderationReason: t.user.suspendedUntil ? t.user.moderationReason : null },
  });
  refresh();
  return { success: `@${t.user.username} is no longer banned.` };
}

export async function suspendUser(_prev: FormState, formData: FormData): Promise<FormState> {
  const t = await target(formData, "suspend");
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
  const t = await liftTarget(formData);
  if ("error" in t) return { error: t.error };
  await prisma.user.update({
    where: { id: t.user.id },
    data: { suspendedUntil: null, moderationReason: t.user.bannedAt ? t.user.moderationReason : null },
  });
  refresh();
  return { success: `@${t.user.username}'s suspension is lifted.` };
}

export async function forceSignOut(_prev: FormState, formData: FormData): Promise<FormState> {
  const t = await target(formData, "signout");
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
  const t = await target(formData, "delete");
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

// ---------- Admins ----------

function optionsFrom(formData: FormData): AdminOptions {
  const on = (k: string) => formData.get(k) === "on";
  return {
    canAddAdmins: on("canAddAdmins"),
    suspendable: on("suspendable"),
    bannable: on("bannable"),
    deletable: on("deletable"),
  };
}

export async function makeAdmin(_prev: FormState, formData: FormData): Promise<FormState> {
  const admin = await requireSiteAdmin();
  const actor: Person = { id: admin.id, admin: admin.admin };
  const t = await loadTarget(formData);
  if (!t) return { error: "That account no longer exists." };
  if (!canMakeAdmin(actor, t.person)) {
    return { error: t.person.admin ? `@${t.user.username} is already an admin.` : "You can't add admins." };
  }
  const options = resolveOptions(actor, optionsFrom(formData), null);
  const problem = grantError(actor, options);
  if (problem) return { error: problem };
  try {
    await prisma.siteAdmin.create({ data: { userId: t.user.id, addedById: admin.id, ...options } });
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
      return { error: `@${t.user.username} is already an admin.` };
    }
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2003") {
      return { error: "That account no longer exists." };
    }
    throw err;
  }
  refresh();
  return { success: `@${t.user.username} is now an admin.` };
}

export async function updateAdmin(_prev: FormState, formData: FormData): Promise<FormState> {
  const admin = await requireSiteAdmin();
  const actor: Person = { id: admin.id, admin: admin.admin };
  const t = await loadTarget(formData);
  if (!t) return { error: "That account no longer exists." };
  if (!t.user.adminGrant) return { error: `@${t.user.username} is no longer an admin. Reload the page.` };
  if (!canManageAdmin(actor, t.person)) return { error: "Only the admin who added them, or a root admin, can change this admin." };
  // Protections the actor can't grant keep their stored value, so a stale form
  // can't silently undo a change someone with more rights just made.
  const options = resolveOptions(actor, optionsFrom(formData), t.user.adminGrant);
  const problem = grantError(actor, options, t.user.adminGrant);
  if (problem) return { error: problem };
  const { count } = await prisma.siteAdmin.updateMany({ where: { userId: t.user.id }, data: options });
  if (!count) return { error: `@${t.user.username} is no longer an admin. Reload the page.` };
  refresh();
  return { success: `Saved @${t.user.username}'s admin options.` };
}

export async function removeAdmin(_prev: FormState, formData: FormData): Promise<FormState> {
  const admin = await requireSiteAdmin();
  const t = await loadTarget(formData);
  if (!t) return { error: "That account no longer exists." };
  if (!t.user.adminGrant) return { error: `@${t.user.username} is no longer an admin.` };
  if (!canManageAdmin({ id: admin.id, admin: admin.admin }, t.person)) {
    return { error: "Only the admin who added them, or a root admin, can remove this admin." };
  }
  // Their appointees now answer to whoever removed them, so being made admin
  // again later doesn't hand back control over them.
  await prisma.$transaction([
    prisma.siteAdmin.updateMany({ where: { addedById: t.user.id }, data: { addedById: admin.id } }),
    prisma.siteAdmin.deleteMany({ where: { userId: t.user.id } }),
  ]);
  refresh();
  return { success: `@${t.user.username} is no longer an admin.` };
}

const ACTIONS = {
  ban: banUser,
  unban: unbanUser,
  suspend: suspendUser,
  lift: liftSuspension,
  signout: forceSignOut,
  delete: deleteUser,
  "make-admin": makeAdmin,
  "update-admin": updateAdmin,
  "remove-admin": removeAdmin,
} as const;

/** Single entry point for the moderation panel, so one result message survives the page refresh. */
export async function moderateUser(prev: FormState, formData: FormData): Promise<FormState> {
  const op = field(formData, "op") as keyof typeof ACTIONS;
  const action = ACTIONS[op];
  if (!action) return { error: "Unknown action." };
  return action(prev, formData);
}
