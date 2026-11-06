import "server-only";
import { cache } from "react";
import { prisma } from "@/lib/db";
import { canViewTeam, isRole, type Role } from "@/lib/permissions";

export async function getRole(teamId: string, userId: string | undefined): Promise<Role | null> {
  if (!userId) return null;
  const m = await prisma.membership.findUnique({
    where: { teamId_userId: { teamId, userId } },
    select: { role: true },
  });
  return m && isRole(m.role) ? m.role : null;
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

  const [role, pendingInvite, pendingRequest] = userId
    ? await Promise.all([
        getRole(team.id, userId),
        prisma.invite.findFirst({
          where: { teamId: team.id, inviteeId: userId, status: "PENDING" },
          select: { id: true },
        }),
        prisma.joinRequest.findFirst({
          where: { teamId: team.id, userId, status: "PENDING" },
          select: { id: true },
        }),
      ])
    : [null, null, null];

  if (!canViewTeam(team.visibility, role, Boolean(pendingInvite))) return null;
  return { team, role, pendingInvite, pendingRequest };
});

export type TeamView = NonNullable<Awaited<ReturnType<typeof getTeamForViewer>>>;
