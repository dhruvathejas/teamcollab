"use client";

import { useActionState } from "react";
import { moderateUser } from "@/app/actions/admin";
import type { FormState } from "@/app/actions/types";
import type { AdminOptions, ModerationAction } from "@/lib/admin-rules";
import { SubmitButton } from "../submit-button";
import { Badge, Card, CardHeader, Field, Notice, inputStyles } from "../ui";

export type AdminSection =
  | { mode: "none" }
  | { mode: "root" }
  | { mode: "make"; grantable: Protections }
  | { mode: "view"; options: AdminOptions; addedBy: string | null }
  | { mode: "edit"; options: AdminOptions; addedBy: string | null; grantable: Protections };

type Protections = { suspend: boolean; ban: boolean; delete: boolean };

type Props = {
  userId: string;
  username: string;
  status: "active" | "banned" | "suspended";
  ownedTeams: string[];
  /** What the viewer may do; `lift` = undo an existing ban or suspension. */
  allowed: Record<ModerationAction | "lift", boolean>;
  adminSection: AdminSection;
};

/**
 * Admin options and moderation controls for one account. They share one
 * action state and this component stays mounted across the page refresh that
 * follows each action, so the result message isn't lost when, for example, the
 * Ban form turns into the Unban button.
 */
export function ModerationPanel({ userId, username, status, ownedTeams, allowed, adminSection }: Props) {
  const [state, run] = useActionState<FormState, FormData>(moderateUser, {});
  const hidden = (op: string) => (
    <>
      <input type="hidden" name="userId" value={userId} />
      <input type="hidden" name="op" value={op} />
    </>
  );
  // Undoing a ban/suspension is allowed even where imposing one isn't.
  const showSuspend = status === "suspended" ? allowed.lift : allowed.suspend;
  const showBan = status === "banned" ? allowed.lift : allowed.ban;
  const anyModeration = allowed.signout || showSuspend || showBan || allowed.delete;

  return (
    <div className="space-y-6">
      {state.error && <Notice tone="error">{state.error}</Notice>}
      {state.success && <Notice tone="success">{state.success}</Notice>}

      <AdminCard section={adminSection} run={run} hidden={hidden} username={username} />

      {!anyModeration && (
        <Card className="p-5">
          <p className="text-sm text-muted">
            {adminSection.mode === "root"
              ? "Root admins can't be suspended, banned, signed out or deleted."
              : "You can't suspend, ban, sign out or delete this account."}
          </p>
        </Card>
      )}

      {allowed.signout && (
        <Card>
          <CardHeader title="Sessions" />
          <form action={run} className="space-y-2 px-5 py-4">
            {hidden("signout")}
            <p className="text-sm text-muted">Ends every signed-in session and any half-finished sign-in. They can log in again.</p>
            <SubmitButton variant="secondary" pendingText="Signing out…">Sign out everywhere</SubmitButton>
          </form>
        </Card>
      )}

      {showSuspend && (
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
      )}

      {showBan && (
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
      )}

      {allowed.delete && (
        <Card className="border-danger/40">
          <CardHeader title={<span className="text-danger">Delete account</span>} />
          <form action={run} className="space-y-3 px-5 py-4">
            {hidden("delete")}
            <p className="text-sm text-muted">
              Permanently deletes @{username}: their memberships, invites and requests
              {adminSection.mode === "view" || adminSection.mode === "edit" ? ", and their admin rights" : ""}.
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
      )}
    </div>
  );
}

