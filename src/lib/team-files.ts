import "server-only";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { canAccessFile, type FileAccess, type Role } from "@/lib/permissions";
import { MAX_FILE_BYTES } from "@/lib/files";
import { deleteBlob, putBlob, statBlob } from "@/lib/storage";

/** Thrown when an upload would replace a file the uploader isn't allowed to open. */
export class FileLockedError extends Error {
  constructor(readonly fileName: string) {
    super(`"${fileName}" is restricted`);
  }
}

type WriteTarget = {
  teamId: string;
  name: string;
  uploadedById: string;
  actorRole: Role;
  visibility: string;
  access?: FileAccess;
};

/** Throw FileLockedError if `name` exists and is restricted beyond the uploader. */
async function existingFor(t: WriteTarget) {
  const existing = await prisma.teamFile.findUnique({
    where: { teamId_name: { teamId: t.teamId, name: t.name } },
    select: { storageKey: true, access: true },
  });
  if (existing && !canAccessFile(t.visibility, t.actorRole, existing.access)) {
    throw new FileLockedError(t.name);
  }
  return existing;
}

/**
 * Record a stored blob as a team file. A file with the same name is replaced
 * and keeps its access level; `access` applies only to new files. On any
 * failure the new blob is deleted, so nothing is left orphaned.
 */
async function recordTeamFile(t: WriteTarget, stored: { storageKey: string; size: number; mimeType: string }) {
  let existing: Awaited<ReturnType<typeof existingFor>>;
  let file;
  try {
    existing = await existingFor(t);
    const data = {
      size: stored.size,
      mimeType: stored.mimeType || "application/octet-stream",
      storageKey: stored.storageKey,
      uploadedById: t.uploadedById,
    };
    file = await prisma.teamFile.upsert({
      where: { teamId_name: { teamId: t.teamId, name: t.name } },
      create: { teamId: t.teamId, name: t.name, access: t.access ?? "TEAM", ...data },
      update: data,
    });
  } catch (err) {
    // If another request already recorded this very blob, it belongs to that
    // file now: leave it alone.
    const target = err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002" ? String(err.meta?.target) : "";
    if (target.includes("storageKey")) throw new UploadAlreadyRecordedError();
    await deleteBlob(stored.storageKey);
    throw err;
  }
  // The row now points at the new blob, so from here on never delete it. The
  // replaced blob is removed best effort; a failure only leaves an orphan.
  if (existing && existing.storageKey !== stored.storageKey) {
    await deleteBlob(existing.storageKey).catch((err) => console.error("failed to delete replaced blob", err));
  }
  return file;
}

/**
 * Store bytes as a team file (server-side writes: README, local-disk uploads).
 * Throws FileLockedError if the existing file is restricted beyond the uploader.
 */
export async function writeTeamFile(opts: WriteTarget & { data: Uint8Array; mimeType: string }) {
  await existingFor(opts); // fail fast before storing anything
  const storageKey = await putBlob(opts.teamId, opts.data, { name: opts.name, contentType: opts.mimeType });
  return recordTeamFile(opts, { storageKey, size: opts.data.byteLength, mimeType: opts.mimeType });
}

/**
 * Record a file the browser already uploaded straight to Vercel Blob. The
 * caller must have checked that `pathname` is the uploader's own upload path;
 * size and type are read from the blob itself, never trusted from the client.
 */
export async function registerUploadedBlob(opts: WriteTarget & { pathname: string }) {
  const info = await statBlob(opts.pathname);
  if (!info) throw new UploadMissingError();
  if (info.size > MAX_FILE_BYTES) {
    await deleteBlob(opts.pathname);
    throw new UploadTooLargeError();
  }
  return recordTeamFile(opts, { storageKey: opts.pathname, size: info.size, mimeType: info.contentType });
}

export class UploadMissingError extends Error {}
export class UploadAlreadyRecordedError extends Error {}
export class UploadTooLargeError extends Error {}

export function defaultReadme(name: string, description: string, licenseName: string): string {
  const parts = [`# ${name}`];
  if (description) parts.push(description);
  parts.push(`## License\n\nAll files in this project are licensed under the ${licenseName}.`);
  return parts.join("\n\n") + "\n";
}
