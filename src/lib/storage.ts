import "server-only";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { BlobNotFoundError, del, get, head, issueSignedToken, list, presignUrl, put } from "@vercel/blob";
import { inNamespace, pathSegment } from "@/lib/upload-paths";

// File contents live in one of two places:
// - "blob": a *private* Vercel Blob store (production on Vercel). Used whenever
//   BLOB_READ_WRITE_TOKEN is set. Browsers upload straight to Blob and download
//   through short-lived presigned URLs, so file bytes never pass through a
//   serverless function (which caps bodies at 4.5 MB).
// - "disk": STORAGE_DIR on local disk (development and tests).
// The user-supplied file name is never trusted as a path on disk.

export type StorageDriver = "blob" | "disk";

export function storageDriver(): StorageDriver {
  if (process.env.BLOB_READ_WRITE_TOKEN) return "blob";
  // Vercel's function filesystem is read-only: falling back to disk there would
  // make every upload fail in a confusing way.
  if (process.env.VERCEL) {
    throw new Error("BLOB_READ_WRITE_TOKEN is not set. Connect a private Vercel Blob store to this environment.");
  }
  return "disk";
}

/**
 * Prefix for every blob pathname in this environment. Preview deployments use
 * a database copied from production, so they see production rows; blobs are
 * only ever deleted inside the current namespace, so a preview can't delete
 * production files.
 */
export function blobNamespace(): string {
  const ns = (process.env.BLOB_NAMESPACE ?? process.env.VERCEL_ENV ?? "development").toLowerCase();
  return /^[a-z0-9-]{1,32}$/.test(ns) ? ns : "development";
}

/** Largest file streamed through the function itself (Vercel caps responses at 4.5 MB). */
const STREAM_LIMIT_BYTES = 4 * 1024 * 1024;

// ---------- disk ----------

// The path is only known at runtime, so keep Turbopack from tracing it at build time.
const root = path.resolve(/*turbopackIgnore: true*/ process.cwd(), process.env.STORAGE_DIR ?? "storage");

function diskPath(key: string): string {
  const full = path.resolve(/*turbopackIgnore: true*/ root, key);
  if (!full.startsWith(root + path.sep)) throw new Error("Invalid storage key");
  return full;
}

// ---------- API ----------

/** Store bytes written by the server (e.g. the README). Returns the storage key. */
export async function putBlob(
  teamId: string,
  data: Uint8Array,
  opts: { name: string; contentType: string },
): Promise<string> {
  if (storageDriver() === "blob") {
    const pathname = `${blobNamespace()}/teams/${teamId}/files/${randomUUID()}/${pathSegment(opts.name)}`;
    await put(pathname, Buffer.from(data), {
      access: "private",
      contentType: opts.contentType || "application/octet-stream",
      addRandomSuffix: false,
    });
    return pathname;
  }
  const key = `${teamId}/${randomUUID()}`;
  const full = diskPath(key);
  await mkdir(path.dirname(full), { recursive: true });
  await writeFile(full, data);
  return key;
}

/** Read a whole file (only used for small files such as the README). */
export async function getBlob(key: string): Promise<Buffer> {
  if (storageDriver() === "blob") {
    const result = await get(key, { access: "private", useCache: false });
    if (!result || result.statusCode !== 200) throw new Error(`Blob not found: ${key}`);
    return Buffer.from(await new Response(result.stream).arrayBuffer());
  }
  return readFile(diskPath(key));
}

/** Size and type of a stored blob, or null if it doesn't exist (blob driver only). */
export async function statBlob(key: string): Promise<{ size: number; contentType: string } | null> {
  try {
    const info = await head(key);
    return { size: info.size, contentType: info.contentType };
  } catch (err) {
    if (err instanceof BlobNotFoundError) return null;
    throw err;
  }
}

export async function deleteBlob(key: string): Promise<void> {
  if (storageDriver() === "blob") {
    // Rows copied from another environment (e.g. production into a preview
    // branch) point at that environment's blobs: never delete those.
    if (!inNamespace(key, blobNamespace())) return;
    return del(key);
  }
  await rm(diskPath(key), { recursive: true, force: true });
}

export async function deleteTeamBlobs(teamId: string): Promise<void> {
  if (storageDriver() === "disk") {
    await rm(diskPath(teamId), { recursive: true, force: true });
    return;
  }
  let cursor: string | undefined;
  do {
    const page = await list({ prefix: `${blobNamespace()}/teams/${teamId}/`, cursor, limit: 1000 });
    if (page.blobs.length) await del(page.blobs.map((b) => b.pathname));
    cursor = page.hasMore ? page.cursor : undefined;
  } while (cursor);
}

const noStore = { "Cache-Control": "private, no-store" };

function attachment(body: BodyInit, fileName: string, size: number): Response {
  return new Response(body, {
    headers: {
      "Content-Type": "application/octet-stream",
      "Content-Length": String(size),
      "Content-Disposition": `attachment; filename*=UTF-8''${encodeURIComponent(fileName)}`,
      "X-Content-Type-Options": "nosniff",
      ...noStore,
    },
  });
}

/**
 * The response for an already-authorized download, always as a download under
 * the file's real name, never rendered on this origin.
 * - Disk, and Blob files up to 4 MB: the bytes stream through this function.
 * - Larger Blob files (Vercel caps function responses at 4.5 MB): a redirect to
 *   a one-minute presigned URL with download=1, served from Vercel's blob domain.
 */
export async function downloadResponse(key: string, fileName: string): Promise<Response> {
  const missing = () => new Response("File content is missing", { status: 410 });

  if (storageDriver() === "disk") {
    try {
      const data = await readFile(diskPath(key));
      return attachment(new Uint8Array(data), fileName, data.byteLength);
    } catch {
      return missing();
    }
  }

  const info = await statBlob(key);
  if (!info) return missing();
  if (info.size <= STREAM_LIMIT_BYTES) {
    const result = await get(key, { access: "private", useCache: false });
    if (!result || result.statusCode !== 200) return missing();
    return attachment(result.stream, fileName, info.size);
  }

  const validUntil = Date.now() + 60_000;
  const token = await issueSignedToken({ pathname: key, operations: ["get"], validUntil });
  const { presignedUrl } = await presignUrl(token, {
    operation: "get",
    pathname: key,
    validUntil,
    useCache: false,
    access: "private",
  });
  // download=1 asks the blob CDN for Content-Disposition: attachment. It isn't
  // part of the signed payload, so the signature still verifies.
  const url = new URL(presignedUrl);
  url.searchParams.set("download", "1");
  return new Response(null, { status: 302, headers: { Location: url.toString(), ...noStore } });
}
