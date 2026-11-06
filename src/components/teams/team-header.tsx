import Link from "next/link";
import { getLicense } from "@/lib/licenses";
import type { TeamView } from "@/lib/teams";
import { Badge } from "../ui";

export function TeamHeader({
  view,
  actions,
  current,
}: {
  view: TeamView;
  actions?: React.ReactNode;
  current: "overview" | "settings" | "readme";
}) {
  const { team, role } = view;
  const license = getLicense(team.license);
  const canManage = role === "OWNER" || role === "ADMIN";
  const tab = (active: boolean) =>
    `border-b-2 px-1 pb-2 text-sm ${active ? "border-accent font-medium text-fg" : "border-transparent text-muted hover:text-fg"}`;

  return (
    <div className="space-y-4 border-b border-line">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0 space-y-2">
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-2xl font-bold tracking-tight">{team.name}</h1>
            <Badge tone={team.visibility === "PUBLIC" ? "success" : "neutral"}>
              {team.visibility === "PUBLIC" ? "Public" : "Private"}
            </Badge>
            <a href={license.url} target="_blank" rel="noreferrer" title={license.summary}>
              <Badge tone="accent">{license.id}</Badge>
            </a>
          </div>
          {team.description && <p className="max-w-2xl text-muted">{team.description}</p>}
          <p className="text-sm text-muted">
            Owned by @{team.owner.username} · {team._count.memberships} member
            {team._count.memberships === 1 ? "" : "s"}
          </p>
        </div>
        {actions && <div className="flex flex-wrap items-start gap-2">{actions}</div>}
      </div>
      <nav className="flex gap-5" aria-label="Team">
        <Link href={`/t/${team.slug}`} className={tab(current === "overview")}>Overview</Link>
        {canManage && (
          <Link href={`/t/${team.slug}/settings`} className={tab(current === "settings")}>Settings</Link>
        )}
      </nav>
    </div>
  );
}
