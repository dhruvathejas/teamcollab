"use client";

import { useActionState, useState } from "react";
import { createTeam } from "@/app/actions/teams";
import type { FormState } from "@/app/actions/types";
import { slugify } from "@/lib/slug";
import { SubmitButton } from "../submit-button";
import { Field, Notice, inputStyles } from "../ui";
import { LicenseSelect } from "./license-select";
import { VisibilityRadios } from "./visibility-radios";

export function NewTeamForm() {
  const [state, action] = useActionState<FormState, FormData>(createTeam, {});
  const [name, setName] = useState("");
  const [slug, setSlug] = useState("");
  const [slugEdited, setSlugEdited] = useState(false);
  const e = state.fieldErrors ?? {};

  return (
    <form action={action} className="space-y-5">
      {state.error && <Notice tone="error">{state.error}</Notice>}
      <Field label="Team name" htmlFor="name" error={e.name}>
        <input
          id="name"
          name="name"
          required
          maxLength={60}
          value={name}
          onChange={(ev) => {
            setName(ev.target.value);
            if (!slugEdited) setSlug(slugify(ev.target.value));
          }}
          placeholder="Open Robotics"
          className={inputStyles}
        />
      </Field>
      <Field label="Team URL" htmlFor="slug" error={e.slug} hint="Lowercase letters, numbers and hyphens.">
        <div className="flex items-center rounded-lg border border-line bg-surface-2 focus-within:border-accent">
          <span className="pl-3 text-sm text-muted">/t/</span>
          <input
            id="slug"
            name="slug"
            required
            maxLength={40}
            value={slug}
            onChange={(ev) => {
              setSlug(ev.target.value.toLowerCase());
              setSlugEdited(true);
            }}
            className="w-full rounded-r-lg bg-surface px-2 py-2 text-sm focus:outline-none"
          />
        </div>
      </Field>
      <Field label="Description (optional)" htmlFor="description" error={e.description}>
        <textarea id="description" name="description" defaultValue={state.values?.description} rows={3} maxLength={500} placeholder="What is this team building?" className={inputStyles} />
      </Field>
      <Field label="License for all files" htmlFor="license" error={e.license}>
        <LicenseSelect defaultValue={state.values?.license} />
      </Field>
      <VisibilityRadios defaultValue={state.values?.visibility} />
      {e.visibility && <p className="text-sm text-danger">{e.visibility}</p>}
      <label className="flex cursor-pointer items-start gap-3 rounded-lg border border-line p-3">
        <input type="checkbox" name="withReadme" defaultChecked={state.values?.withReadme !== "off"} className="mt-1 accent-accent" />
        <span>
          <span className="block text-sm font-medium">Add a README</span>
          <span className="block text-xs text-muted">Start the project with a README.md describing the team and its license. You can edit it later.</span>
        </span>
      </label>
      <SubmitButton pendingText="Creating…">Create team</SubmitButton>
    </form>
  );
}
