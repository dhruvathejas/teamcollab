import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { MAX_FILE_BYTES, sanitizeFileName } from "@/lib/files";
import { accessLevelsFor, canWriteFiles, isFileAccess, type FileAccess, type Role } from "@/lib/permissions";
import { getCurrentUser } from "@/lib/session";
import { blobNamespace, deleteBlob, storageDriver } from "@/lib/storage";
import {
  FileLockedError,
  UploadAlreadyRecordedError,
  UploadMissingError,
  UploadTooLargeError,
  registerUploadedBlob,
  writeTeamFile,
} from "@/lib/team-files";
import { getRole } from "@/lib/teams";
import { isOwnUploadPath } from "@/lib/upload-paths";

// Add a file to a team project. Members only.
// - Blob storage (Vercel): the browser has already uploaded the bytes straight
//   to Vercel Blob (see ./blob-token); this records it. JSON body:
//   { pathname, name, access }.
// - Disk storage (local development): multipart body with "file" and "access".
export async function POST(request: Request, ctx: RouteContext<"/api/teams/[teamId]/files">) {
  const { teamId } = await ctx.params;
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Sign in first." }, { status: 401 });

  const team = await prisma.team.findUnique({ where: { id: teamId }, select: { id: true, visibility: true } });
  const role = team ? await getRole(team.id, user.id) : null;
  if (!team || !role || !canWriteFiles(role)) {
    await discardRefusedUpload(request, teamId, user.id);
    return NextResponse.json({ error: "Only team members can upload files." }, { status: 403 });
  }
  const target = { teamId: team.id, uploadedById: user.id, actorRole: role, visibility: team.visibility };

  return storageDriver() === "blob"
    ? registerBlob(request, target)
    : receiveMultipart(request, target);
}

/**
 * Someone who lost access between getting an upload token and registering it
 * (removed from the team, team deleted) leaves an uploaded blob behind; delete
 * it if it's provably their own fresh upload.
 */
async function discardRefusedUpload(request: Request, teamId: string, userId: string): Promise<void> {
  if (storageDriver() !== "blob") return;
  const body = await request.json().catch(() => null);
  const pathname = typeof body?.pathname === "string" ? body.pathname : "";
  if (!isOwnUploadPath(pathname, blobNamespace(), teamId, userId)) return;
  if (await prisma.teamFile.findFirst({ where: { storageKey: pathname }, select: { id: true } })) return;
  await deleteBlob(pathname).catch(() => {});
}

type Target = { teamId: string; uploadedById: string; actorRole: Role; visibility: string };

function parseAccess(raw: unknown, role: Role): FileAccess | null {
  const access = raw ?? "TEAM";
  return isFileAccess(access) && accessLevelsFor(role).includes(access) ? access : null;
}

function errorResponse(err: unknown): NextResponse {
  if (err instanceof FileLockedError) {
    return NextResponse.json({ error: "A restricted file with this name already exists." }, { status: 409 });
  }
  if (err instanceof UploadTooLargeError) {
    return NextResponse.json({ error: "Files can be at most 10 MB." }, { status: 413 });
  }
  if (err instanceof UploadAlreadyRecordedError) {
    return NextResponse.json({ error: "This upload was already recorded." }, { status: 409 });
  }
  if (err instanceof UploadMissingError) {
    return NextResponse.json({ error: "The upload didn't finish. Please try again." }, { status: 400 });
  }
  throw err;
}

async function registerBlob(request: Request, t: Target): Promise<NextResponse> {
  let body: { pathname?: unknown; name?: unknown; access?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Expected JSON." }, { status: 400 });
  }
  const pathname = typeof body.pathname === "string" ? body.pathname : "";
  // Only the uploader's own fresh upload path for this team can be registered,
  // so nobody can claim another team's or another user's blob.
  if (!isOwnUploadPath(pathname, blobNamespace(), t.teamId, t.uploadedById)) {
    return NextResponse.json({ error: "Invalid upload." }, { status: 400 });
  }
  // Each upload path is recorded once; never touch a blob that's already a file.
  if (await prisma.teamFile.findFirst({ where: { storageKey: pathname }, select: { id: true } })) {
    return NextResponse.json({ error: "This upload was already recorded." }, { status: 409 });
  }
  const name = typeof body.name === "string" ? sanitizeFileName(body.name) : null;
  const access = parseAccess(body.access, t.actorRole);
  if (!name || !access) {
    await deleteBlob(pathname);
    return NextResponse.json({ error: name ? "You can't choose that access level." : "Invalid file name." }, { status: 400 });
  }
  try {
    const saved = await registerUploadedBlob({ ...t, name, access, pathname });
    return NextResponse.json({ id: saved.id, name: saved.name }, { status: 201 });
  } catch (err) {
    return errorResponse(err);
  }
}

async function receiveMultipart(request: Request, t: Target): Promise<NextResponse> {
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
  if (!(file instanceof File)) return NextResponse.json({ error: "No file provided." }, { status: 400 });
  if (file.size > MAX_FILE_BYTES) return NextResponse.json({ error: "Files can be at most 10 MB." }, { status: 413 });
  const name = sanitizeFileName(file.name);
  if (!name) return NextResponse.json({ error: "Invalid file name." }, { status: 400 });
  const access = parseAccess(form.get("access"), t.actorRole);
  if (!access) return NextResponse.json({ error: "You can't choose that access level." }, { status: 400 });

  try {
    const saved = await writeTeamFile({
      ...t,
      name,
      access,
      data: new Uint8Array(await file.arrayBuffer()),
      mimeType: file.type,
    });
    return NextResponse.json({ id: saved.id, name: saved.name }, { status: 201 });
  } catch (err) {
    return errorResponse(err);
  }
}
