import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { Suspense } from "react";
import { AuthShell } from "@/components/auth/auth-shell";
import { SignupForm } from "@/components/auth/signup-form";
import { PageSkeleton } from "@/components/ui";
import { getCurrentUser, safeNext } from "@/lib/session";

export const metadata: Metadata = { title: "Sign up" };

export default function SignupPage({ searchParams }: PageProps<"/signup">) {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <Signup searchParams={searchParams} />
    </Suspense>
  );
}

async function Signup({ searchParams }: { searchParams: PageProps<"/signup">["searchParams"] }) {
  const next = safeNext((await searchParams).next);
  if (await getCurrentUser()) redirect(next);

  return (
    <AuthShell
      title="Create your account"
      subtitle={<>Already have one? <Link href={`/login?next=${encodeURIComponent(next)}`} className="text-accent underline">Log in</Link></>}
    >
      <SignupForm next={next} />
    </AuthShell>
  );
}
