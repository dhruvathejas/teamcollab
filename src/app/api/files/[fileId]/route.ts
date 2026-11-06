import { prisma } from "@/lib/db";
import { canViewTeam } from "@/lib/permissions";
import { getCurrentUser } from "@/lib/session";
import { getBlob } from "@/lib/storage";
import { getRole } from "@/lib/teams";

// Download a team file. Public team files are open to everyone; private team
// files to members only. Always served as an attachment so uploaded HTML/SVG
// can't run on this origin.
export async function GET(_request: Request, ctx: RouteContext<"/api/files/[fileId]">) {
  const { fileId } = await ctx.params;
  const file = await prisma.teamFile.findUnique({
    where: { id: fileId },
    include: { team: { select: { id: true, visibility: true } } },
  });
  if (!file) return new Response("Not found", { status: 404 });

  if (file.team.visibility !== "PUBLIC") {
    const user = await getCurrentUser();
    const role = await getRole(file.team.id, user?.id);
    if (!canViewTeam(file.team.visibility, role)) return new Response("Not found", { status: 404 });
  }

  let data: Buffer;
  try {
    data = await getBlob(file.storageKey);
  } catch {
    return new Response("File content is missing", { status: 410 });
  }

  return new Response(new Uint8Array(data), {
    headers: {
      "Content-Type": "application/octet-stream",
      "Content-Length": String(data.byteLength),
      "Content-Disposition": `attachment; filename*=UTF-8''${encodeURIComponent(file.name)}`,
      "X-Content-Type-Options": "nosniff",
      "Cache-Control": "private, no-store",
    },
  });
}
