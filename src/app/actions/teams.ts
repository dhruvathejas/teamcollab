"use server";

import { redirect } from "next/navigation";
import { refresh, revalidatePath } from "next/cache";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { README_MAX_CHARS, README_NAME } from "@/lib/files";
import { getLicense } from "@/lib/licenses";
import {
  canChangeRole,
  canDeleteFile,
  canLeave,
  canManageTeam,
  canRemoveMember,
  canRequestToJoin,
  canSetFileAccess,
  canWriteFiles,
  isFileAccess,
  isOwner,
  isRole,
  type Role,
} from "@/lib/permissions";
import { requireUser } from "@/lib/session";
import { deleteBlob, deleteTeamBlobs } from "@/lib/storage";
import { FileLockedError, defaultReadme, writeTeamFile } from "@/lib/team-files";
import { getMembershipRole, getRole } from "@/lib/teams";
import {
  createTeamSchema,
  descriptionSchema,
  fieldErrors,
  licenseSchema,
  teamNameSchema,
  usernameSchema,
  visibilitySchema,
} from "@/lib/validation";
import { stripNul } from "@/lib/validation";
import { adminProtectionBlocks, type AdminInfo } from "@/lib/admin-rules";
import { ADMIN_SELECT, adminInfoOf } from "@/lib/moderation";
import { pickValues, type FormState } from "./types";

function isUniqueViolation(err: unknown): boolean {
  return err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002";
}

/** Load a team by id and the acting user's role in it. */
async function teamAndRole(teamId: string) {
  const user = await requireUser();
  const team = await prisma.team.findUnique({ where: { id: teamId } });
  if (!team) throw new Error("Team not found.");
  const role = await getRole(team.id, user.id);
  return { user, team, role };
}

function str(formData: FormData, key: string): string {
  const v = formData.get(key);
  return typeof v === "string" ? v : "";
}

// ---------- Create & configure ----------

export async function createTeam(_prev: FormState, formData: FormData): Promise<FormState> {
  const user = await requireUser("/teams/new");
  const parsed = createTeamSchema.safeParse({
    name: str(formData, "name"),
    slug: str(formData, "slug"),
    description: str(formData, "description"),
    license: str(formData, "license"),
    visibility: str(formData, "visibility"),
    withReadme: formData.get("withReadme") === "on",
  });
  const values = {
    ...pickValues(formData, ["name", "slug", "description", "license", "visibility"]),
    withReadme: formData.get("withReadme") === "on" ? "on" : "off",
  };
  if (!parsed.success) return { fieldErrors: fieldErrors(parsed.error), values };
  const data = parsed.data;

  let teamId: string;
  try {
    const team = await prisma.team.create({
      data: {
        name: data.name,
        slug: data.slug,
        description: data.description,
        license: data.license,
        visibility: data.visibility,
        ownerId: user.id,
        memberships: { create: { userId: user.id, role: "OWNER" } },
      },
    });
    teamId = team.id;
  } catch (err) {
    if (isUniqueViolation(err)) return { fieldErrors: { slug: "That team URL is already taken." }, values };
    throw err;
  }

  if (data.withReadme) {
    const text = defaultReadme(data.name, data.description, getLicense(data.license).name);
    await writeTeamFile({
      teamId,
      name: README_NAME,
      data: new TextEncoder().encode(text),
      mimeType: "text/markdown",
      uploadedById: user.id,
      actorRole: "OWNER",
      visibility: data.visibility,
    });
  }

  redirect(`/t/${data.slug}`);
}

/**
 * Owners can change everything; admins can change only the description.
 */
