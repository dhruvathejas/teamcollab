"use client";

import { useActionState, useState } from "react";
import { requestToJoin } from "@/app/actions/teams";
import type { FormState } from "@/app/actions/types";
import { SubmitButton } from "../submit-button";
import { Notice, buttonStyles, inputStyles } from "../ui";

export function JoinRequestForm({ teamId }: { teamId: string }) {
  const [state, action] = useActionState<FormState, FormData>(requestToJoin, {});
  const [open, setOpen] = useState(false);

  if (state.success) return <Notice tone="success">{state.success}</Notice>;
  if (!open) {
    return (
      <button type="button" onClick={() => setOpen(true)} className={buttonStyles.primary}>
        Request to join
      </button>
    );
  }
  return (
    <form action={action} className="w-full space-y-2 sm:w-80">
      <input type="hidden" name="teamId" value={teamId} />
      <label htmlFor="join-message" className="text-sm font-medium">Message to the team (optional)</label>
      <textarea id="join-message" name="message" rows={3} maxLength={500} placeholder="What would you like to work on?" className={inputStyles} />
      {state.error && <Notice tone="error">{state.error}</Notice>}
      <div className="flex justify-end gap-2">
        <button type="button" onClick={() => setOpen(false)} className={buttonStyles.ghost}>Cancel</button>
        <SubmitButton pendingText="Sending…">Send request</SubmitButton>
      </div>
    </form>
  );
}
