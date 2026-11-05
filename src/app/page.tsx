import Link from "next/link";
import { connection } from "next/server";
import { Suspense, type ReactNode } from "react";

import { ThemeToggle } from "@/components/theme-toggle";
import { checkSupabaseConnection } from "@/lib/supabase/status";

type StatusTone = "neutral" | "success" | "warning" | "error";

const statusStyles: Record<
  StatusTone,
  { container: string; dot: string }
> = {
  neutral: {
    container: "border-line bg-surface text-muted",
    dot: "bg-gray-400",
  },
  success: {
    container: "border-line bg-surface text-muted",
    dot: "bg-emerald-500",
  },
  warning: {
    container:
      "border-amber-200 bg-amber-50 text-amber-900 dark:border-amber-800/70 dark:bg-amber-950/40 dark:text-amber-200",
    dot: "bg-amber-500",
  },
  error: {
    container:
      "border-red-200 bg-red-50 text-red-900 dark:border-red-900/70 dark:bg-red-950/40 dark:text-red-200",
    dot: "bg-red-500",
  },
};

function StatusStrip({
  tone,
  title,
  detail,
}: {
  tone: StatusTone;
  title: string;
  detail?: ReactNode;
}) {
  const styles = statusStyles[tone];

  return (
    <div
      className={`mt-3 flex items-start gap-2 rounded border px-3 py-2 ${styles.container}`}
    >
      <span
        aria-hidden="true"
        className={`mt-1.5 size-2 shrink-0 rounded-full ${styles.dot}`}
      />
      <div className="min-w-0">
        <p className="text-xs font-semibold">{title}</p>
        {detail ? (
          <div className="mt-0.5 text-xs leading-5 opacity-80">{detail}</div>
        ) : null}
      </div>
    </div>
  );
}

async function SupabaseStatus() {
  // Read the environment and check Supabase per request, not at build time.
  await connection();
  const result = await checkSupabaseConnection();

  if (result.state === "connected") {
    return (
      <StatusStrip
        tone="success"
        title="Connected"
        detail="Supabase is reachable and the project settings were accepted."
      />
    );
  }

  if (result.state === "unconfigured") {
    return (
      <StatusStrip
        tone="warning"
        title="Setup needed"
        detail={
          <>
            Add{" "}
            <code className="rounded bg-amber-100 px-1 py-0.5 text-[11px] dark:bg-amber-900/50">
              NEXT_PUBLIC_SUPABASE_URL
            </code>{" "}
            and{" "}
            <code className="rounded bg-amber-100 px-1 py-0.5 text-[11px] dark:bg-amber-900/50">
              NEXT_PUBLIC_SUPABASE_ANON_KEY
            </code>{" "}
            to <code className="text-[11px]">.env.local</code>, then restart the
            dev server. The README has the full steps.
          </>
        }
      />
    );
  }

  return (
    <StatusStrip
      tone="error"
      title="Connection error"
      detail={
        <>
          {result.message} See the troubleshooting section in{" "}
          <code className="text-[11px]">README.md</code>.
        </>
      }
    />
  );
}

function SearchIcon() {
  return (
    <svg
      aria-hidden="true"
      className="size-4 shrink-0"
      fill="none"
      stroke="currentColor"
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth="1.8"
      viewBox="0 0 20 20"
    >
      <circle cx="9" cy="9" r="5.5" />
      <path d="M13.5 13.5 17 17" />
    </svg>
  );
}

function HomeIcon() {
  return (
    <svg
      aria-hidden="true"
      className="size-4 shrink-0"
      fill="none"
      stroke="currentColor"
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth="1.8"
      viewBox="0 0 20 20"
    >
      <path d="m3 8.5 7-5.5 7 5.5V17h-5v-5H8v5H3z" />
    </svg>
  );
}

function TrendingIcon() {
  return (
    <svg
      aria-hidden="true"
      className="size-4 shrink-0"
      fill="none"
      stroke="currentColor"
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth="1.8"
      viewBox="0 0 20 20"
    >
      <path d="m3 13 4.5-5 3 3 5.5-7" />
      <path d="M12 4h4v4" />
    </svg>
  );
}

function GridIcon() {
  return (
    <svg
      aria-hidden="true"
      className="size-4 shrink-0"
      fill="none"
      stroke="currentColor"
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth="1.8"
      viewBox="0 0 20 20"
    >
      <rect height="5" rx="1" width="5" x="3" y="3" />
      <rect height="5" rx="1" width="5" x="12" y="3" />
      <rect height="5" rx="1" width="5" x="3" y="12" />
      <rect height="5" rx="1" width="5" x="12" y="12" />
    </svg>
  );
}

