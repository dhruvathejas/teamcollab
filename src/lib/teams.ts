import "server-only";
import { cache } from "react";
import { prisma } from "@/lib/db";
import { ADMIN_SELECT, adminInfoOf } from "@/lib/moderation";
import { canViewTeam, isRole, type Role } from "@/lib/permissions";

/** The user's actual membership role in the team, ignoring site-admin powers. */
export async function getMembershipRole(teamId: string, userId: string | undefined): Promise<Role | null> {
  if (!userId) return null;
  const m = await prisma.membership.findUnique({
    where: { teamId_userId: { teamId, userId } },
    select: { role: true },
  });
  return m && isRole(m.role) ? m.role : null;
}

/**
 * The role used for permission checks: the membership role, except that site
 * admins act as the owner of every team (see src/lib/moderation.ts).
 */
export async function getRole(teamId: string, userId: string | undefined): Promise<Role | null> {
  if (!userId) return null;
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      ...ADMIN_SELECT,
      memberships: { where: { teamId }, select: { role: true } },
    },
  });
  if (!user) return null;
  if (adminInfoOf(user)) return "OWNER";
  const role = user.memberships[0]?.role;
  return role && isRole(role) ? role : null;
}

/**
 * Load a team for the given viewer, or null if it doesn't exist or the viewer
 * may not see it (private teams are visible to members and invitees only).
 */
export const getTeamForViewer = cache(async (slug: string, userId: string | undefined) => {
  const team = await prisma.team.findUnique({
    where: { slug },
    include: {
      owner: { select: { username: true, name: true } },
      _count: { select: { memberships: true, files: true } },
    },
  });
  if (!team) return null;

  const [role, memberRole, pendingInvite, pendingRequest] = userId
    ? await Promise.all([
        getRole(team.id, userId),
        getMembershipRole(team.id, userId),
        prisma.invite.findFirst({
          where: { teamId: team.id, inviteeId: userId, status: "PENDING" },
          select: { id: true },
        }),
        prisma.joinRequest.findFirst({
          where: { teamId: team.id, userId, status: "PENDING" },
          select: { id: true },
        }),
      ])
    : [null, null, null, null];

  if (!canViewTeam(team.visibility, role, Boolean(pendingInvite))) return null;
  return {
    team,
    /** Effective role for permission checks (site admins: OWNER). */
    role,
    /** Actual membership role, or null if not a member. */
    memberRole,
    /** Viewer has owner powers here only because they are a site admin. */
    viaSiteAdmin: role === "OWNER" && memberRole !== "OWNER",
    pendingInvite,
    pendingRequest,
  };
});

export type TeamView = NonNullable<Awaited<ReturnType<typeof getTeamForViewer>>>;
