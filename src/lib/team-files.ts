import "server-only";
import { prisma } from "@/lib/db";
import { deleteBlob, putBlob } from "@/lib/storage";

/**
 * Store a file in a team project. A file with the same name is replaced.
 */
export async function writeTeamFile(opts: {
  teamId: string;
  name: string;
  data: Uint8Array;
  mimeType: string;
  uploadedById: string;
}) {
  const storageKey = await putBlob(opts.teamId, opts.data);
  const existing = await prisma.teamFile.findUnique({
    where: { teamId_name: { teamId: opts.teamId, name: opts.name } },
    select: { storageKey: true },
  });
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
