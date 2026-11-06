import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { removeMember } from "@/app/actions/teams";
import { ModerationPanel } from "@/components/admin/moderation-forms";
import { SubmitButton } from "@/components/submit-button";
import { Avatar, Badge, Card, CardHeader, EmptyState, PageSkeleton } from "@/components/ui";
import { prisma } from "@/lib/db";
import { accountStatus, isSiteAdmin } from "@/lib/moderation";
import { requireUser } from "@/lib/session";

export const metadata: Metadata = { title: "Account · Admin" };

export default function AdminUserPage({ params }: PageProps<"/admin/users/[id]">) {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <AdminUser params={params} />
    </Suspense>
  );
}

const fmt = (d: Date) => d.toLocaleString("en", { dateStyle: "medium", timeStyle: "short", timeZone: "UTC" }) + " UTC";

async function AdminUser({ params }: { params: PageProps<"/admin/users/[id]">["params"] }) {
  const { id } = await params;
  const admin = await requireUser(`/admin/users/${id}`);
  if (!admin.siteAdmin) notFound();

  const user = await prisma.user.findUnique({
    where: { id },
    include: {
      memberships: {
        orderBy: { joinedAt: "asc" },
        include: { team: { select: { name: true, slug: true, visibility: true } } },
      },
    },
  });
  if (!user) notFound();

  const status = accountStatus(user);
  const protectedAccount = isSiteAdmin(user);
  const owned = user.memberships.filter((m) => m.role === "OWNER").map((m) => m.team.name);

  return (
    <div className="space-y-6">
      <Link href="/admin" className="text-sm text-accent hover:underline">← All accounts</Link>

      <div className="flex flex-wrap items-center gap-3">
        <Avatar name={user.username} size={40} />
        <div className="min-w-0">
          <h1 className="text-2xl font-bold tracking-tight">@{user.username}</h1>
          <p className="text-sm text-muted">
            {user.name ? `${user.name} · ` : ""}{user.email} · joined {fmt(user.createdAt)}
          </p>
        </div>
        {protectedAccount && <Badge tone="accent">Site admin</Badge>}
        {status.state === "active" && !protectedAccount && <Badge tone="success">Active</Badge>}
        {status.state === "banned" && <Badge tone="danger">Banned</Badge>}
        {status.state === "suspended" && <Badge tone="danger">Suspended until {fmt(status.until)}</Badge>}
      </div>
      {status.state !== "active" && status.reason && (
        <p className="text-sm text-muted">Reason: {status.reason}</p>
      )}

      <Card>
        <CardHeader title={`Teams (${user.memberships.length})`} />
        {user.memberships.length === 0 ? (
          <EmptyState>Not in any team.</EmptyState>
        ) : (
          <ul className="divide-y divide-line">
            {user.memberships.map((m) => (
              <li key={m.id} className="flex flex-wrap items-center gap-3 px-5 py-2.5 text-sm">
                <Link href={`/t/${m.team.slug}`} className="min-w-0 flex-1 truncate font-medium hover:text-accent">
                  {m.team.name}
                </Link>
                {m.team.visibility === "PRIVATE" && <Badge>Private</Badge>}
                <span className="text-xs text-muted">{m.role === "OWNER" ? "Owner" : m.role === "ADMIN" ? "Admin" : "Member"}</span>
                {m.role !== "OWNER" && !protectedAccount && (
                  <form action={removeMember}>
                    <input type="hidden" name="membershipId" value={m.id} />
                    <SubmitButton variant="ghost" className="!px-2 !py-1 text-xs text-danger">Remove from team</SubmitButton>
                  </form>
                )}
              </li>
            ))}
          </ul>
        )}
      </Card>

      {protectedAccount ? (
        <Card className="p-5">
          <p className="text-sm text-muted">Site admin accounts can&apos;t be banned, suspended, signed out or deleted from here.</p>
        </Card>
      ) : (
        <ModerationPanel userId={user.id} username={user.username} status={status.state} ownedTeams={owned} />
      )}
    </div>
  );
}
