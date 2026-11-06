import Link from "next/link";
import { getLicense } from "@/lib/licenses";
import { Badge } from "./ui";

export type TeamCardData = {
  slug: string;
  name: string;
  description: string;
  license: string;
  visibility: string;
  memberCount: number;
  role?: string;
};

export function TeamCard({ team }: { team: TeamCardData }) {
  return (
    <Link
      href={`/t/${team.slug}`}
      className="group flex h-full flex-col gap-2 rounded-xl border border-line bg-surface p-4 transition-colors hover:border-accent/50"
    >
      <div className="flex items-start justify-between gap-2">
        <h3 className="font-semibold group-hover:text-accent">{team.name}</h3>
        {team.visibility === "PRIVATE" && <Badge>Private</Badge>}
      </div>
      <p className="line-clamp-2 flex-1 text-sm text-muted">
        {team.description || "No description yet."}
      </p>
      <div className="flex flex-wrap items-center gap-2 text-xs text-muted">
        <span>{team.memberCount} member{team.memberCount === 1 ? "" : "s"}</span>
        <span aria-hidden>·</span>
        <span>{getLicense(team.license).id}</span>
        {team.role && team.role !== "MEMBER" && (
          <Badge tone="accent">{team.role === "OWNER" ? "Owner" : "Admin"}</Badge>
        )}
      </div>
    </Link>
  );
}
