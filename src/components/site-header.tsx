import Link from "next/link";
import { Suspense } from "react";
import { logout } from "@/app/actions/auth";
import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/session";
import { Avatar, ButtonLink, buttonStyles } from "./ui";

export function SiteHeader() {
  return (
    <header className="sticky top-0 z-10 border-b border-line bg-surface/90 backdrop-blur">
      <div className="mx-auto flex h-14 max-w-5xl items-center gap-2 px-4 sm:gap-4">
        <Link href="/" className="flex items-center gap-2 font-semibold tracking-tight">
          <span aria-hidden className="inline-flex size-7 items-center justify-center rounded-lg bg-accent text-sm font-bold text-accent-fg">
            tc
          </span>
          <span className="hidden sm:inline">teamcollab</span>
        </Link>
        <nav className="flex items-center gap-1 text-sm">
          <Link href="/explore" className="rounded-md px-2 py-1 text-muted hover:bg-surface-2 hover:text-fg">
            Explore
          </Link>
        </nav>
        <div className="ml-auto flex items-center gap-2">
          <Suspense fallback={<div className="h-8 w-24 animate-pulse rounded-lg bg-surface-2" />}>
            <UserNav />
          </Suspense>
        </div>
      </div>
    </header>
  );
}

async function UserNav() {
  const user = await getCurrentUser();
  if (!user) {
    return (
      <>
        <ButtonLink href="/login" variant="ghost">Log in</ButtonLink>
        <ButtonLink href="/signup">Sign up</ButtonLink>
      </>
    );
  }

  const inviteCount = await prisma.invite.count({ where: { inviteeId: user.id, status: "PENDING" } });

  return (
    <>
      {user.siteAdmin && (
        <Link href="/admin" className="rounded-md px-2 py-1 text-sm font-medium text-accent hover:bg-surface-2">
          Admin
        </Link>
      )}
      <ButtonLink href="/teams/new" variant="secondary" className="hidden sm:inline-flex">
        New team
      </ButtonLink>
      {inviteCount > 0 && (
        <Link
          href="/#invites"
          className="rounded-full bg-accent px-2 py-0.5 text-xs font-semibold text-accent-fg"
          title="Pending invites"
        >
          {inviteCount} invite{inviteCount === 1 ? "" : "s"}
        </Link>
      )}
      <span className="flex items-center gap-2 text-sm">
        <Avatar name={user.username} />
        <span className="hidden max-w-32 truncate md:inline">@{user.username}</span>
      </span>
      <form action={logout}>
        <button type="submit" className={buttonStyles.ghost}>Log out</button>
      </form>
    </>
  );
}
