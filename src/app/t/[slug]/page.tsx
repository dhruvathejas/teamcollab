import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import ReactMarkdown from "react-markdown";
import {
  cancelJoinRequest,
  deleteFile,
  leaveTeam,
  respondToInvite,
} from "@/app/actions/teams";
import { SubmitButton } from "@/components/submit-button";
import { FileUploader } from "@/components/teams/file-uploader";
import { JoinRequestForm } from "@/components/teams/join-request-form";
import { TeamHeader } from "@/components/teams/team-header";
import { Avatar, Badge, ButtonLink, Card, CardHeader, EmptyState, PageSkeleton } from "@/components/ui";
import { prisma } from "@/lib/db";
import { formatBytes, isReadme } from "@/lib/files";
import { getLicense } from "@/lib/licenses";
import { canDeleteFile, canLeave, canRequestToJoin, canWriteFiles } from "@/lib/permissions";
import { getCurrentUser } from "@/lib/session";
import { getBlob } from "@/lib/storage";
import { getTeamForViewer, type TeamView } from "@/lib/teams";

export default function TeamPage({ params }: PageProps<"/t/[slug]">) {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <Team params={params} />
    </Suspense>
  );
}

async function Team({ params }: { params: PageProps<"/t/[slug]">["params"] }) {
  const { slug } = await params;
  const user = await getCurrentUser();
  const view = await getTeamForViewer(slug, user?.id);
  if (!view) notFound();

  const { team, role } = view;
  // Invitees to a private team see the header only, until they accept.
  const contentVisible = team.visibility === "PUBLIC" || role !== null;

  return (
    <div className="space-y-6">
      <TeamHeader view={view} current="overview" actions={<Actions view={view} signedIn={Boolean(user)} />} />
      {contentVisible ? (
        <div className="grid gap-6 lg:grid-cols-[1fr_16rem]">
          <div className="min-w-0 space-y-6">
            <Files view={view} userId={user?.id} />
            <Readme view={view} />
          </div>
          <Members teamId={team.id} />
        </div>
      ) : (
        <Card>
          <EmptyState>This team is private. Accept the invite to see its files and members.</EmptyState>
        </Card>
      )}
    </div>
  );
}

function Actions({ view, signedIn }: { view: TeamView; signedIn: boolean }) {
  const { team, role, pendingInvite, pendingRequest } = view;

  if (pendingInvite) {
    return (
      <form action={respondToInvite} className="flex items-center gap-2">
        <span className="text-sm text-muted">You&apos;re invited!</span>
        <input type="hidden" name="inviteId" value={pendingInvite.id} />
        <SubmitButton name="decision" value="accept">Accept invite</SubmitButton>
        <SubmitButton name="decision" value="decline" variant="secondary">Decline</SubmitButton>
      </form>
    );
  }
  if (pendingRequest) {
    return (
      <form action={cancelJoinRequest} className="flex items-center gap-2">
        <Badge>Join request pending</Badge>
        <input type="hidden" name="requestId" value={pendingRequest.id} />
        <SubmitButton variant="ghost">Cancel</SubmitButton>
      </form>
    );
  }
  if (canRequestToJoin(team.visibility, role)) {
    return signedIn ? (
      <JoinRequestForm teamId={team.id} />
    ) : (
      <ButtonLink href={`/login?next=${encodeURIComponent(`/t/${team.slug}`)}`}>Log in to join</ButtonLink>
    );
  }
  if (canLeave(role)) {
    return (
      <form action={leaveTeam}>
        <input type="hidden" name="teamId" value={team.id} />
        <SubmitButton variant="secondary" pendingText="Leaving…">Leave team</SubmitButton>
      </form>
    );
  }
  return null;
}

