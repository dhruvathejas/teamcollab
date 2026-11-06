"use client";

import { useActionState } from "react";
import { moderateUser } from "@/app/actions/admin";
import type { FormState } from "@/app/actions/types";
import { SubmitButton } from "../submit-button";
import { Card, CardHeader, Field, Notice, inputStyles } from "../ui";

type Props = {
  userId: string;
  username: string;
  status: "active" | "banned" | "suspended";
  ownedTeams: string[];
};

/**
 * All moderation controls for one account. They share one action state and
 * this component stays mounted when the page refreshes, so the result message
 * isn't lost when, say, the Ban form turns into the Unban button.
 */
export function ModerationPanel({ userId, username, status, ownedTeams }: Props) {
  const [state, run] = useActionState<FormState, FormData>(moderateUser, {});
  const hidden = (op: string) => (
    <>
      <input type="hidden" name="userId" value={userId} />
      <input type="hidden" name="op" value={op} />
    </>
  );

  return (
    <div className="space-y-6">
      {state.error && <Notice tone="error">{state.error}</Notice>}
      {state.success && <Notice tone="success">{state.success}</Notice>}

      <Card>
        <CardHeader title="Sessions" />
        <form action={run} className="space-y-2 px-5 py-4">
          {hidden("signout")}
          <p className="text-sm text-muted">Ends every signed-in session and any half-finished sign-in. They can log in again.</p>
          <SubmitButton variant="secondary" pendingText="Signing out…">Sign out everywhere</SubmitButton>
        </form>
      </Card>

      <Card>
        <CardHeader title="Suspend" />
        {status === "suspended" ? (
          <form action={run} className="px-5 py-4">
            {hidden("lift")}
            <SubmitButton variant="secondary" pendingText="Lifting…">Lift suspension</SubmitButton>
          </form>
        ) : (
          <form action={run} className="space-y-3 px-5 py-4">
            {hidden("suspend")}
            <Field label="Suspended until (00:00 UTC on this date)" htmlFor="suspend-until" error={state.fieldErrors?.until}>
              <input id="suspend-until" name="until" type="date" required className={inputStyles} />
            </Field>
            <Field label="Reason (shown to them at login)" htmlFor="suspend-reason">
              <input id="suspend-reason" name="reason" maxLength={300} className={inputStyles} />
            </Field>
            <SubmitButton variant="danger" pendingText="Suspending…">Suspend account</SubmitButton>
          </form>
        )}
      </Card>

      <Card>
        <CardHeader title="Ban" />
        {status === "banned" ? (
          <form action={run} className="px-5 py-4">
            {hidden("unban")}
            <SubmitButton variant="secondary" pendingText="Unbanning…">Unban</SubmitButton>
          </form>
        ) : (
          <form action={run} className="space-y-3 px-5 py-4">
            {hidden("ban")}
            <p className="text-sm text-muted">Blocks login until unbanned. Their teams and files stay visible.</p>
            <Field label="Reason (shown to them at login)" htmlFor="ban-reason">
              <input id="ban-reason" name="reason" maxLength={300} className={inputStyles} />
            </Field>
            <SubmitButton variant="danger" pendingText="Banning…">Ban account</SubmitButton>
          </form>
        )}
      </Card>

      <Card className="border-danger/40">
        <CardHeader title={<span className="text-danger">Delete account</span>} />
        <form action={run} className="space-y-3 px-5 py-4">
          {hidden("delete")}
          <p className="text-sm text-muted">
            Permanently deletes @{username}: their memberships, invites and requests.
            {ownedTeams.length > 0 ? (
              <> It also deletes the {ownedTeams.length === 1 ? "team" : "teams"} they own, with all files: <strong className="text-fg">{ownedTeams.join(", ")}</strong>.</>
            ) : (
              " They don't own any teams."
            )}{" "}
            Files they uploaded to other teams stay. This can&apos;t be undone.
          </p>
          <Field label={`Type "${username}" to confirm`} htmlFor="delete-confirm" error={state.fieldErrors?.confirm}>
            <input id="delete-confirm" name="confirm" autoComplete="off" required className={inputStyles} />
          </Field>
          <SubmitButton variant="danger" pendingText="Deleting…">Delete account</SubmitButton>
        </form>
      </Card>
    </div>
  );
}
