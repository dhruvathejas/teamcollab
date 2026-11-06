import "server-only";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";

// Blobs live on local disk under STORAGE_DIR/<teamId>/<uuid>. The user-supplied
// file name is never part of the path, so it cannot escape the storage root.
// The path is only known at runtime, so keep Turbopack from tracing it at build time.
const root = path.resolve(/*turbopackIgnore: true*/ process.cwd(), process.env.STORAGE_DIR ?? "storage");

function resolveKey(key: string): string {
  const full = path.resolve(/*turbopackIgnore: true*/ root, key);
  if (!full.startsWith(root + path.sep)) throw new Error("Invalid storage key");
  return full;
}

export async function putBlob(teamId: string, data: Uint8Array): Promise<string> {
  const key = `${teamId}/${randomUUID()}`;
  const full = resolveKey(key);
  await mkdir(path.dirname(full), { recursive: true });
  await writeFile(full, data);
  return key;
}

export async function getBlob(key: string): Promise<Buffer> {
  return readFile(resolveKey(key));
}

export async function deleteBlob(key: string): Promise<void> {
  await rm(resolveKey(key), { force: true });
}

export async function deleteTeamBlobs(teamId: string): Promise<void> {
  await rm(resolveKey(teamId), { recursive: true, force: true });
}
