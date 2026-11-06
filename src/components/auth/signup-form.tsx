"use client";

import { useActionState } from "react";
import { signup } from "@/app/actions/auth";
import type { FormState } from "@/app/actions/types";
import { SubmitButton } from "../submit-button";
import { Field, Notice, inputStyles } from "../ui";

export function SignupForm({ next }: { next: string }) {
  const [state, action] = useActionState<FormState, FormData>(signup, {});
  const e = state.fieldErrors ?? {};
  return (
    <form action={action} className="space-y-4">
      <input type="hidden" name="next" value={next} />
      {state.error && <Notice tone="error">{state.error}</Notice>}
      <Field label="Username" htmlFor="username" error={e.username} hint="Lowercase letters, numbers and hyphens.">
        <input id="username" name="username" defaultValue={state.values?.username} autoComplete="username" required minLength={3} maxLength={32} className={inputStyles} />
      </Field>
      <Field label="Email" htmlFor="email" error={e.email} hint="We'll email you a code to confirm it, and again each time you log in.">
        <input id="email" name="email" type="email" defaultValue={state.values?.email} autoComplete="email" required maxLength={254} className={inputStyles} />
      </Field>
      <Field label="Display name (optional)" htmlFor="name" error={e.name}>
        <input id="name" name="name" defaultValue={state.values?.name} autoComplete="name" maxLength={80} className={inputStyles} />
      </Field>
      <Field label="Password" htmlFor="password" error={e.password} hint="At least 8 characters.">
        <input id="password" name="password" type="password" autoComplete="new-password" required minLength={8} className={inputStyles} />
      </Field>
      <Field label="Confirm password" htmlFor="confirmPassword" error={e.confirmPassword}>
        <input id="confirmPassword" name="confirmPassword" type="password" autoComplete="new-password" required className={inputStyles} />
      </Field>
      <SubmitButton pendingText="Sending code…" className="w-full">Create account</SubmitButton>
    </form>
  );
}
