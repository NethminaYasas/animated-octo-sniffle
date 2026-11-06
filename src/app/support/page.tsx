import type { Metadata } from "next";
import { ArrowUpRight, Bug, KeyRound, LifeBuoy, MessageSquare } from "lucide-react";
import Link from "next/link";

import { ForumShell } from "@/components/forum-shell";

export const metadata: Metadata = {
  title: "Support · kaluwo",
};

const ISSUES_URL =
  "https://github.com/NethminaYasas/animated-octo-sniffle/issues";

export default function SupportPage() {
  return (
    <ForumShell activeBoard={undefined}>
      <div className="mx-auto w-full max-w-2xl">
        <div className="flex items-start gap-3 border-b border-line pb-4">
          <span className="grid size-10 shrink-0 place-items-center rounded-full bg-orange-700 text-white">
            <LifeBuoy className="size-5" aria-hidden="true" />
          </span>
          <div>
            <h1 className="text-lg font-semibold tracking-tight text-ink">
              Support
            </h1>
            <p className="mt-1 text-sm text-muted">
              Need a hand with kaluwo? Start with one of these options.
            </p>
          </div>
        </div>

        <div className="mt-5 grid gap-3 sm:grid-cols-2">
          <section className="rounded-xl border border-line bg-surface p-4">
            <KeyRound className="size-5 text-muted" aria-hidden="true" />
            <h2 className="mt-2 text-sm font-semibold text-ink">
              Account help
            </h2>
            <p className="mt-1 text-xs leading-5 text-muted">
              Sign in with Google or your username and password, or reset a
              forgotten password.
            </p>
            <div className="mt-3 flex flex-wrap gap-x-3 gap-y-1 text-xs font-semibold">
              <Link
                className="text-orange-700 hover:underline dark:text-orange-400"
                href="/login"
              >
                Log in
              </Link>
              <Link
                className="text-orange-700 hover:underline dark:text-orange-400"
                href="/forgot-password"
              >
                Reset password
              </Link>
            </div>
          </section>

          <section className="rounded-xl border border-line bg-surface p-4">
            <MessageSquare className="size-5 text-muted" aria-hidden="true" />
            <h2 className="mt-2 text-sm font-semibold text-ink">
              Ask the community
            </h2>
            <p className="mt-1 text-xs leading-5 text-muted">
              Post in the Technology board when you need help from other
              members.
            </p>
            <Link
              className="mt-3 inline-block text-xs font-semibold text-orange-700 hover:underline dark:text-orange-400"
              href="/?board=technology"
            >
              Open the Technology board
            </Link>
          </section>

          <section className="rounded-xl border border-line bg-surface p-4 sm:col-span-2">
            <Bug className="size-5 text-muted" aria-hidden="true" />
            <h2 className="mt-2 text-sm font-semibold text-ink">
              Report a problem
            </h2>
            <p className="mt-1 text-xs leading-5 text-muted">
              Found a bug or something that does not work as expected? Open an
              issue in the project repository and include what you were doing
              when it happened.
            </p>
            <a
              className="mt-3 inline-flex items-center gap-1 text-xs font-semibold text-orange-700 hover:underline dark:text-orange-400"
              href={ISSUES_URL}
              target="_blank"
              rel="noreferrer"
            >
              Open the issue tracker
              <ArrowUpRight className="size-3.5" aria-hidden="true" />
            </a>
          </section>
        </div>
      </div>
    </ForumShell>
  );
}
