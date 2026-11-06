import { NextResponse } from "next/server";
import { handleUpload, type HandleUploadBody } from "@vercel/blob/client";
import { prisma } from "@/lib/db";
import { MAX_FILE_BYTES } from "@/lib/files";
import { canWriteFiles } from "@/lib/permissions";
import { getCurrentUser } from "@/lib/session";
import { blobNamespace, storageDriver } from "@/lib/storage";
import { getRole } from "@/lib/teams";
import { isOwnUploadPath } from "@/lib/upload-paths";

class Refused extends Error {}

// Issues short-lived client tokens so the browser can upload straight to the
// private Vercel Blob store (bypassing the 4.5 MB function body limit). A token
// is only issued to a member who may write files, for their own fresh upload
// path in this team, and is capped at 10 MB. The file is recorded afterwards by
// POST ../ (which re-checks everything); no upload-completed webhook is used.
export async function POST(request: Request, ctx: RouteContext<"/api/teams/[teamId]/files/blob-token">) {
  if (storageDriver() !== "blob") return NextResponse.json({ error: "Not available." }, { status: 404 });
  const { teamId } = await ctx.params;

  let body: HandleUploadBody;
  try {
    body = (await request.json()) as HandleUploadBody;
  } catch {
    return NextResponse.json({ error: "Expected JSON." }, { status: 400 });
  }

  try {
    const json = await handleUpload({
      body,
      request,
      onBeforeGenerateToken: async (pathname) => {
        const user = await getCurrentUser();
        if (!user) throw new Refused("Sign in first.");
        const team = await prisma.team.findUnique({ where: { id: teamId }, select: { id: true } });
        const role = team ? await getRole(team.id, user.id) : null;
        if (!team || !canWriteFiles(role)) throw new Refused("Only team members can upload files.");
        if (!isOwnUploadPath(pathname, blobNamespace(), team.id, user.id)) throw new Refused("Invalid upload path.");
        return {
          maximumSizeInBytes: MAX_FILE_BYTES,
          addRandomSuffix: false,
          allowOverwrite: false,
          // Short-lived: enough to start the upload, not to outlive a removal from the team.
          validUntil: Date.now() + 2 * 60 * 1000,
        };
      },
    });
    return NextResponse.json(json);
  } catch (err) {
    if (err instanceof Refused) return NextResponse.json({ error: err.message }, { status: 403 });
    console.error("blob-token: failed", err);
    return NextResponse.json({ error: "Couldn't start the upload." }, { status: 400 });
  }
}
