"use client";

import Link from "next/link";
import { useActionState } from "react";
import { completePasswordReset, requestReset } from "@/app/actions/auth";
import type { FormState } from "@/app/actions/types";
import { SubmitButton } from "../submit-button";
import { Field, Notice, buttonStyles, inputStyles } from "../ui";

export function ForgotForm() {
  const [state, action] = useActionState<FormState, FormData>(requestReset, {});
  return (
    <form action={action} className="space-y-4">
      {state.error && <Notice tone="error">{state.error}</Notice>}
      <Field label="Email" htmlFor="email" error={state.fieldErrors?.email} hint="The address your account was created with.">
        <input id="email" name="email" type="email" autoComplete="email" required defaultValue={state.values?.email} className={inputStyles} />
      </Field>
      <SubmitButton pendingText="Sending code…" className="w-full">Email me a code</SubmitButton>
    </form>
  );
}

export type ResetAccount = {
  id: string;
  username: string;
  name: string | null;
  joined: string;
  blocked: string | null;
};

export function ChooseAccountForm({ accounts }: { accounts: ResetAccount[] }) {
  const [state, action] = useActionState<FormState, FormData>(completePasswordReset, {});
  const e = state.fieldErrors ?? {};
  const firstOpen = accounts.find((a) => !a.blocked)?.id;
  const selected = state.values?.userId ?? (accounts.filter((a) => !a.blocked).length === 1 ? firstOpen : undefined);

  if (e.restart) {
    return (
      <div className="space-y-4">
        {state.success && <Notice tone="success">{state.success}</Notice>}
        {state.error && <Notice tone="error">{state.error}</Notice>}
        <Link href={state.success ? "/login" : "/forgot"} className={`${buttonStyles.primary} w-full`}>
          {state.success ? "Log in" : "Start over"}
        </Link>
      </div>
    );
  }

  return (
    <form action={action} className="space-y-5">
      {state.error && <Notice tone="error">{state.error}</Notice>}
      <fieldset className="space-y-2">
        <legend className="mb-1.5 text-sm font-medium">Which account?</legend>
        {accounts.map((a) => (
          <label
            key={a.id}
            className={`flex gap-3 rounded-lg border border-line p-3 ${a.blocked ? "opacity-60" : "cursor-pointer has-checked:border-accent has-checked:bg-accent-soft"}`}
          >
            <input
              type="radio"
              name="userId"
              value={a.id}
              defaultChecked={selected === a.id}
              disabled={Boolean(a.blocked)}
              required
              className="mt-1 accent-accent"
            />
            <span className="min-w-0">
              <span className="block text-sm font-medium">@{a.username}</span>
              <span className="block text-xs text-muted">
                {a.name ? `${a.name} · ` : ""}joined {a.joined}
              </span>
              {a.blocked && <span className="block text-xs text-danger">{a.blocked}</span>}
            </span>
          </label>
        ))}
        {e.userId && <p className="text-sm text-danger" role="alert">{e.userId}</p>}
      </fieldset>
      <Field label="New password" htmlFor="password" error={e.password} hint="At least 8 characters.">
        <input id="password" name="password" type="password" autoComplete="new-password" required minLength={8} className={inputStyles} />
      </Field>
      <Field label="Confirm new password" htmlFor="confirmPassword" error={e.confirmPassword}>
        <input id="confirmPassword" name="confirmPassword" type="password" autoComplete="new-password" required className={inputStyles} />
      </Field>
      <SubmitButton pendingText="Saving…" className="w-full">Set password and sign in</SubmitButton>
      <p className="text-xs text-muted">Other devices signed in to that account will be signed out.</p>
    </form>
  );
}
