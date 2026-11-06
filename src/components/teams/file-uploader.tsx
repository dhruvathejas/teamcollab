"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { FILE_ACCESS_LABELS, MAX_FILE_BYTES } from "@/lib/files";
import { buildUploadPath } from "@/lib/upload-paths";
import { buttonStyles } from "../ui";

/**
 * Uploads files to a team. With `direct` (Vercel Blob storage) the browser sends
 * the bytes straight to Blob and then asks the server to record the file;
 * otherwise (local disk) it posts the file to the server.
 */
export function FileUploader({
  teamId,
  userId,
  allowedLevels,
  direct,
  namespace,
}: {
  teamId: string;
  userId: string;
  allowedLevels: string[];
  direct: boolean;
  /** Blob pathname namespace for this environment (direct uploads only). */
  namespace: string;
}) {
  const router = useRouter();
  const input = useRef<HTMLInputElement>(null);
  const accessSelect = useRef<HTMLSelectElement>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [errors, setErrors] = useState<string[]>([]);

  // Files picked before hydration finished never reached onChange; upload them now.
  useEffect(() => {
    const files = input.current?.files;
    if (files?.length) void upload(files);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function upload(files: FileList) {
    const problems: string[] = [];
    for (const file of Array.from(files)) {
      if (file.size > MAX_FILE_BYTES) {
        problems.push(`${file.name}: larger than 10 MB.`);
        continue;
      }
      setBusy(`Uploading ${file.name}…`);
      const access = accessSelect.current?.value ?? "TEAM";
      try {
        const res = direct ? await uploadDirect(file, access) : await uploadViaServer(file, access);
        if (!res.ok) {
          const data = await res.json().catch(() => ({}));
          problems.push(`${file.name}: ${data.error ?? `upload failed (${res.status}).`}`);
        }
      } catch (err) {
        problems.push(`${file.name}: ${describeError(err)}`);
      }
    }
    setBusy(null);
    setErrors(problems);
    if (input.current) input.current.value = "";
    router.refresh();
  }

  function uploadViaServer(file: File, access: string): Promise<Response> {
    const body = new FormData();
    body.append("file", file);
    body.append("access", access);
    return fetch(`/api/teams/${teamId}/files`, { method: "POST", body });
  }

  async function uploadDirect(file: File, access: string): Promise<Response> {
    const { upload } = await import("@vercel/blob/client");
    const pathname = buildUploadPath(namespace, teamId, userId, file.name, crypto.randomUUID());
    try {
      await upload(pathname, file, {
        access: "private",
        handleUploadUrl: `/api/teams/${teamId}/files/blob-token`,
        contentType: file.type || undefined,
        multipart: file.size > 5 * 1024 * 1024,
      });
    } catch (err) {
      // The SDK reports a refused token as a generic "Failed to retrieve the client token".
      if (err instanceof Error && /client token/i.test(err.message)) {
        throw new Error("upload refused. Make sure you're still signed in and a member of this team.");
      }
      throw err;
    }
    return fetch(`/api/teams/${teamId}/files`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ pathname, name: file.name, access }),
    });
  }

  return (
    <div className="flex flex-col items-end gap-1">
      <div className="flex items-center gap-2">
      <label className="flex items-center gap-1.5 text-xs text-muted">
        <span className="hidden sm:inline">Who can open</span>
        <select
          ref={accessSelect}
          name="access"
          defaultValue="TEAM"
          aria-label="Who can open uploaded files"
          className="rounded-md border border-line bg-surface px-1.5 py-1 text-xs text-fg focus:border-accent focus:outline-none"
        >
          {allowedLevels.map((l) => (
            <option key={l} value={l}>{FILE_ACCESS_LABELS[l]}</option>
          ))}
        </select>
      </label>
      <input
        ref={input}
        type="file"
        multiple
        className="sr-only"
        id={`upload-${teamId}`}
        onChange={(e) => e.target.files?.length && upload(e.target.files)}
        disabled={busy !== null}
      />
      <label htmlFor={`upload-${teamId}`} className={`${buttonStyles.secondary} cursor-pointer`} aria-disabled={busy !== null}>
        {busy ?? "Upload files"}
      </label>
      </div>
      {errors.length > 0 && (
        <ul role="alert" className="text-right text-xs text-danger">
          {errors.map((e) => <li key={e}>{e}</li>)}
        </ul>
      )}
    </div>
  );
}

function describeError(err: unknown): string {
  // fetch() failures are TypeErrors with browser-specific text ("Failed to fetch", "Load failed"…).
  if (err instanceof TypeError || !(err instanceof Error) || !err.message) return "network error.";
  return err.message.replace(/^Vercel Blob:\s*/, "").replace(/\s+/g, " ");
}
