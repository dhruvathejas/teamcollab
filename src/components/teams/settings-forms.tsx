"use client";

import { useActionState } from "react";
import { deleteTeam, inviteMember, updateTeam } from "@/app/actions/teams";
import type { FormState } from "@/app/actions/types";
import { SubmitButton } from "../submit-button";
import { Field, Notice, inputStyles } from "../ui";
import { LicenseSelect } from "./license-select";
import { VisibilityRadios } from "./visibility-radios";

type TeamSettings = {
  id: string;
  name: string;
  slug: string;
  description: string;
  license: string;
  visibility: string;
};

export function GeneralSettingsForm({ team, isOwner }: { team: TeamSettings; isOwner: boolean }) {
  const [state, action] = useActionState<FormState, FormData>(updateTeam, {});
  const e = state.fieldErrors ?? {};
  return (
    <form action={action} className="space-y-5">
      <input type="hidden" name="teamId" value={team.id} />
      {state.error && <Notice tone="error">{state.error}</Notice>}
      {state.success && <Notice tone="success">{state.success}</Notice>}
      {!isOwner && (
        <p className="text-sm text-muted">Only the owner can change the name, license and visibility.</p>
      )}
      <Field label="Team name" htmlFor="name" error={e.name}>
        <input id="name" name="name" defaultValue={state.values?.name ?? team.name} required maxLength={60} disabled={!isOwner} className={inputStyles} />
      </Field>
      <Field label="Description" htmlFor="description" error={e.description}>
        <textarea id="description" name="description" defaultValue={state.values?.description ?? team.description} rows={3} maxLength={500} className={inputStyles} />
      </Field>
      <Field label="License for all files" htmlFor="license" error={e.license}>
        <LicenseSelect defaultValue={team.license} disabled={!isOwner} />
      </Field>
      <VisibilityRadios defaultValue={team.visibility} disabled={!isOwner} />
      {e.visibility && <p className="text-sm text-danger">{e.visibility}</p>}
      <SubmitButton pendingText="Saving…">Save changes</SubmitButton>
    </form>
  );
}

export function InviteForm({ teamId }: { teamId: string }) {
  const [state, action] = useActionState<FormState, FormData>(inviteMember, {});
  return (
    <form action={action} className="space-y-2">
      <input type="hidden" name="teamId" value={teamId} />
      <label htmlFor="invite-username" className="text-sm font-medium">Invite by username</label>
      <div className="flex gap-2">
        <input id="invite-username" name="username" defaultValue={state.values?.username} placeholder="username" required className={inputStyles} />
        <SubmitButton pendingText="Inviting…">Invite</SubmitButton>
      </div>
      {state.fieldErrors?.username && <p className="text-sm text-danger" role="alert">{state.fieldErrors.username}</p>}
      {state.error && <Notice tone="error">{state.error}</Notice>}
      {state.success && <p className="text-sm text-success" role="status">{state.success}</p>}
    </form>
  );
}

export function DeleteTeamForm({ team }: { team: TeamSettings }) {
  const [state, action] = useActionState<FormState, FormData>(deleteTeam, {});
  return (
    <form action={action} className="space-y-3">
      <input type="hidden" name="teamId" value={team.id} />
      <p className="text-sm text-muted">
        Permanently deletes the team, its files, members, invites and requests. This can&apos;t be undone.
      </p>
      {state.error && <Notice tone="error">{state.error}</Notice>}
      <Field label={`Type "${team.slug}" to confirm`} htmlFor="confirm" error={state.fieldErrors?.confirm}>
        <input id="confirm" name="confirm" autoComplete="off" required className={inputStyles} />
      </Field>
      <SubmitButton variant="danger" pendingText="Deleting…">Delete this team</SubmitButton>
    </form>
  );
}
