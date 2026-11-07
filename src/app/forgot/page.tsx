import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { Suspense } from "react";
import { AuthShell } from "@/components/auth/auth-shell";
import { ForgotForm } from "@/components/auth/forgot-forms";
import { PageSkeleton } from "@/components/ui";
import { getCurrentUser } from "@/lib/session";

export const metadata: Metadata = { title: "Forgot password" };

export default function ForgotPage() {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <Forgot />
    </Suspense>
  );
}

async function Forgot() {
  if (await getCurrentUser()) redirect("/");
  return (
    <AuthShell
      title="Forgot your password?"
      subtitle={<>We&apos;ll email you a code. Remembered it? <Link href="/login" className="text-accent underline">Log in</Link></>}
    >
      <ForgotForm />
    </AuthShell>
  );
}