async function Files({ view, userId }: { view: TeamView; userId?: string }) {
  const { team, role } = view;
  const files = await prisma.teamFile.findMany({
    where: { teamId: team.id },
    orderBy: { name: "asc" },
    include: { uploadedBy: { select: { username: true } } },
  });
  const writable = canWriteFiles(role);
  // README first, like most code hosts.
  files.sort((a, b) => Number(isReadme(b.name)) - Number(isReadme(a.name)));

  return (
    <Card>
      <CardHeader
        title={`Files (${files.length})`}
        action={writable ? <FileUploader teamId={team.id} /> : undefined}
      />
      {files.length === 0 ? (
        <EmptyState>{writable ? "No files yet. Upload the first one." : "No files yet."}</EmptyState>
      ) : (
        <ul className="divide-y divide-line">
          {files.map((f) => (
            <li key={f.id} className="flex items-center gap-3 px-5 py-2.5 text-sm">
              <a href={`/api/files/${f.id}`} className="min-w-0 flex-1 truncate font-medium hover:text-accent" download>
                {f.name}
              </a>
              <span className="hidden text-xs text-muted sm:inline">
                {f.uploadedBy?.username ? `@${f.uploadedBy.username} · ` : ""}
                {f.updatedAt.toLocaleDateString("en", { month: "short", day: "numeric", year: "numeric" })}
              </span>
              <span className="w-16 text-right text-xs text-muted">{formatBytes(f.size)}</span>
              {userId && canDeleteFile(role, userId, f.uploadedById) && (
                <form action={deleteFile}>
                  <input type="hidden" name="fileId" value={f.id} />
                  <SubmitButton variant="ghost" className="!px-2 !py-1 text-xs" pendingText="…">Delete</SubmitButton>
                </form>
              )}
            </li>
          ))}
        </ul>
      )}
      <p className="border-t border-line px-5 py-2.5 text-xs text-muted">
        All files are licensed under the{" "}
        <a href={getLicense(team.license).url} target="_blank" rel="noreferrer" className="text-accent underline">
          {getLicense(team.license).name}
        </a>.
      </p>
    </Card>
  );
}

const README_PREVIEW_BYTES = 200_000;

async function Readme({ view }: { view: TeamView }) {
  const { team, role } = view;
  const files = await prisma.teamFile.findMany({ where: { teamId: team.id }, select: { name: true, storageKey: true } });
  const readme = files.find((f) => isReadme(f.name));
  const editLink = canWriteFiles(role) ? (
    <Link href={`/t/${team.slug}/readme`} className="text-sm text-accent hover:underline">
      {readme ? "Edit" : "Add README"}
    </Link>
  ) : undefined;

  if (!readme) {
    return editLink ? (
      <Card>
        <CardHeader title="README.md" action={editLink} />
        <EmptyState>Add a README to tell people what this team is about.</EmptyState>
      </Card>
    ) : null;
  }

  let text: string;
  try {
    text = (await getBlob(readme.storageKey)).subarray(0, README_PREVIEW_BYTES).toString("utf8");
  } catch {
    text = "_README content is unavailable._";
  }

  return (
    <Card>
      <CardHeader title="README.md" action={editLink} />
      {/* react-markdown does not render raw HTML, so user content can't inject scripts. */}
      <article className="prose-readme px-6 py-5">
        <ReactMarkdown>{text}</ReactMarkdown>
      </article>
    </Card>
  );
}

async function Members({ teamId }: { teamId: string }) {
  const members = await prisma.membership.findMany({
    where: { teamId },
    include: { user: { select: { username: true, name: true } } },
  });
  const order = { OWNER: 0, ADMIN: 1, MEMBER: 2 } as Record<string, number>;
  members.sort((a, b) => order[a.role] - order[b.role] || a.joinedAt.getTime() - b.joinedAt.getTime());

  return (
    <Card className="self-start">
      <CardHeader title={`Members (${members.length})`} />
      <ul className="space-y-2.5 px-5 py-4">
        {members.map((m) => (
          <li key={m.id} className="flex items-center gap-2 text-sm">
            <Avatar name={m.user.username} size={24} />
            <span className="min-w-0 flex-1 truncate">@{m.user.username}</span>
            {m.role !== "MEMBER" && (
              <span className="text-xs text-muted">{m.role === "OWNER" ? "Owner" : "Admin"}</span>
            )}
          </li>
        ))}
      </ul>
    </Card>
  );
}
