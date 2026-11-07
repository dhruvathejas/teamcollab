import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { Avatar, Badge, Card, CardHeader, EmptyState, Notice, PageSkeleton, buttonStyles, inputStyles } from "@/components/ui";
import { prisma } from "@/lib/db";
import { accountStatus, adminInfoOf, siteAdminEmails } from "@/lib/moderation";
import { requireUser } from "@/lib/session";

export const metadata: Metadata = { title: "Admin" };

export default function AdminPage({ searchParams }: PageProps<"/admin">) {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <Admin searchParams={searchParams} />
    </Suspense>
  );
}

async function Admin({ searchParams }: { searchParams: PageProps<"/admin">["searchParams"] }) {
  const admin = await requireUser("/admin");
  if (!admin.siteAdmin) notFound();

  const params = await searchParams;
  const raw = params.q;
  const deleted = typeof params.deleted === "string" ? params.deleted.slice(0, 40) : null;
  const q = (Array.isArray(raw) ? raw[0] : raw)?.replace(/\u0000/g, "").trim().slice(0, 100) ?? "";
  const users = await prisma.user.findMany({
    where: q
      ? {
          OR: [
            { username: { contains: q, mode: "insensitive" } },
            { email: { contains: q, mode: "insensitive" } },
            { name: { contains: q, mode: "insensitive" } },
          ],
        }
      : undefined,
    orderBy: { createdAt: "desc" },
    take: 100,
    include: {
      adminGrant: true,
      _count: { select: { memberships: true, ownedTeams: true } },
    },
  });

  // Everyone with admin rights: root admins (SITE_ADMIN_EMAILS) and granted ones.
  const [roots, granted] = await Promise.all([
    prisma.user.findMany({
      where: { email: { in: [...siteAdminEmails()] }, emailVerified: { not: null } },
      select: { id: true, username: true },
    }),
    prisma.siteAdmin.findMany({
      orderBy: { createdAt: "asc" },
      include: { user: { select: { id: true, username: true } }, addedBy: { select: { username: true } } },
    }),
  ]);
  const rootIds = new Set(roots.map((r) => r.id));

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Site admin</h1>
        <p className="text-sm text-muted">
          Moderate accounts. You also have owner powers in every team: open any team to manage it.
        </p>
      </div>
      {deleted && <Notice tone="success">Account @{deleted} was deleted.</Notice>}
      <Card>
        <CardHeader title={`Admins (${roots.length + granted.filter((g) => !rootIds.has(g.userId)).length})`} />
        <ul className="divide-y divide-line">
          {roots.map((r) => (
            <li key={r.id}>
              <Link href={`/admin/users/${r.id}`} className="flex items-center gap-3 px-5 py-2.5 text-sm hover:bg-surface-2">
                <span className="flex-1 font-medium">@{r.username}{r.id === admin.id && <span className="font-normal text-muted"> (you)</span>}</span>
                <Badge tone="accent">Root admin</Badge>
              </Link>
            </li>
          ))}
          {granted.filter((g) => !rootIds.has(g.userId)).map((g) => (
            <li key={g.userId}>
              <Link href={`/admin/users/${g.userId}`} className="flex flex-wrap items-center gap-3 px-5 py-2.5 text-sm hover:bg-surface-2">
                <span className="flex-1 font-medium">@{g.user.username}{g.userId === admin.id && <span className="font-normal text-muted"> (you)</span>}</span>
                <span className="text-xs text-muted">
                  {g.addedBy ? `added by @${g.addedBy.username}` : "added by a deleted account"}
                  {g.canAddAdmins ? " · can add admins" : ""}
                  {!g.suspendable || !g.bannable || !g.deletable ? " · protected" : ""}
                </span>
                <Badge tone="accent">Admin</Badge>
              </Link>
            </li>
          ))}
        </ul>
      </Card>
      <form className="flex gap-2" role="search">
        <label htmlFor="q" className="sr-only">Search accounts</label>
        <input id="q" name="q" defaultValue={q} placeholder="Search by username, email or name" className={inputStyles} />
        <button type="submit" className={buttonStyles.secondary}>Search</button>
      </form>
      <Card>
        <CardHeader title={`Accounts (${users.length}${users.length === 100 ? "+" : ""})`} />
        {users.length === 0 ? (
          <EmptyState>No accounts match.</EmptyState>
        ) : (
          <ul className="divide-y divide-line">
            {users.map((u) => {
              const status = accountStatus(u);
              return (
                <li key={u.id}>
                  <Link href={`/admin/users/${u.id}`} className="flex flex-wrap items-center gap-3 px-5 py-3 text-sm hover:bg-surface-2">
                    <Avatar name={u.username} />
                    <span className="min-w-0 flex-1">
                      <span className="font-medium">@{u.username}</span>
                      <span className="block truncate text-xs text-muted">{u.email}</span>
                    </span>
                    {(() => {
                      const info = adminInfoOf(u);
                      return info ? <Badge tone="accent">{info.kind === "root" ? "Root admin" : "Admin"}</Badge> : null;
                    })()}
                    {status.state === "banned" && <Badge tone="danger">Banned</Badge>}
                    {status.state === "suspended" && <Badge tone="danger">Suspended</Badge>}
                    <span className="text-xs text-muted">
                      {u._count.memberships} team{u._count.memberships === 1 ? "" : "s"}
                    </span>
                  </Link>
                </li>
              );
            })}
          </ul>
        )}
      </Card>
    </div>
  );
}
