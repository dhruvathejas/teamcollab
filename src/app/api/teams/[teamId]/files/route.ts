import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { MAX_FILE_BYTES, sanitizeFileName } from "@/lib/files";
import { canWriteFiles } from "@/lib/permissions";
import { getCurrentUser } from "@/lib/session";
import { writeTeamFile } from "@/lib/team-files";
import { getRole } from "@/lib/teams";

// Upload one file (multipart field "file") to a team project. Members only.
export async function POST(request: Request, ctx: RouteContext<"/api/teams/[teamId]/files">) {
  const { teamId } = await ctx.params;
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Sign in first." }, { status: 401 });

  const team = await prisma.team.findUnique({ where: { id: teamId }, select: { id: true } });
  const role = team ? await getRole(team.id, user.id) : null;
  if (!team || !canWriteFiles(role)) {
    return NextResponse.json({ error: "Only team members can upload files." }, { status: 403 });
  }

  // Reject oversized bodies before parsing them (allow some multipart overhead).
  const length = Number(request.headers.get("content-length") ?? 0);
  if (length > MAX_FILE_BYTES + 64 * 1024) {
    return NextResponse.json({ error: "Files can be at most 10 MB." }, { status: 413 });
  }

  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return NextResponse.json({ error: "Expected a multipart form upload." }, { status: 400 });
  }
  const file = form.get("file");
  if (!(file instanceof File)) {
    return NextResponse.json({ error: "No file provided." }, { status: 400 });
  }
  if (file.size > MAX_FILE_BYTES) {
    return NextResponse.json({ error: "Files can be at most 10 MB." }, { status: 413 });
  }
  const name = sanitizeFileName(file.name);
  if (!name) return NextResponse.json({ error: "Invalid file name." }, { status: 400 });

  const saved = await writeTeamFile({
    teamId: team.id,
    name,
    data: new Uint8Array(await file.arrayBuffer()),
    mimeType: file.type,
    uploadedById: user.id,
  });
  return NextResponse.json({ id: saved.id, name: saved.name }, { status: 201 });
}
