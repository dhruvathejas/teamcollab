import { notFound } from "next/navigation";
import { Suspense } from "react";
import {
  changeMemberRole,
  removeMember,
  reviewJoinRequest,
  revokeInvite,
} from "@/app/actions/teams";
import { SubmitButton } from "@/components/submit-button";
import { DeleteTeamForm, GeneralSettingsForm, InviteForm } from "@/components/teams/settings-forms";
import { TeamHeader } from "@/components/teams/team-header";
import { Avatar, Badge, Card, CardHeader, EmptyState, PageSkeleton } from "@/components/ui";
import { prisma } from "@/lib/db";
import {
  canChangeRole,
  canManageTeam,
  canRemoveMember,
  isOwner,
  isRole,
  type Role,
} from "@/lib/permissions";
import { requireUser } from "@/lib/session";
import { getTeamForViewer } from "@/lib/teams";

export default function SettingsPage({ params }: PageProps<"/t/[slug]/settings">) {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <Settings params={params} />
    </Suspense>
  );
}

async function Settings({ params }: { params: PageProps<"/t/[slug]/settings">["params"] }) {
  const { slug } = await params;
  const user = await requireUser(`/t/${slug}/settings`);
  const view = await getTeamForViewer(slug, user.id);
  if (!view || !canManageTeam(view.role)) notFound();
  const { team, role } = view;
  const settings = {
    id: team.id,
    name: team.name,
    slug: team.slug,
    description: team.description,
    license: team.license,
    visibility: team.visibility,
  };

  const [requests, invites, members] = await Promise.all([
    prisma.joinRequest.findMany({
      where: { teamId: team.id, status: "PENDING" },
      orderBy: { createdAt: "asc" },
      include: { user: { select: { username: true, name: true } } },
    }),
    prisma.invite.findMany({
      where: { teamId: team.id, status: "PENDING" },
      orderBy: { createdAt: "desc" },
      include: {
        invitee: { select: { username: true } },
        inviter: { select: { username: true } },
      },
    }),
    prisma.membership.findMany({
      where: { teamId: team.id },
      orderBy: { joinedAt: "asc" },
      include: { user: { select: { id: true, username: true, name: true } } },
    }),
  ]);

  return (
    <div className="space-y-6">
      <TeamHeader view={view} current="settings" />

      <Card>
        <CardHeader title={`Join requests (${requests.length})`} />
        {requests.length === 0 ? (
          <EmptyState>No pending requests.</EmptyState>
        ) : (
          <ul className="divide-y divide-line">
            {requests.map((r) => (
              <li key={r.id} className="flex flex-wrap items-start justify-between gap-3 px-5 py-3">
                <div className="flex min-w-0 gap-3">
                  <Avatar name={r.user.username} />
                  <div className="min-w-0">
                    <p className="text-sm font-medium">
                      @{r.user.username}
                      {r.user.name && <span className="font-normal text-muted"> · {r.user.name}</span>}
                    </p>
                    {r.message && <p className="mt-1 whitespace-pre-wrap text-sm text-muted">{r.message}</p>}
                  </div>
                </div>
                <form action={reviewJoinRequest} className="flex gap-2">
                  <input type="hidden" name="requestId" value={r.id} />
                  <SubmitButton name="decision" value="approve">Approve</SubmitButton>
                  <SubmitButton name="decision" value="reject" variant="secondary">Reject</SubmitButton>
                </form>
              </li>
            ))}
          </ul>
        )}
      </Card>

      <Card>
        <CardHeader title="Invites" />
        <div className="space-y-4 px-5 py-4">
          <InviteForm teamId={team.id} />
          {invites.length > 0 && (
            <ul className="divide-y divide-line rounded-lg border border-line">
              {invites.map((inv) => (
                <li key={inv.id} className="flex items-center justify-between gap-3 px-4 py-2 text-sm">
                  <span>
                    @{inv.invitee.username}{" "}
                    <span className="text-muted">· invited by @{inv.inviter.username}</span>
                  </span>
                  <form action={revokeInvite}>
                    <input type="hidden" name="inviteId" value={inv.id} />
                    <SubmitButton variant="ghost" className="!px-2 !py-1 text-xs">Revoke</SubmitButton>
                  </form>
                </li>
              ))}
            </ul>
          )}
        </div>
      </Card>

      <Card>
        <CardHeader title={`Members (${members.length})`} />
        <ul className="divide-y divide-line">
          {members.map((m) => {
            const target = isRole(m.role) ? m.role : "MEMBER";
            const toggleTo: Role = target === "ADMIN" ? "MEMBER" : "ADMIN";
            return (
              <li key={m.id} className="flex flex-wrap items-center gap-3 px-5 py-2.5 text-sm">
                <Avatar name={m.user.username} size={24} />
                <span className="min-w-0 flex-1 truncate">
                  @{m.user.username}
                  {m.user.id === user.id && <span className="text-muted"> (you)</span>}
                </span>
                {target !== "MEMBER" && (
                  <Badge tone="accent">{target === "OWNER" ? "Owner" : "Admin"}</Badge>
                )}
                {canChangeRole(role, target, toggleTo) && (
                  <form action={changeMemberRole}>
                    <input type="hidden" name="membershipId" value={m.id} />
                    <input type="hidden" name="role" value={toggleTo} />
                    <SubmitButton variant="ghost" className="!px-2 !py-1 text-xs">
                      {toggleTo === "ADMIN" ? "Make admin" : "Remove admin"}
                    </SubmitButton>
                  </form>
                )}
                {canRemoveMember(role, target) && (
                  <form action={removeMember}>
                    <input type="hidden" name="membershipId" value={m.id} />
                    <SubmitButton variant="ghost" className="!px-2 !py-1 text-xs text-danger">Remove</SubmitButton>
                  </form>
                )}
              </li>
            );
          })}
        </ul>
      </Card>

      <Card>
        <CardHeader title="General" />
        <div className="px-5 py-5">
          <GeneralSettingsForm team={settings} isOwner={isOwner(role)} />
        </div>
      </Card>

      {isOwner(role) && (
        <Card className="border-danger/40">
          <CardHeader title={<span className="text-danger">Danger zone</span>} />
          <div className="px-5 py-5">
            <DeleteTeamForm team={settings} />
          </div>
        </Card>
      )}
    </div>
  );
}
