// Who is a site admin, and what admins may do to each other. Pure rules
// (no database), unit-tested in tests/admin-rules.test.ts.
//
// Two kinds of admin:
// - "root": listed in SITE_ADMIN_EMAILS (verified email). Every power, can't be
//   suspended, banned, deleted or removed, and can manage every other admin.
// - "granted": made an admin by another admin, with four options chosen at
//   the time: can add admins; can be suspended / banned / deleted.

export type AdminOptions = {
  canAddAdmins: boolean;
  suspendable: boolean;
  bannable: boolean;
  deletable: boolean;
};

export type AdminInfo =
  | { kind: "root" }
  | ({ kind: "granted"; addedById: string | null } & AdminOptions)
  | null;

export type Person = { id: string; admin: AdminInfo };

export type ModerationAction = "suspend" | "ban" | "delete" | "signout" | "removeFromTeam";

export const ROOT_OPTIONS: AdminOptions = { canAddAdmins: true, suspendable: false, bannable: false, deletable: false };

export function isAdmin(p: Person | null | undefined): boolean {
  return Boolean(p?.admin);
}

/** The effective options of an admin (root admins have every power and protection). */
export function optionsOf(info: AdminInfo): AdminOptions | null {
  if (!info) return null;
  if (info.kind === "root") return ROOT_OPTIONS;
  const { canAddAdmins, suspendable, bannable, deletable } = info;
  return { canAddAdmins, suspendable, bannable, deletable };
}

export function canAddAdmins(actor: Person): boolean {
  return Boolean(optionsOf(actor.admin)?.canAddAdmins);
}

/**
 * Options an actor may hand out: never more than they have themselves. An
 * actor who can be banned can't give an admin protection from bans. When
 * editing, a protection the admin already has may be kept even if the editor
 * couldn't grant it (someone with more rights gave it); it can't be added.
 */
export function grantError(actor: Person, wanted: AdminOptions, current?: AdminOptions | null): string | null {
  const mine = optionsOf(actor.admin);
  if (!mine?.canAddAdmins) return "You can't add or edit admins.";
  const adds = (key: "suspendable" | "bannable" | "deletable") => !wanted[key] && (current ? current[key] : true);
  if (adds("suspendable") && mine.suspendable) return "You can't protect an admin from suspension, because you can be suspended yourself.";
  if (adds("bannable") && mine.bannable) return "You can't protect an admin from bans, because you can be banned yourself.";
  if (adds("deletable") && mine.deletable) return "You can't protect an admin from deletion, because your account can be deleted yourself.";
  return null;
}

/** Which protections the actor is allowed to grant (for the form's checkboxes). */
export function grantableProtections(actor: Person): { suspend: boolean; ban: boolean; delete: boolean } {
  const mine = optionsOf(actor.admin);
  return {
    suspend: Boolean(mine && !mine.suspendable),
    ban: Boolean(mine && !mine.bannable),
    delete: Boolean(mine && !mine.deletable),
  };
}

/** Make a non-admin into an admin. */
export function canMakeAdmin(actor: Person, target: Person): boolean {
  return canAddAdmins(actor) && actor.id !== target.id && !target.admin;
}

/**
 * Change an admin's options or remove their admin rights: the admin who added
 * them, or a root admin. Root admins can't be managed; nobody manages
 * themselves. The actor must still be able to add admins.
 */
export function canManageAdmin(actor: Person, target: Person): boolean {
  if (!canAddAdmins(actor) || actor.id === target.id) return false;
  if (target.admin?.kind !== "granted") return false;
  return actor.admin?.kind === "root" || target.admin.addedById === actor.id;
}

/**
 * Moderate an account. Any admin may moderate ordinary accounts. An admin may
 * be moderated only as their options allow ("sign out everywhere" and "remove
 * from a team" follow "can be suspended"); root admins never. Nobody moderates
 * themselves.
 */
export function canModerate(actor: Person, target: Person, action: ModerationAction): boolean {
  if (!actor.admin || actor.id === target.id) return false;
  if (!target.admin) return true;
  if (target.admin.kind === "root") return false;
  switch (action) {
    case "ban":
      return target.admin.bannable;
    case "delete":
      return target.admin.deletable;
    case "suspend":
    case "signout":
    case "removeFromTeam":
      return target.admin.suspendable;
  }
}

/**
 * Undoing a ban or suspension only helps the target, so any admin may do it
 * for anyone but themselves, even when the target is protected from new ones
 * (e.g. given protection while already banned).
 */
export function canLiftRestriction(actor: Person, target: Person): boolean {
  return Boolean(actor.admin) && actor.id !== target.id;
}

/**
 * Team actions (removing someone, changing their team role) normally follow
 * team rules. When the actor is a site admin and isn't the team's real owner,
 * their powers there come from being a site admin (including a membership they
 * gave themselves with "Join as admin"), so an admin target's protections
 * apply: removal needs canModerate(…, "removeFromTeam").
 */
export function adminProtectionBlocks(actor: Person, actorIsTeamOwner: boolean, target: Person): boolean {
  if (!actor.admin || actorIsTeamOwner || !target.admin) return false;
  return !canModerate(actor, target, "removeFromTeam");
}

/**
 * The options to store. Protections the actor can't grant aren't theirs to
 * change: they keep the stored value (new admins: unprotected), whatever the
 * form sent, so a stale or crafted form can't strip or add them.
 */
export function resolveOptions(actor: Person, submitted: AdminOptions, current?: AdminOptions | null): AdminOptions {
  const mine = optionsOf(actor.admin);
  const keep = (key: "suspendable" | "bannable" | "deletable") =>
    mine && !mine[key] ? submitted[key] : current ? current[key] : true;
  return {
    canAddAdmins: submitted.canAddAdmins,
    suspendable: keep("suspendable"),
    bannable: keep("bannable"),
    deletable: keep("deletable"),
  };
}
