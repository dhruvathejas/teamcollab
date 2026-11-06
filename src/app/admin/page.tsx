import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { Avatar, Badge, Card, CardHeader, EmptyState, Notice, PageSkeleton, buttonStyles, inputStyles } from "@/components/ui";
import { prisma } from "@/lib/db";
import { accountStatus, isSiteAdmin } from "@/lib/moderation";
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
    include: { _count: { select: { memberships: true, ownedTeams: true } } },
  });

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Site admin</h1>
        <p className="text-sm text-muted">
          Moderate accounts. You also have owner powers in every team: open any team to manage it.
        </p>
      </div>
      {deleted && <Notice tone="success">Account @{deleted} was deleted.</Notice>}
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
                    {isSiteAdmin(u) && <Badge tone="accent">Site admin</Badge>}
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
