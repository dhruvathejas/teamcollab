import Link from "next/link";
import { Suspense } from "react";
import { cancelJoinRequest, respondToInvite } from "@/app/actions/teams";
import { SubmitButton } from "@/components/submit-button";
import { TeamCard } from "@/components/team-card";
import { ButtonLink, Card, CardHeader, EmptyState, PageSkeleton } from "@/components/ui";
import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/session";

export default function HomePage() {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <Home />
    </Suspense>
  );
}

async function Home() {
  const user = await getCurrentUser();
  if (!user) return <Landing />;
  return <Dashboard userId={user.id} username={user.username} />;
}

function Landing() {
  return (
    <div className="mx-auto max-w-2xl py-12 text-center sm:py-20">
      <h1 className="text-4xl font-bold tracking-tight sm:text-5xl">
        Find your team. <span className="text-accent">Build something ambitious.</span>
      </h1>
      <p className="mt-5 text-lg text-muted">
        Create a team around a project, pick a license for its files, and invite people, or ask to
        join public teams already building what you care about.
      </p>
      <div className="mt-8 flex flex-wrap justify-center gap-3">
        <ButtonLink href="/signup">Create an account</ButtonLink>
        <ButtonLink href="/explore" variant="secondary">Explore public teams</ButtonLink>
      </div>
    </div>
  );
}

async function Dashboard({ userId, username }: { userId: string; username: string }) {
  const [memberships, invites, requests] = await Promise.all([
    prisma.membership.findMany({
      where: { userId },
      orderBy: { joinedAt: "desc" },
      include: { team: { include: { _count: { select: { memberships: true } } } } },
    }),
    prisma.invite.findMany({
      where: { inviteeId: userId, status: "PENDING" },
      orderBy: { createdAt: "desc" },
      include: {
        team: { select: { name: true, slug: true, description: true } },
        inviter: { select: { username: true } },
      },
    }),
    prisma.joinRequest.findMany({
      where: { userId, status: "PENDING" },
      orderBy: { createdAt: "desc" },
      include: { team: { select: { name: true, slug: true } } },
    }),
  ]);

  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Welcome back, @{username}</h1>
          <p className="text-sm text-muted">Your teams, invites and requests.</p>
        </div>
        <ButtonLink href="/teams/new">New team</ButtonLink>
      </div>

      {invites.length > 0 && (
        <Card>
          <div id="invites" className="scroll-mt-20" />
          <CardHeader title={`Invites (${invites.length})`} />
          <ul className="divide-y divide-line">
            {invites.map((invite) => (
              <li key={invite.id} className="flex flex-wrap items-center justify-between gap-3 px-5 py-3">
                <div className="min-w-0">
                  <Link href={`/t/${invite.team.slug}`} className="font-medium hover:text-accent">
                    {invite.team.name}
                  </Link>
                  <p className="text-sm text-muted">Invited by @{invite.inviter.username}</p>
                </div>
                <form action={respondToInvite} className="flex gap-2">
                  <input type="hidden" name="inviteId" value={invite.id} />
                  <SubmitButton name="decision" value="accept">Accept</SubmitButton>
                  <SubmitButton name="decision" value="decline" variant="secondary">Decline</SubmitButton>
                </form>
              </li>
            ))}
          </ul>
        </Card>
      )}

      <section className="space-y-3">
        <h2 className="text-lg font-semibold">Your teams</h2>
        {memberships.length === 0 ? (
          <Card>
            <EmptyState>
              You&apos;re not in any teams yet. <Link href="/teams/new" className="text-accent underline">Create one</Link>{" "}
              or <Link href="/explore" className="text-accent underline">explore public teams</Link>.
            </EmptyState>
          </Card>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {memberships.map(({ team, role }) => (
              <TeamCard
                key={team.id}
                team={{ ...team, memberCount: team._count.memberships, role }}
              />
            ))}
          </div>
        )}
      </section>

      {requests.length > 0 && (
        <Card>
          <CardHeader title="Pending join requests" />
          <ul className="divide-y divide-line">
            {requests.map((r) => (
              <li key={r.id} className="flex items-center justify-between gap-3 px-5 py-3">
                <Link href={`/t/${r.team.slug}`} className="font-medium hover:text-accent">{r.team.name}</Link>
                <form action={cancelJoinRequest}>
                  <input type="hidden" name="requestId" value={r.id} />
                  <SubmitButton variant="ghost">Cancel request</SubmitButton>
                </form>
              </li>
            ))}
          </ul>
        </Card>
      )}
    </div>
  );
}
