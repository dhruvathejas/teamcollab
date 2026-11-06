import "server-only";
import { prisma } from "@/lib/db";
import { canAccessFile, type FileAccess, type Role } from "@/lib/permissions";
import { deleteBlob, putBlob } from "@/lib/storage";

/** Thrown when an upload would replace a file the uploader isn't allowed to open. */
export class FileLockedError extends Error {
  constructor(readonly fileName: string) {
    super(`"${fileName}" is restricted`);
  }
}

/**
 * Store a file in a team project. A file with the same name is replaced and
 * keeps its access level; `access` applies only to new files. Throws
 * FileLockedError if the existing file is restricted beyond the uploader.
 */
export async function writeTeamFile(opts: {
  teamId: string;
  name: string;
  data: Uint8Array;
  mimeType: string;
  uploadedById: string;
  actorRole: Role;
  visibility: string;
  access?: FileAccess;
}) {
  const existing = await prisma.teamFile.findUnique({
    where: { teamId_name: { teamId: opts.teamId, name: opts.name } },
    select: { storageKey: true, access: true },
  });
  if (existing && !canAccessFile(opts.visibility, opts.actorRole, existing.access)) {
    throw new FileLockedError(opts.name);
  }
  const storageKey = await putBlob(opts.teamId, opts.data);
  try {
    const file = await prisma.teamFile.upsert({
      where: { teamId_name: { teamId: opts.teamId, name: opts.name } },
      create: {
        teamId: opts.teamId,
        name: opts.name,
        size: opts.data.byteLength,
        mimeType: opts.mimeType || "application/octet-stream",
        storageKey,
        uploadedById: opts.uploadedById,
        access: opts.access ?? "TEAM",
      },
      update: {
        size: opts.data.byteLength,
        mimeType: opts.mimeType || "application/octet-stream",
        storageKey,
        uploadedById: opts.uploadedById,
      },
    });
    if (existing) await deleteBlob(existing.storageKey);
    return file;
  } catch (err) {
    await deleteBlob(storageKey);
    throw err;
  }
}

export function defaultReadme(name: string, description: string, licenseName: string): string {
  const parts = [`# ${name}`];
  if (description) parts.push(description);
  parts.push(`## License\n\nAll files in this project are licensed under the ${licenseName}.`);
  return parts.join("\n\n") + "\n";
}
