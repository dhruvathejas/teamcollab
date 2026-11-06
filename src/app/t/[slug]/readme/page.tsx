import { notFound } from "next/navigation";
import { Suspense } from "react";
import { ReadmeEditor } from "@/components/teams/readme-editor";
import { TeamHeader } from "@/components/teams/team-header";
import { Card, PageSkeleton } from "@/components/ui";
import { prisma } from "@/lib/db";
import { README_NAME } from "@/lib/files";
import { canWriteFiles } from "@/lib/permissions";
import { requireUser } from "@/lib/session";
import { getBlob } from "@/lib/storage";
import { getTeamForViewer } from "@/lib/teams";

export default function EditReadmePage({ params }: PageProps<"/t/[slug]/readme">) {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <EditReadme params={params} />
    </Suspense>
  );
}

async function EditReadme({ params }: { params: PageProps<"/t/[slug]/readme">["params"] }) {
  const { slug } = await params;
  const user = await requireUser(`/t/${slug}/readme`);
  const view = await getTeamForViewer(slug, user.id);
  if (!view || !canWriteFiles(view.role)) notFound();

  const file = await prisma.teamFile.findUnique({
    where: { teamId_name: { teamId: view.team.id, name: README_NAME } },
  });
  let initial = `# ${view.team.name}\n\n${view.team.description}\n`;
  if (file) {
    try {
      initial = (await getBlob(file.storageKey)).toString("utf8");
    } catch {
      // Keep the template if the blob is missing.
    }
  }

  return (
    <div className="space-y-6">
      <TeamHeader view={view} current="readme" />
      <Card className="p-5">
        <ReadmeEditor teamId={view.team.id} slug={view.team.slug} initial={initial} />
      </Card>
    </div>
  );
}
