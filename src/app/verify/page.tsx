import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { Suspense } from "react";
import { AuthShell } from "@/components/auth/auth-shell";
import { VerifyForm } from "@/components/auth/verify-form";
import { PageSkeleton } from "@/components/ui";
import { getChallengeInfo, getVerifiedReset } from "@/lib/challenges";
import { getCurrentUser, safeNext } from "@/lib/session";

export const metadata: Metadata = { title: "Check your email" };

export default function VerifyPage({ searchParams }: PageProps<"/verify">) {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <Verify searchParams={searchParams} />
    </Suspense>
  );
}

async function Verify({ searchParams }: { searchParams: PageProps<"/verify">["searchParams"] }) {
  const next = safeNext((await searchParams).next);
  if (await getCurrentUser()) redirect(next);

  // A reset whose code was already entered continues with choosing the account.
  if (await getVerifiedReset()) redirect("/forgot/choose");
  const challenge = await getChallengeInfo();
  if (!challenge) {
    return (
      <AuthShell title="Code expired" subtitle="This attempt is no longer valid.">
        <p className="text-sm text-muted">
          Codes expire after 10 minutes or too many wrong tries.{" "}
          <Link href={`/login?next=${encodeURIComponent(next)}`} className="text-accent underline">Log in again</Link>{" "}
          or <Link href={`/signup?next=${encodeURIComponent(next)}`} className="text-accent underline">sign up</Link>. Resetting a
          forgotten password? <Link href="/forgot" className="text-accent underline">Start the reset again</Link>.
        </p>
      </AuthShell>
    );
  }

  return (
    <AuthShell
      title="Check your email"
      subtitle={
        <>
          We sent a 6-digit code to <span className="font-medium text-fg">{challenge.maskedEmail}</span>
          {challenge.kind === "SIGNUP"
            ? " to confirm your address."
            : challenge.kind === "RESET"
              ? " if any account uses it. Enter it to choose an account and set a new password."
              : "."}
        </>
      }
    >
      <VerifyForm next={next} kind={challenge.kind} canResend={challenge.canResend} />
    </AuthShell>
  );
}
