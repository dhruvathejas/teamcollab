"use client";

import Link from "next/link";
import { useActionState } from "react";
import { saveReadme } from "@/app/actions/teams";
import type { FormState } from "@/app/actions/types";
import { SubmitButton } from "../submit-button";
import { Notice, buttonStyles, inputStyles } from "../ui";

export function ReadmeEditor({ teamId, slug, initial }: { teamId: string; slug: string; initial: string }) {
  const [state, action] = useActionState<FormState, FormData>(saveReadme, {});
  return (
    <form action={action} className="space-y-3">
      <input type="hidden" name="teamId" value={teamId} />
      {state.error && <Notice tone="error">{state.error}</Notice>}
      {state.fieldErrors?.content && <Notice tone="error">{state.fieldErrors.content}</Notice>}
      <label htmlFor="content" className="text-sm font-medium">README.md (Markdown)</label>
      <textarea
        id="content"
        name="content"
        defaultValue={state.values?.content ?? initial}
        rows={22}
        className={`${inputStyles} font-mono`}
        spellCheck
      />
      <div className="flex justify-end gap-2">
        <Link href={`/t/${slug}`} className={buttonStyles.ghost}>Cancel</Link>
        <SubmitButton pendingText="Saving…">Save README</SubmitButton>
      </div>
    </form>
  );
}
