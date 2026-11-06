"use client";

import { useActionState } from "react";
import { cancelVerification, resendCode, verifyCode } from "@/app/actions/auth";
import type { FormState } from "@/app/actions/types";
import { SubmitButton } from "../submit-button";
import { Field, Notice, buttonStyles, inputStyles } from "../ui";

export function VerifyForm({ next, kind, canResend }: { next: string; kind: "LOGIN" | "SIGNUP"; canResend: boolean }) {
  const [state, action] = useActionState<FormState, FormData>(verifyCode, {});
  const [resendState, resendAction] = useActionState<FormState, FormData>(resendCode, {});
  const mustRestart = Boolean(state.fieldErrors?.restart || resendState.fieldErrors?.restart);

  return (
    <div className="space-y-4">
      {state.error && <Notice tone="error">{state.error}</Notice>}
      {!state.error && resendState.error && <Notice tone="error">{resendState.error}</Notice>}
      {!state.error && resendState.success && <Notice tone="success">{resendState.success}</Notice>}

      {!mustRestart && (
        <form action={action} className="space-y-4">
          <input type="hidden" name="next" value={next} />
          <Field label="Verification code" htmlFor="code" error={state.fieldErrors?.code}>
            <input
              id="code"
              name="code"
              inputMode="numeric"
              autoComplete="one-time-code"
              pattern="[0-9 \-]*"
              maxLength={9}
              required
              autoFocus
              placeholder="123456"
              className={`${inputStyles} text-center font-mono text-xl tracking-[0.4em]`}
            />
          </Field>
          <SubmitButton pendingText="Verifying…" className="w-full">Verify</SubmitButton>
        </form>
      )}

      <div className="flex items-center justify-between gap-2 text-sm">
        {!mustRestart && canResend ? (
          <form action={resendAction}>
            <SubmitButton variant="ghost" pendingText="Sending…" className="!px-2">Resend code</SubmitButton>
          </form>
        ) : (
          <span />
        )}
        <form action={cancelVerification}>
          <input type="hidden" name="next" value={next} />
          <input type="hidden" name="kind" value={kind} />
          <button type="submit" className={mustRestart ? buttonStyles.primary : `${buttonStyles.ghost} !px-2`}>
            Start over
          </button>
        </form>
      </div>
    </div>
  );
}
