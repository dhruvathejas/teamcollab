import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { Suspense } from "react";
import { AuthShell } from "@/components/auth/auth-shell";
import { LoginForm } from "@/components/auth/login-form";
import { PageSkeleton } from "@/components/ui";
import { getCurrentUser, safeNext } from "@/lib/session";

export const metadata: Metadata = { title: "Log in" };

export default function LoginPage({ searchParams }: PageProps<"/login">) {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <Login searchParams={searchParams} />
    </Suspense>
  );
}

async function Login({ searchParams }: { searchParams: PageProps<"/login">["searchParams"] }) {
  const params = await searchParams;
  const next = safeNext(params.next);
  if (await getCurrentUser()) redirect(next);

  return (
    <AuthShell
      title="Log in to teamcollab"
      subtitle={<>New here? <Link href={`/signup?next=${encodeURIComponent(next)}`} className="text-accent underline">Create an account</Link></>}
    >
      <LoginForm next={next} />
    </AuthShell>
  );
}