function AdminCard({
  section,
  run,
  hidden,
  username,
}: {
  section: AdminSection;
  run: (fd: FormData) => void;
  hidden: (op: string) => React.ReactNode;
  username: string;
}) {
  if (section.mode === "none") return null;
  if (section.mode === "root") {
    return (
      <Card>
        <CardHeader title={<span className="flex items-center gap-2">Admin <Badge tone="accent">Root admin</Badge></span>} />
        <p className="px-5 py-4 text-sm text-muted">
          Listed in SITE_ADMIN_EMAILS: every admin power, can add admins and manage every admin, and can&apos;t be
          suspended, banned, signed out or deleted. This can only be changed in the server settings.
        </p>
      </Card>
    );
  }
  if (section.mode === "view") {
    return (
      <Card>
        <CardHeader title={<span className="flex items-center gap-2">Admin <Badge tone="accent">Admin</Badge></span>} />
        <div className="space-y-2 px-5 py-4 text-sm">
          <OptionsSummary options={section.options} />
          <p className="text-muted">
            {section.addedBy ? `Added by @${section.addedBy}.` : "The admin who added them no longer exists."} Only they, or a
            root admin, can change or remove this admin.
          </p>
        </div>
      </Card>
    );
  }

  const editing = section.mode === "edit";
  const current = editing ? section.options : { canAddAdmins: false, suspendable: true, bannable: true, deletable: true };
  return (
    <Card>
      <CardHeader title={editing ? <span className="flex items-center gap-2">Admin <Badge tone="accent">Admin</Badge></span> : "Make admin"} />
      <form action={run} className="space-y-4 px-5 py-4">
        {hidden(editing ? "update-admin" : "make-admin")}
        <p className="text-sm text-muted">
          {editing
            ? `${section.addedBy ? `Added by @${section.addedBy}. ` : ""}Change what @${username} can do as an admin:`
            : `Admins act as owner of every team and can moderate accounts. Choose what @${username} can do:`}
        </p>
        <fieldset className="space-y-2">
          <legend className="sr-only">Admin options</legend>
          <Option name="canAddAdmins" label="Can add other admins" hint="And change or remove the admins they add." defaultChecked={current.canAddAdmins} />
          <Option name="suspendable" label="Can be suspended" hint="Also allows other admins to sign them out and remove them from teams." defaultChecked={current.suspendable} locked={!section.grantable.suspend} />
          <Option name="bannable" label="Can be banned" defaultChecked={current.bannable} locked={!section.grantable.ban} />
          <Option name="deletable" label="Account can be deleted" defaultChecked={current.deletable} locked={!section.grantable.delete} />
        </fieldset>
        <div className="flex flex-wrap gap-2">
          <SubmitButton pendingText="Saving…">{editing ? "Save admin options" : `Make @${username} an admin`}</SubmitButton>
        </div>
      </form>
      {editing && (
        <form action={run} className="border-t border-line px-5 py-4">
          {hidden("remove-admin")}
          <SubmitButton variant="danger" pendingText="Removing…">Remove admin rights</SubmitButton>
        </form>
      )}
    </Card>
  );
}

/**
 * A checkbox. `locked` means the actor can't grant this protection (they lack
 * it themselves): it keeps its current value and is submitted unchanged.
 */
function Option({
  name,
  label,
  hint,
  defaultChecked,
  locked = false,
}: {
  name: string;
  label: string;
  hint?: string;
  defaultChecked: boolean;
  locked?: boolean;
}) {
  return (
    <label className={`flex items-start gap-3 rounded-lg border border-line p-3 ${locked ? "opacity-70" : "cursor-pointer"}`}>
      {locked && defaultChecked && <input type="hidden" name={name} value="on" />}
      <input
        type="checkbox"
        name={locked ? undefined : name}
        defaultChecked={defaultChecked}
        disabled={locked}
        className="mt-1 accent-accent"
      />
      <span>
        <span className="block text-sm font-medium">{label}</span>
        {hint && <span className="block text-xs text-muted">{hint}</span>}
        {locked && <span className="block text-xs text-muted">You can only give protections you have yourself, so you can&apos;t change this.</span>}
      </span>
    </label>
  );
}

function OptionsSummary({ options }: { options: AdminOptions }) {
  const yes = (b: boolean) => (b ? "yes" : "no");
  return (
    <ul className="grid gap-1 sm:grid-cols-2">
      <li>Can add admins: <strong>{yes(options.canAddAdmins)}</strong></li>
      <li>Can be suspended: <strong>{yes(options.suspendable)}</strong></li>
      <li>Can be banned: <strong>{yes(options.bannable)}</strong></li>
      <li>Can be deleted: <strong>{yes(options.deletable)}</strong></li>
    </ul>
  );
}
