import type { Metadata } from "next";
import { Suspense } from "react";
import { TeamCard } from "@/components/team-card";
import { Card, EmptyState, PageSkeleton, buttonStyles, inputStyles } from "@/components/ui";
import { prisma } from "@/lib/db";

export const metadata: Metadata = { title: "Explore teams" };

export default function ExplorePage({ searchParams }: PageProps<"/explore">) {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Explore public teams</h1>
        <p className="text-sm text-muted">Find a team to join, or get inspired for your own.</p>
      </div>
      <Suspense fallback={<PageSkeleton />}>
        <Results searchParams={searchParams} />
      </Suspense>
    </div>
  );
}

async function Results({ searchParams }: { searchParams: PageProps<"/explore">["searchParams"] }) {
  const raw = (await searchParams).q;
  // Postgres can't compare against U+0000, so drop it from the query.
  const q = (Array.isArray(raw) ? raw[0] : raw)?.replace(/\u0000/g, "").trim().slice(0, 100) ?? "";

  const teams = await prisma.team.findMany({
    where: {
      visibility: "PUBLIC",
      ...(q && {
        OR: [
          { name: { contains: q, mode: "insensitive" } },
          { description: { contains: q, mode: "insensitive" } },
          { slug: { contains: q, mode: "insensitive" } },
        ],
      }),
    },
    orderBy: { createdAt: "desc" },
    take: 60,
    include: { _count: { select: { memberships: true } } },
  });

  return (
    <>
      <form className="flex gap-2" role="search">
        <label htmlFor="q" className="sr-only">Search teams</label>
        <input id="q" name="q" defaultValue={q} placeholder="Search by name or description" className={inputStyles} />
        <button type="submit" className={buttonStyles.secondary}>Search</button>
      </form>
      {teams.length === 0 ? (
        <Card>
          <EmptyState>{q ? `No public teams match "${q}".` : "No public teams yet. Be the first!"}</EmptyState>
        </Card>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {teams.map((t) => (
            <TeamCard key={t.id} team={{ ...t, memberCount: t._count.memberships }} />
          ))}
        </div>
      )}
    </>
  );
}
