import { prisma } from "@/lib/db";
import { canAccessFile, canViewTeam } from "@/lib/permissions";
import { getCurrentUser } from "@/lib/session";
import { downloadResponse } from "@/lib/storage";
import { getRole } from "@/lib/teams";

// Download a team file, subject to the team's visibility and the file's own
// access level (canAccessFile). Disk storage streams the bytes as an
// attachment; Blob storage redirects to a one-minute presigned URL on Vercel's
// blob domain. Either way uploaded HTML/SVG can't run on this origin.
export async function GET(_request: Request, ctx: RouteContext<"/api/files/[fileId]">) {
  const { fileId } = await ctx.params;
  const file = await prisma.teamFile.findUnique({
    where: { id: fileId },
    include: { team: { select: { id: true, visibility: true } } },
  });
  if (!file) return new Response("Not found", { status: 404 });

  // Public, unrestricted files need no session lookup.
  if (file.team.visibility !== "PUBLIC" || file.access !== "TEAM") {
    const user = await getCurrentUser();
    const role = await getRole(file.team.id, user?.id);
    // Don't reveal that a private team or its files exist.
    if (!canViewTeam(file.team.visibility, role)) return new Response("Not found", { status: 404 });
    if (!canAccessFile(file.team.visibility, role, file.access)) {
      return new Response("You don't have access to this file", { status: 403 });
    }
  }

  return downloadResponse(file.storageKey, file.name);
}
