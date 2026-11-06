// Pure authorization rules. Every server action and route handler checks these
// against the database state; the UI uses them only to hide controls.

export type Role = "OWNER" | "ADMIN" | "MEMBER";
export type Visibility = "PUBLIC" | "PRIVATE";

const rank: Record<Role, number> = { MEMBER: 1, ADMIN: 2, OWNER: 3 };

export function isRole(value: string): value is Role {
  return value === "OWNER" || value === "ADMIN" || value === "MEMBER";
}

/** Who can see a team page and download its files. */
export function canViewTeam(
  visibility: string,
  role: Role | null,
  hasPendingInvite = false,
): boolean {
  return visibility === "PUBLIC" || role !== null || hasPendingInvite;
}

/** Invite people, approve/reject join requests, edit the description. */
export function canManageTeam(role: Role | null): boolean {
  return role === "OWNER" || role === "ADMIN";
}

/** Change license, visibility, name; delete the team; promote/demote admins. */
export function isOwner(role: Role | null): boolean {
  return role === "OWNER";
}

/** Upload files and edit the README. */
export function canWriteFiles(role: Role | null): boolean {
  return role !== null;
}

/** Uploader can delete their own file; owners/admins can delete any. */
export function canDeleteFile(
  role: Role | null,
  actorId: string,
  uploadedById: string | null,
): boolean {
  if (role === null) return false;
  return canManageTeam(role) || uploadedById === actorId;
}

/**
 * Remove another member. Owners can remove anyone but themselves; admins can
 * remove plain members only. Nobody removes the owner.
 */
export function canRemoveMember(actor: Role | null, target: Role): boolean {
  if (!canManageTeam(actor) || target === "OWNER") return false;
  return rank[actor as Role] > rank[target];
}

/** Only the owner can promote a member to admin or demote an admin. */
export function canChangeRole(
  actor: Role | null,
  target: Role,
  next: Role,
): boolean {
  if (!isOwner(actor)) return false;
  if (target === "OWNER" || next === "OWNER") return false;
  return target !== next;
}

/** Anyone except the owner can leave (the owner must delete the team). */
export function canLeave(role: Role | null): boolean {
  return role !== null && role !== "OWNER";
}

/** Only public teams accept join requests, and only from non-members. */
export function canRequestToJoin(visibility: string, role: Role | null): boolean {
  return visibility === "PUBLIC" && role === null;
}
