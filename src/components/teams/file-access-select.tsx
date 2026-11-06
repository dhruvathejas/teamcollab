"use client";

import { useRef } from "react";
import { setFileAccess } from "@/app/actions/teams";
import { FILE_ACCESS_LABELS } from "@/lib/files";

/** Dropdown that changes who can open a file; saves as soon as it changes. */
export function FileAccessSelect({
  fileId,
  fileName,
  value,
  options,
}: {
  fileId: string;
  fileName: string;
  value: string;
  options: string[];
}) {
  const form = useRef<HTMLFormElement>(null);
  return (
    <form ref={form} action={setFileAccess}>
      <input type="hidden" name="fileId" value={fileId} />
      <select
        name="access"
        defaultValue={value}
        aria-label={`Who can open ${fileName}`}
        onChange={() => form.current?.requestSubmit()}
        className="rounded-md border border-line bg-surface px-1.5 py-1 text-xs text-muted hover:text-fg focus:border-accent focus:outline-none"
      >
        {options.map((o) => (
          <option key={o} value={o}>{FILE_ACCESS_LABELS[o]}</option>
        ))}
      </select>
    </form>
  );
}