export async function updateTeam(_prev: FormState, formData: FormData): Promise<FormState> {
  const { team, role } = await teamAndRole(str(formData, "teamId"));
  if (!canManageTeam(role)) return { error: "You don't have permission to change this team." };

  const values = pickValues(formData, ["name", "description", "license", "visibility"]);
  const description = descriptionSchema.safeParse(str(formData, "description"));
  if (!description.success) {
    return { fieldErrors: { description: description.error.issues[0].message }, values };
  }

  const data: Prisma.TeamUpdateInput = { description: description.data };

  if (isOwner(role)) {
    const name = teamNameSchema.safeParse(str(formData, "name"));
    const license = licenseSchema.safeParse(str(formData, "license"));
    const visibility = visibilitySchema.safeParse(str(formData, "visibility"));
    const errors: Record<string, string> = {};
    if (!name.success) errors.name = name.error.issues[0].message;
    if (!license.success) errors.license = license.error.issues[0].message;
    if (!visibility.success) errors.visibility = "Choose public or private.";
    if (Object.keys(errors).length) return { fieldErrors: errors, values };
    Object.assign(data, { name: name.data, license: license.data, visibility: visibility.data });
  }

  await prisma.team.update({ where: { id: team.id }, data });
  refresh();
  return { success: "Settings saved." };
}

export async function deleteTeam(_prev: FormState, formData: FormData): Promise<FormState> {
  const { team, role } = await teamAndRole(str(formData, "teamId"));
  if (!isOwner(role)) return { error: "Only the owner can delete this team." };
  if (str(formData, "confirm").trim() !== team.slug) {
    return { fieldErrors: { confirm: `Type "${team.slug}" to confirm.` } };
  }
  await prisma.team.delete({ where: { id: team.id } });
  // The team is gone; removing its files is best effort (a failure leaves orphans, not an error page).
  await deleteTeamBlobs(team.id).catch((err) => console.error("deleteTeam: blob cleanup failed", err));
  revalidatePath("/", "layout"); // the team must not reappear from the router cache
  redirect("/");
}

// ---------- Joining ----------

export async function requestToJoin(_prev: FormState, formData: FormData): Promise<FormState> {
  const { user, team, role } = await teamAndRole(str(formData, "teamId"));
  if (!canRequestToJoin(team.visibility, role)) {
    return { error: role ? "You're already a member." : "This team isn't accepting join requests." };
  }
  const [invite, existing] = await Promise.all([
    prisma.invite.findFirst({ where: { teamId: team.id, inviteeId: user.id, status: "PENDING" } }),
    prisma.joinRequest.findFirst({ where: { teamId: team.id, userId: user.id, status: "PENDING" } }),
  ]);
  if (invite) return { error: "You already have an invite to this team. Accept it from your dashboard." };
  if (existing) return { error: "Your request is already pending." };

  await prisma.joinRequest.create({
    data: { teamId: team.id, userId: user.id, message: stripNul(str(formData, "message")).trim().slice(0, 500) },
  });
  refresh();
  return { success: "Request sent. The team's owner or admins will review it." };
}

export async function cancelJoinRequest(formData: FormData) {
  const user = await requireUser();
  await prisma.joinRequest.updateMany({
    where: { id: str(formData, "requestId"), userId: user.id, status: "PENDING" },
    data: { status: "CANCELLED", reviewedAt: new Date() },
  });
  refresh();
}

export async function reviewJoinRequest(formData: FormData) {
  const request = await prisma.joinRequest.findUnique({ where: { id: str(formData, "requestId") } });
  if (!request || request.status !== "PENDING") return refresh();
  const { user, role } = await teamAndRole(request.teamId);
  if (!canManageTeam(role)) throw new Error("Not allowed.");

  const approve = str(formData, "decision") === "approve";
  await prisma.$transaction(async (tx) => {
    // Guard against a concurrent review of the same request.
    const { count } = await tx.joinRequest.updateMany({
      where: { id: request.id, status: "PENDING" },
      data: { status: approve ? "APPROVED" : "REJECTED", reviewedById: user.id, reviewedAt: new Date() },
    });
    if (!count || !approve) return;
    await addMember(tx, request.teamId, request.userId);
  });
  refresh();
}

// ---------- Invites ----------

