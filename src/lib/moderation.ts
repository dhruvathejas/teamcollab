// Pure rules for site administration and account moderation (unit-tested).
import type { AdminInfo } from "./admin-rules";

/** Used when SITE_ADMIN_EMAILS isn't set. */
export const DEFAULT_SITE_ADMIN_EMAILS = "dhruvathejasb@gmail.com";

export function siteAdminEmails(configured = process.env.SITE_ADMIN_EMAILS): Set<string> {
  const list = (configured ?? DEFAULT_SITE_ADMIN_EMAILS).split(",");
  return new Set(list.map((e) => e.trim().toLowerCase()).filter(Boolean));
}

/**
 * Root admins are identified by email, but only once that email has been
 * verified with an emailed code (every account's is, at sign-up), so nobody
 * can claim admin rights by typing someone else's address.
 */
export function isRootAdmin(
  user: { email: string; emailVerified: Date | null } | null | undefined,
  admins = siteAdminEmails(),
): boolean {
  return Boolean(user?.emailVerified) && admins.has(user!.email.toLowerCase());
}

type AdminSource = {
  email: string;
  emailVerified: Date | null;
  adminGrant?: {
    canAddAdmins: boolean;
    suspendable: boolean;
    bannable: boolean;
    deletable: boolean;
    addedById: string | null;
  } | null;
};

/** Root (SITE_ADMIN_EMAILS), granted (SiteAdmin row), or not an admin. */
export function adminInfoOf(user: AdminSource | null | undefined, admins = siteAdminEmails()): AdminInfo {
  if (!user) return null;
  if (isRootAdmin(user, admins)) return { kind: "root" };
  const g = user.adminGrant;
  if (!g) return null;
  return {
    kind: "granted",
    addedById: g.addedById,
    canAddAdmins: g.canAddAdmins,
    suspendable: g.suspendable,
    bannable: g.bannable,
    deletable: g.deletable,
  };
}

/** Prisma select for everything adminInfoOf needs. */
export const ADMIN_SELECT = {
  email: true,
  emailVerified: true,
  adminGrant: {
    select: { canAddAdmins: true, suspendable: true, bannable: true, deletable: true, addedById: true },
  },
} as const;

export type AccountStatus =
  | { state: "active" }
  | { state: "banned"; reason: string | null }
  | { state: "suspended"; until: Date; reason: string | null };

type Moderated = { bannedAt: Date | null; suspendedUntil: Date | null; moderationReason: string | null };

export function accountStatus(u: Moderated, now = new Date()): AccountStatus {
  if (u.bannedAt) return { state: "banned", reason: u.moderationReason };
  if (u.suspendedUntil && u.suspendedUntil > now) {
    return { state: "suspended", until: u.suspendedUntil, reason: u.moderationReason };
  }
  return { state: "active" };
}

/** Message shown at login to a banned or suspended account. */
export function blockedMessage(status: AccountStatus): string | null {
  if (status.state === "active") return null;
  const why = status.reason ? ` Reason: ${status.reason}` : "";
  if (status.state === "banned") return `This account has been banned.${why}`;
  const until = status.until.toLocaleString("en", { dateStyle: "medium", timeStyle: "short", timeZone: "UTC" });
  return `This account is suspended until ${until} UTC.${why}`;
}

/**
 * A session stays valid unless the account was signed out everywhere after the
 * session began. Sessions from before this field existed have no loginAt.
 */
export function sessionIsValid(loginAt: number | undefined, sessionsValidAfter: Date | null): boolean {
  if (!sessionsValidAfter) return true;
  return typeof loginAt === "number" && loginAt > sessionsValidAfter.getTime();
}
