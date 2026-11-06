import type { Metadata } from "next";
import { Suspense } from "react";
import { NewTeamForm } from "@/components/teams/new-team-form";
import { Card, PageSkeleton } from "@/components/ui";
import { requireUser } from "@/lib/session";

export const metadata: Metadata = { title: "New team" };

export default function NewTeamPage() {
  return (
    <div className="mx-auto max-w-xl">
      <h1 className="text-2xl font-bold tracking-tight">Create a team</h1>
      <p className="mt-1 text-sm text-muted">You&apos;ll be the owner. You can invite people right after.</p>
      <Card className="mt-6 p-6">
        <Suspense fallback={<PageSkeleton />}>
          <Gate />
        </Suspense>
      </Card>
    </div>
  );
}

async function Gate() {
  await requireUser("/teams/new");
  return <NewTeamForm />;
}