function PlusIcon() {
  return (
    <svg
      aria-hidden="true"
      className="size-3.5"
      fill="none"
      stroke="currentColor"
      strokeLinecap="round"
      strokeWidth="2"
      viewBox="0 0 20 20"
    >
      <path d="M10 4v12M4 10h12" />
    </svg>
  );
}

function CommentIcon() {
  return (
    <svg
      aria-hidden="true"
      className="size-3.5"
      fill="none"
      stroke="currentColor"
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth="1.8"
      viewBox="0 0 20 20"
    >
      <path d="M4 4h12v9H9l-4 3v-3H4z" />
    </svg>
  );
}

const boards = [
  { name: "General", initial: "G" },
  { name: "Technology", initial: "T" },
  { name: "Life in Sri Lanka", initial: "L" },
  { name: "Food", initial: "F" },
  { name: "Travel", initial: "T" },
  { name: "Sports", initial: "S" },
];

function BoardNav() {
  return (
    <nav aria-label="Forum navigation" className="sticky top-20 space-y-0.5">
      <Link
        className="flex items-center gap-2.5 rounded bg-surface-muted px-3 py-2 text-sm font-medium text-ink"
        href="/"
      >
        <HomeIcon />
        Home
      </Link>
      <div className="flex cursor-default items-center gap-2.5 rounded px-3 py-2 text-sm text-muted">
        <TrendingIcon />
        Popular
        <span className="ml-auto text-[10px] font-semibold uppercase tracking-wide text-faint">
          Soon
        </span>
      </div>
      <div className="flex cursor-default items-center gap-2.5 rounded px-3 py-2 text-sm text-muted">
        <GridIcon />
        All
        <span className="ml-auto text-[10px] font-semibold uppercase tracking-wide text-faint">
          Soon
        </span>
      </div>

      <div className="my-3 border-t border-line" />

      <p className="px-3 pb-1 text-[11px] font-semibold uppercase tracking-wide text-muted">
        Boards
      </p>
      {boards.map((board) => (
        <div
          key={board.name}
          className="flex cursor-default items-center gap-2.5 rounded px-3 py-2 text-sm text-body"
        >
          <span className="grid size-6 shrink-0 place-items-center rounded-full bg-surface-muted text-[10px] font-bold text-muted">
            {board.initial}
          </span>
          <span className="truncate">{board.name}</span>
        </div>
      ))}
      <p className="px-3 pt-3 text-[11px] leading-5 text-muted">
        Boards open when the database is added.
      </p>
    </nav>
  );
}

