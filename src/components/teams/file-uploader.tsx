"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { FILE_ACCESS_LABELS, MAX_FILE_BYTES } from "@/lib/files";
import { buttonStyles } from "../ui";

export function FileUploader({ teamId, allowedLevels }: { teamId: string; allowedLevels: string[] }) {
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
      const body = new FormData();
      body.append("file", file);
      body.append("access", accessSelect.current?.value ?? "TEAM");
      try {
        const res = await fetch(`/api/teams/${teamId}/files`, { method: "POST", body });
        if (!res.ok) {
          const data = await res.json().catch(() => ({}));
          problems.push(`${file.name}: ${data.error ?? `upload failed (${res.status}).`}`);
        }
      } catch {
        problems.push(`${file.name}: network error.`);
      }
    }
    setBusy(null);
    setErrors(problems);
    if (input.current) input.current.value = "";
    router.refresh();
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
