import { UserRound } from "lucide-react";
import Link from "next/link";

import { ForumShell } from "@/components/forum-shell";

export default function ProfileNotFound() {
  return (
    <ForumShell activeBoard={undefined}>
      <div className="mx-auto w-full max-w-3xl">
        <div className="rounded-xl border border-line bg-surface px-5 py-12 text-center">
          <span className="mx-auto grid size-12 place-items-center rounded-full bg-surface-muted text-muted">
            <UserRound className="size-6" aria-hidden="true" />
          </span>
          <h1 className="mt-3 text-lg font-bold tracking-tight text-ink">
            Profile not found
          </h1>
          <p className="mx-auto mt-1 max-w-sm text-sm leading-6 text-muted">
            This member does not exist or has changed their username.
          </p>
          <Link
            href="/"
            className="mt-4 inline-block rounded-full bg-orange-700 px-4 py-1.5 text-xs font-semibold text-white transition-colors hover:bg-orange-800 dark:bg-orange-600 dark:hover:bg-orange-500"
          >
            Back to the forum
          </Link>
        </div>
      </div>
    </ForumShell>
  );
}
