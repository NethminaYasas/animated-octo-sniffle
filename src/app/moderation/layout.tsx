import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { connection } from "next/server";
import type { ReactNode } from "react";

import { ForumShell } from "@/components/forum-shell";
import { getServerSession } from "@/lib/auth/server-user";

export const instant = false;

export default async function ModerationLayout({
  children,
}: {
  children: ReactNode;
}) {
  await connection();

  const { user } = await getServerSession();

  if (!user) {
    redirect("/login?next=/moderation");
  }

  const isStaff =
    !user.isBanned &&
    (user.role === "moderator" || user.role === "admin");

  if (!isStaff) {
    notFound();
  }

  const isAdmin = user.role === "admin";

  return (
    <ForumShell activeBoard={undefined}>
      <div className="mx-auto w-full max-w-5xl">
        <div className="border-b border-line pb-3">
          <h1 className="text-lg font-semibold tracking-tight text-ink">
            Moderation
          </h1>
          <p className="text-xs text-muted">
            Signed in as @{user.username} · {isAdmin ? "admin" : "moderator"}
          </p>
        </div>

        <nav
          aria-label="Moderation sections"
          className="mt-3 flex flex-wrap gap-2 border-b border-line pb-3"
        >
          <Link
            href="/moderation"
            className="rounded-full bg-surface-muted px-3 py-1.5 text-xs font-semibold text-muted hover:text-ink"
          >
            Overview
          </Link>
          <Link
            href="/moderation/reports"
            className="rounded-full bg-surface-muted px-3 py-1.5 text-xs font-semibold text-muted hover:text-ink"
          >
            Reports
          </Link>
          <Link
            href="/moderation/log"
            className="rounded-full bg-surface-muted px-3 py-1.5 text-xs font-semibold text-muted hover:text-ink"
          >
            Mod log
          </Link>
          <Link
            href="/moderation/uploads"
            className="rounded-full bg-surface-muted px-3 py-1.5 text-xs font-semibold text-muted hover:text-ink"
          >
            Uploads
          </Link>
          <Link
            href="/moderation/members"
            className="rounded-full bg-surface-muted px-3 py-1.5 text-xs font-semibold text-muted hover:text-ink"
          >
            Members
          </Link>
          {isAdmin ? (
            <Link
              href="/moderation/invites"
              className="rounded-full bg-surface-muted px-3 py-1.5 text-xs font-semibold text-muted hover:text-ink"
            >
              Invite codes
            </Link>
          ) : null}
        </nav>

        <div className="mt-4">{children}</div>
      </div>
    </ForumShell>
  );
}
