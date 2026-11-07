import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { AuthShell } from "@/components/auth/auth-shell";
import { ChooseAccountForm } from "@/components/auth/forgot-forms";
import { PageSkeleton } from "@/components/ui";
import { getVerifiedReset } from "@/lib/challenges";
import { accountStatus, blockedMessage } from "@/lib/moderation";

export const metadata: Metadata = { title: "Choose an account" };

export default function ChooseAccountPage() {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <Choose />
    </Suspense>
  );
}

async function Choose() {
  const reset = await getVerifiedReset();
  if (!reset) {
    return (
      <AuthShell title="Reset expired" subtitle="This password reset is no longer valid.">
        <p className="text-sm text-muted">
          Resets last 15 minutes after you enter the code.{" "}
          <Link href="/forgot" className="text-accent underline">Start over</Link>.
        </p>
      </AuthShell>
    );
  }
  if (reset.accounts.length === 0) {
    return (
      <AuthShell title="No accounts" subtitle={`No account uses ${reset.maskedEmail}.`}>
        <p className="text-sm text-muted">
          <Link href="/signup" className="text-accent underline">Create an account</Link> instead.
        </p>
      </AuthShell>
    );
  }

  const accounts = reset.accounts.map((a) => ({
    id: a.id,
    username: a.username,
    name: a.name,
    joined: a.createdAt.toLocaleDateString("en", { dateStyle: "medium", timeZone: "UTC" }),
    blocked: blockedMessage(accountStatus(a)),
  }));
  return (
    <AuthShell
      title="Choose an account"
      subtitle={`${accounts.length === 1 ? "This account uses" : `These ${accounts.length} accounts use`} ${reset.maskedEmail}. Pick one and set its new password.`}
    >
      <ChooseAccountForm accounts={accounts} />
    </AuthShell>
  );
}
