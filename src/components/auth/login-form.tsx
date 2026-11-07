"use client";

import Link from "next/link";
import { useActionState } from "react";
import { login } from "@/app/actions/auth";
import type { FormState } from "@/app/actions/types";
import { SubmitButton } from "../submit-button";
import { Field, Notice, inputStyles } from "../ui";

export function LoginForm({ next }: { next: string }) {
  const [state, action] = useActionState<FormState, FormData>(login, {});
  return (
    <form action={action} className="space-y-4">
      <input type="hidden" name="next" value={next} />
      {state.error && <Notice tone="error">{state.error}</Notice>}
      <Field label="Username" htmlFor="username">
        <input id="username" name="username" defaultValue={state.values?.username} autoComplete="username" required className={inputStyles} />
      </Field>
      <Field label="Password" htmlFor="password">
        <input id="password" name="password" type="password" autoComplete="current-password" required className={inputStyles} />
      </Field>
      <SubmitButton pendingText="Checking…" className="w-full">Log in</SubmitButton>
      <p className="text-center text-sm">
        <Link href="/forgot" className="text-accent underline">Forgot your password?</Link>
      </p>
    </form>
  );
}