export default function Home() {
  return (
    <main className="flex flex-1 flex-col">
      <header className="sticky top-0 z-30 border-b border-line bg-surface">
        <div className="mx-auto flex h-14 max-w-5xl items-center gap-3 px-3 sm:px-4">
          <Link
            aria-label="kaluwo home"
            className="flex shrink-0 items-center gap-2"
            href="/"
          >
            <span className="grid size-8 place-items-center rounded-full bg-orange-700 text-sm font-bold text-white">
              k
            </span>
            <span className="text-xl font-bold tracking-tight text-ink">
              kaluwo
            </span>
          </Link>

          <div className="ml-auto hidden min-w-0 flex-1 justify-center px-4 md:flex">
            <div className="flex h-9 w-full max-w-lg items-center gap-2 rounded-full border border-line bg-surface-muted px-3 text-sm text-muted">
              <SearchIcon />
              <span className="truncate">Search kaluwo</span>
              <span className="ml-auto shrink-0 text-[10px] font-semibold uppercase tracking-wide text-faint">
                Soon
              </span>
            </div>
          </div>

          <div className="ml-auto flex shrink-0 items-center gap-2">
            <ThemeToggle />
            <button
              className="hidden rounded-full border border-orange-700 px-3 py-1.5 text-xs font-semibold text-orange-700 disabled:cursor-not-allowed disabled:opacity-60 dark:border-orange-500 dark:text-orange-400 sm:block"
              disabled
              title="Login arrives in the auth step"
              type="button"
            >
              Log in
            </button>
            <button
              className="rounded-full bg-orange-700 px-3 py-1.5 text-xs font-semibold text-white disabled:cursor-not-allowed disabled:opacity-60"
              disabled
              title="Registration arrives in the auth step"
              type="button"
            >
              Sign up
            </button>
          </div>
        </div>
      </header>

      <div className="mx-auto grid w-full max-w-5xl flex-1 grid-cols-1 gap-6 px-3 py-3 sm:px-4 lg:grid-cols-[200px_minmax(0,1fr)]">
        <div className="hidden lg:block">
          <BoardNav />
        </div>

        <section className="min-w-0">
          <div className="flex items-center justify-between gap-3 border-b border-line pb-3">
            <div>
              <h1 className="text-lg font-semibold tracking-tight text-ink">
                Home
              </h1>
              <p className="text-xs text-muted">
                The front page of kaluwo
              </p>
            </div>
            <button
              className="flex items-center gap-1.5 rounded-full border border-line bg-surface px-3 py-1.5 text-xs font-semibold text-muted disabled:cursor-not-allowed disabled:opacity-70"
              disabled
              title="Posting arrives in a later step"
              type="button"
            >
              <PlusIcon />
              Create post
            </button>
          </div>

          <Suspense
            fallback={
              <StatusStrip
                tone="neutral"
                title="Checking Supabase…"
                detail="Waiting for the project to respond."
              />
            }
          >
            <SupabaseStatus />
          </Suspense>

          <div className="mt-3 flex items-center gap-1 border-b border-line">
            <span className="border-b-2 border-orange-700 px-3 py-2 text-xs font-semibold text-ink dark:border-orange-500">
              Best
            </span>
            <span className="border-b-2 border-transparent px-3 py-2 text-xs font-semibold text-faint">
              Hot
            </span>
            <span className="border-b-2 border-transparent px-3 py-2 text-xs font-semibold text-faint">
              New
            </span>
          </div>

          <article className="mt-3 rounded border border-line bg-surface p-3 sm:p-4">
            <div className="flex flex-wrap items-center gap-x-1.5 gap-y-1 text-[11px] text-muted">
              <span className="grid size-5 place-items-center rounded-full bg-orange-700 text-[10px] font-bold text-white">
                k
              </span>
              <span className="font-semibold text-ink">
                Announcements
              </span>
              <span>•</span>
              <span>Posted by kaluwo</span>
              <span>•</span>
              <span>just now</span>
              <span className="ml-1 rounded bg-orange-50 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-orange-800 dark:bg-orange-950/60 dark:text-orange-300">
                Preview
              </span>
            </div>
            <h2 className="mt-2 text-lg font-semibold leading-6 text-ink">
              Welcome to kaluwo
            </h2>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-body">
              A Sri Lankan discussion forum for boards, threads and replies.
              This is a static preview of a post — real posting and comments
              come in later steps.
            </p>
            <div className="mt-3 flex flex-wrap items-center gap-4 text-[11px] font-semibold text-muted">
              <span className="flex items-center gap-1">
                <CommentIcon />
                0 comments
              </span>
              <span>Share</span>
              <span>Save</span>
            </div>
          </article>

          <div className="mt-3 rounded border border-dashed border-line bg-surface px-4 py-10 text-center">
            <p className="text-sm font-semibold text-ink">
              No more posts yet
            </p>
            <p className="mx-auto mt-1 max-w-sm text-xs leading-5 text-muted">
              Once boards and posting are added, the newest threads will show
              up here.
            </p>
          </div>

          <section className="mt-3 rounded border border-line bg-surface p-3 sm:p-4">
            <h2 className="text-[11px] font-semibold uppercase tracking-wide text-muted">
              Languages
            </h2>
            <div className="mt-2 grid gap-3 sm:grid-cols-2">
              <div>
                <p className="text-[11px] text-muted">Sinhala</p>
                <p
                  className="font-sinhala text-sm leading-7 text-ink"
                  lang="si"
                >
                  ආයුබෝවන්! මෙය සිංහල පෙළක්.
                </p>
              </div>
              <div>
                <p className="text-[11px] text-muted">Tamil</p>
                <p
                  className="font-tamil text-sm leading-7 text-ink"
                  lang="ta"
                >
                  வணக்கம்! இது ஒரு தமிழ் உரை.
                </p>
              </div>
            </div>
            <p className="mt-2 border-t border-line pt-2 text-[11px] leading-5 text-muted">
              The interface starts in English and will be translated later.
            </p>
          </section>
        </section>
      </div>

      <footer className="mt-4 border-t border-line bg-surface">
        <div className="mx-auto flex max-w-5xl flex-wrap items-center justify-between gap-2 px-4 py-4 text-[11px] text-muted">
          <p>kaluwo — a Sri Lankan discussion forum.</p>
          <p>Foundation preview · Built with Next.js and Supabase.</p>
        </div>
      </footer>
    </main>
  );
}