export async function inviteMember(_prev: FormState, formData: FormData): Promise<FormState> {
  const { user, team, role } = await teamAndRole(str(formData, "teamId"));
  if (!canManageTeam(role)) return { error: "Only the owner and admins can invite people." };

  const values = pickValues(formData, ["username"]);
  const username = usernameSchema.safeParse(str(formData, "username").replace(/^@/, ""));
  if (!username.success) return { fieldErrors: { username: "Enter a valid username." }, values };

  const invitee = await prisma.user.findUnique({ where: { username: username.data } });
  if (!invitee) return { fieldErrors: { username: `No user named @${username.data}.` }, values };
  if (await getMembershipRole(team.id, invitee.id)) {
    return { fieldErrors: { username: `@${invitee.username} is already a member.` }, values };
  }
  const pending = await prisma.invite.findFirst({
    where: { teamId: team.id, inviteeId: invitee.id, status: "PENDING" },
  });
  if (pending) return { fieldErrors: { username: `@${invitee.username} already has a pending invite.` }, values };

  await prisma.invite.create({ data: { teamId: team.id, inviteeId: invitee.id, inviterId: user.id } });
  refresh();
  return { success: `Invited @${invitee.username}.` };
}

export async function revokeInvite(formData: FormData) {
  const invite = await prisma.invite.findUnique({ where: { id: str(formData, "inviteId") } });
  if (!invite || invite.status !== "PENDING") return refresh();
  const { role } = await teamAndRole(invite.teamId);
  if (!canManageTeam(role)) throw new Error("Not allowed.");
  await prisma.invite.update({
    where: { id: invite.id },
    data: { status: "REVOKED", respondedAt: new Date() },
  });
  refresh();
}

export async function respondToInvite(formData: FormData) {
  const user = await requireUser();
  const invite = await prisma.invite.findUnique({
    where: { id: str(formData, "inviteId") },
    include: { team: { select: { slug: true } } },
  });
  if (!invite || invite.inviteeId !== user.id || invite.status !== "PENDING") return refresh();

  const accept = str(formData, "decision") === "accept";
  const accepted = await prisma.$transaction(async (tx) => {
    const { count } = await tx.invite.updateMany({
      where: { id: invite.id, status: "PENDING" },
      data: { status: accept ? "ACCEPTED" : "DECLINED", respondedAt: new Date() },
    });
    if (!count || !accept) return false;
    await addMember(tx, invite.teamId, user.id);
    return true;
  });
  if (accepted) redirect(`/t/${invite.team.slug}`);
  refresh();
}

/** Add a member and close any other pending invites/requests for them. */
async function addMember(tx: Prisma.TransactionClient, teamId: string, userId: string, role: Role = "MEMBER") {
  await tx.membership.upsert({
    where: { teamId_userId: { teamId, userId } },
    create: { teamId, userId, role },
    update: {},
  });
  const now = new Date();
  await tx.invite.updateMany({
    where: { teamId, inviteeId: userId, status: "PENDING" },
    data: { status: "ACCEPTED", respondedAt: now },
  });
  await tx.joinRequest.updateMany({
    where: { teamId, userId, status: "PENDING" },
    data: { status: "APPROVED", reviewedAt: now },
  });
}

// ---------- Members ----------

/**
 * True if the actor may act on this member only through site-admin powers and
 * the member is an admin protected from that (see adminProtectionBlocks).
 */
async function blockedByAdminProtection(
  actor: { id: string; admin: AdminInfo },
  team: { ownerId: string },
  memberUserId: string,
): Promise<boolean> {
  if (!actor.admin) return false;
  const member = await prisma.user.findUnique({ where: { id: memberUserId }, select: ADMIN_SELECT });
  return adminProtectionBlocks(actor, team.ownerId === actor.id, { id: memberUserId, admin: adminInfoOf(member) });
}

export async function changeMemberRole(formData: FormData) {
  const membership = await prisma.membership.findUnique({ where: { id: str(formData, "membershipId") } });
  const next = str(formData, "role");
  if (!membership || !isRole(membership.role) || !isRole(next)) return refresh();
  const { user, team, role } = await teamAndRole(membership.teamId);
  if (!canChangeRole(role, membership.role, next as Role)) throw new Error("Not allowed.");
  if (await blockedByAdminProtection(user, team, membership.userId)) {
    throw new Error("This admin's team role can't be changed by other admins.");
  }
  await prisma.membership.update({ where: { id: membership.id }, data: { role: next } });
  refresh();
}

export async function removeMember(formData: FormData) {
  const membership = await prisma.membership.findUnique({ where: { id: str(formData, "membershipId") } });
  if (!membership || !isRole(membership.role)) return refresh();
  const { user, team, role } = await teamAndRole(membership.teamId);
  if (!canRemoveMember(role, membership.role)) throw new Error("Not allowed.");
  // Site admins who aren't the team's real owner act through admin powers here
  // (even after "Join as admin"), so a protected admin can't be kicked.
  if (await blockedByAdminProtection(user, team, membership.userId)) {
    throw new Error("This account can't be removed from teams by other admins.");
  }
  await prisma.membership.delete({ where: { id: membership.id } });
  refresh();
}

export async function leaveTeam(formData: FormData) {
  const { user, team } = await teamAndRole(str(formData, "teamId"));
  // Based on the real membership, so a site admin who joined can leave again.
  if (!canLeave(await getMembershipRole(team.id, user.id))) {
    throw new Error("The owner can't leave; delete the team instead.");
  }
  await prisma.membership.delete({ where: { teamId_userId: { teamId: team.id, userId: user.id } } });
  revalidatePath("/", "layout");
  redirect(team.visibility === "PUBLIC" ? `/t/${team.slug}` : "/");
}

/** Site admins can join any team directly, public or private, as an admin. */
export async function adminJoinTeam(formData: FormData) {
  const { user, team } = await teamAndRole(str(formData, "teamId"));
  if (!user.siteAdmin) throw new Error("Not allowed.");
  await prisma.$transaction((tx) => addMember(tx, team.id, user.id, "ADMIN"));
  refresh();
}

// ---------- Files ----------

export async function deleteFile(formData: FormData) {
  const file = await prisma.teamFile.findUnique({ where: { id: str(formData, "fileId") } });
  if (!file) return refresh();
  const { user, team, role } = await teamAndRole(file.teamId);
  if (!canDeleteFile(role, user.id, file.uploadedById, team.visibility, file.access)) throw new Error("Not allowed.");
  await prisma.teamFile.delete({ where: { id: file.id } });
  await deleteBlob(file.storageKey).catch((err) => console.error("deleteFile: blob cleanup failed", err));
  refresh();
}

/** Change who can open a file (uploader, owner or admins; see canSetFileAccess). */
export async function setFileAccess(formData: FormData) {
  const file = await prisma.teamFile.findUnique({ where: { id: str(formData, "fileId") } });
  const next = str(formData, "access");
  if (!file || !isFileAccess(next) || file.access === next) return refresh();
  const { user, team, role } = await teamAndRole(file.teamId);
  if (!canSetFileAccess(role, user.id, file.uploadedById, team.visibility, file.access, next)) {
    throw new Error("Not allowed.");
  }
  // Guard on the old level so a concurrent change isn't silently overwritten.
  await prisma.teamFile.updateMany({ where: { id: file.id, access: file.access }, data: { access: next } });
  refresh();
}

export async function saveReadme(_prev: FormState, formData: FormData): Promise<FormState> {
  const { user, team, role } = await teamAndRole(str(formData, "teamId"));
  if (!canWriteFiles(role)) {
    return { error: "Only team members can edit the README.", values: pickValues(formData, ["content"]) };
  }
  const content = str(formData, "content");
  if (content.length > README_MAX_CHARS) {
    return { fieldErrors: { content: "README is too long (100,000 characters max)." }, values: { content } };
  }
  try {
    await writeTeamFile({
      teamId: team.id,
      name: README_NAME,
      data: new TextEncoder().encode(content),
      mimeType: "text/markdown",
      uploadedById: user.id,
      actorRole: role!,
      visibility: team.visibility,
    });
  } catch (err) {
    if (err instanceof FileLockedError) {
      return { error: "The README is restricted; you can't edit it.", values: { content } };
    }
    throw err;
  }
  redirect(`/t/${team.slug}`);
}
