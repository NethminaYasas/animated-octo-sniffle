import { Lock, MessageSquare, Pin, Plus } from "lucide-react";
import Link from "next/link";
import { connection } from "next/server";
import { Suspense } from "react";

import { ForumShell } from "@/components/forum-shell";
import { UserAvatar } from "@/components/user-avatar";
import { UserHoverCard } from "@/components/user-hover-card";
import { BOARDS } from "@/lib/boards";
import {
  decodeThreadCursor,
  encodeThreadCursor,
  normaliseThreadSort,
  type ThreadSort,
} from "@/lib/forum/cursor";
import { createClient } from "@/lib/supabase/server";

export const instant = false;

const PAGE_SIZE = 20;

type ThreadRow = {
  id: number;
  board_id: string;
  board_name: string;
  title: string;
  author_id: string | null;
  author_username: string | null;
  created_at: string;
  last_post_at: string;
  reply_count: number;
  is_locked: boolean;
  is_pinned: boolean;
};

function formatDate(dateString: string): string {
  const date = new Date(dateString);

  if (Number.isNaN(date.getTime())) {
    return "—";
  }

  // Fixed to UTC so the server and client render the same date.
  return date.toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  });
}

function buildHref(input: {
  board: string | null;
  sort: ThreadSort;
  cursor?: string | null;
}): string {
  const params = new URLSearchParams();

  if (input.board) {
    params.set("board", input.board);
  }

  if (input.sort !== "latest") {
    params.set("sort", input.sort);
  }

  if (input.cursor) {
    params.set("cursor", input.cursor);
  }

  const query = params.toString();

  return query ? `/?${query}` : "/";
}

function SortTabs({
  board,
  sort,
}: {
  board: string | null;
  sort: ThreadSort;
}) {
  const options: Array<{ value: ThreadSort; label: string }> = [
    { value: "latest", label: "Latest activity" },
    { value: "new", label: "Newest" },
  ];

  return (
    <div
      className="mt-3 flex items-center gap-1 border-b border-line"
      role="tablist"
      aria-label="Sort threads"
    >
      {options.map((option) => {
        const selected = sort === option.value;

        return (
          <Link
            key={option.value}
            href={buildHref({ board, sort: option.value })}
            role="tab"
            aria-selected={selected}
            className={`border-b-2 px-3 py-2 text-xs font-semibold transition-colors ${
              selected
                ? "border-orange-700 text-ink dark:border-orange-500"
                : "border-transparent text-faint hover:text-muted"
            }`}
          >
            {option.label}
          </Link>
        );
      })}
    </div>
  );
}

function ThreadCard({ thread }: { thread: ThreadRow }) {
  const author = thread.author_username;
  const initial = author?.slice(0, 1).toUpperCase() ?? "?";

  return (
    <article className="mt-3 flex items-start gap-3 rounded border border-line bg-surface p-3 transition-colors hover:border-orange-700/30 dark:hover:border-orange-500/30 sm:p-4">
      {author ? (
        <UserHoverCard
          username={author}
          initial={initial}
          className="shrink-0 rounded-full focus:outline-none focus-visible:ring-2 focus-visible:ring-orange-600 focus-visible:ring-offset-2"
        >
          <UserAvatar username={author} initial={initial} className="size-10 sm:size-11" />
          <span className="sr-only">{author}</span>
        </UserHoverCard>
      ) : (
        <span className="grid size-10 shrink-0 place-items-center rounded-full bg-surface-muted text-sm font-bold text-muted sm:size-11">
          ?
        </span>
      )}

      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-1.5 text-[11px] text-muted">
          <span className="font-semibold text-ink">{thread.board_name}</span>
          <span aria-hidden="true">•</span>
          <span>
            {author ? (
              <UserHoverCard
                username={author}
                initial={initial}
                className="font-semibold text-muted underline-offset-2 hover:text-ink hover:underline"
              >
                {author}
              </UserHoverCard>
            ) : (
              "deleted member"
            )}
          </span>
          <span aria-hidden="true">•</span>
          <span>Started {formatDate(thread.created_at)}</span>
          {thread.is_pinned ? (
            <span className="inline-flex items-center gap-1 rounded-full bg-orange-50 px-1.5 py-0.5 text-[10px] font-semibold text-orange-800 dark:bg-orange-950/40 dark:text-orange-300">
              <Pin className="size-2.5" aria-hidden="true" />
              Pinned
            </span>
          ) : null}
          {thread.is_locked ? (
            <span className="inline-flex items-center gap-1 rounded-full bg-surface-muted px-1.5 py-0.5 text-[10px] font-semibold text-muted">
              <Lock className="size-2.5" aria-hidden="true" />
              Locked
            </span>
          ) : null}
        </div>

        <Link href={`/t/${thread.id}`} className="mt-1 block">
          <h2 className="text-base font-semibold leading-6 text-ink transition-colors hover:text-orange-700 sm:text-lg dark:hover:text-orange-400">
            {thread.title}
          </h2>
        </Link>

        <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-faint">
          <span className="inline-flex items-center gap-1">
            <MessageSquare className="size-3.5" aria-hidden="true" />
            {thread.reply_count}{" "}
            {thread.reply_count === 1 ? "reply" : "replies"}
          </span>
          <span>Last activity {formatDate(thread.last_post_at)}</span>
        </div>
      </div>
    </article>
  );
}

function HomeSkeleton() {
  return (
    <ForumShell activeBoard={undefined}>
      <div aria-busy="true" className="space-y-3">
        <div className="h-5 w-40 animate-pulse rounded bg-surface-muted" />
        <div className="h-10 rounded border border-line bg-surface" />
        {[0, 1, 2, 3].map((row) => (
          <div
            key={row}
            className="h-24 animate-pulse rounded border border-line bg-surface"
          />
        ))}
      </div>
    </ForumShell>
  );
}

export default function HomePage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  return (
    <Suspense fallback={<HomeSkeleton />}>
      <HomeContent searchParams={searchParams} />
    </Suspense>
  );
}

async function HomeContent({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  // The feed reads the session cookies and query string, so it must run at
  // request time rather than being prerendered.
  await connection();

  const params = await searchParams;
  const rawBoard = typeof params.board === "string" ? params.board : null;
  const board = BOARDS.some((candidate) => candidate.id === rawBoard)
    ? rawBoard
    : null;
  const sort = normaliseThreadSort(
    typeof params.sort === "string" ? params.sort : null,
  );
  const cursor = decodeThreadCursor(
    typeof params.cursor === "string" ? params.cursor : null,
  );

  let pinnedThreads: ThreadRow[] = [];
  let threads: ThreadRow[] = [];
  let nextCursor: string | null = null;
  let loadError = false;

  try {
    const supabase = await createClient();
    const [pinnedResponse, mainResponse] = await Promise.all([
      supabase.rpc("list_threads", {
        p_board_id: board ?? undefined,
        p_sort: "latest",
        p_limit: 50,
        p_pinned: true,
      }),
      supabase.rpc("list_threads", {
        p_board_id: board ?? undefined,
        p_sort: sort,
        p_before_at: cursor?.at ?? undefined,
        p_before_id: cursor?.id ?? undefined,
        p_limit: PAGE_SIZE + 1,
        p_pinned: false,
      }),
    ]);

    if (pinnedResponse.error || mainResponse.error) {
      console.error(
        "list_threads failed:",
        pinnedResponse.error?.message ?? mainResponse.error?.message,
      );
      loadError = true;
    } else {
      pinnedThreads = (pinnedResponse.data ?? []) as ThreadRow[];
      const rows = (mainResponse.data ?? []) as ThreadRow[];
      threads = rows.slice(0, PAGE_SIZE);
      const last = threads[threads.length - 1];

      if (rows.length > PAGE_SIZE && last) {
        nextCursor = encodeThreadCursor({
          at: sort === "new" ? last.created_at : last.last_post_at,
          id: last.id,
        });
      }
    }
  } catch {
    loadError = true;
  }

  const activeBoard = BOARDS.find((candidate) => candidate.id === board);
  const createHref = board
    ? `/create?board=${encodeURIComponent(board)}`
    : "/create";

  return (
    <ForumShell activeBoard={board}>
      <nav
        aria-label="Boards"
        className="mb-3 flex gap-2 overflow-x-auto border-b border-line pb-3 lg:hidden"
      >
        <Link
          href="/"
          className={`shrink-0 rounded-full px-3 py-1.5 text-xs font-semibold transition-colors ${
            board === null
              ? "bg-orange-700 text-white"
              : "bg-surface-muted text-muted hover:text-ink"
          }`}
        >
          Home
        </Link>
        {BOARDS.map((candidate) => {
          const Icon = candidate.icon;

          return (
            <Link
              key={candidate.id}
              href={`/?board=${encodeURIComponent(candidate.id)}`}
              className={`flex shrink-0 items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-semibold transition-colors ${
                board === candidate.id
                  ? "bg-orange-700 text-white"
                  : "bg-surface-muted text-muted hover:text-ink"
              }`}
            >
              <Icon className="size-3.5" aria-hidden="true" />
              {candidate.name}
            </Link>
          );
        })}
      </nav>

      <div className="flex items-center justify-between gap-3 border-b border-line pb-3">
        <div>
          <h1 className="text-lg font-semibold tracking-tight text-ink">
            {activeBoard?.name ?? "Home"}
          </h1>
          <p className="text-xs text-muted">
            {activeBoard?.description ?? "The front page of kaluwo"}
          </p>
        </div>
        <Link
          href={createHref}
          className="flex items-center gap-1.5 rounded-full border border-line bg-surface px-3 py-1.5 text-xs font-semibold text-muted transition-colors hover:bg-surface-muted hover:text-ink"
        >
          <Plus className="size-3.5" />
          Create post
        </Link>
      </div>

      {pinnedThreads.length > 0 ? (
        <section className="mt-3" aria-labelledby="pinned-threads">
          <h2
            id="pinned-threads"
            className="text-[11px] font-semibold uppercase tracking-wide text-muted"
          >
            Pinned
          </h2>
          <div>
            {pinnedThreads.map((thread) => (
              <ThreadCard key={thread.id} thread={thread} />
            ))}
          </div>
        </section>
      ) : null}

      <SortTabs board={board} sort={sort} />

      {loadError ? (
        <div className="mt-3 rounded border border-amber-200 bg-amber-50 px-4 py-6 text-sm text-amber-900 dark:border-amber-800/70 dark:bg-amber-950/40 dark:text-amber-200">
          <p className="font-semibold">Could not load the forum.</p>
          <p className="mt-1">
            Check the Supabase configuration and make sure the migrations have
            been applied.
          </p>
        </div>
      ) : threads.length === 0 ? (
        <div className="mt-3 rounded border border-dashed border-line bg-surface px-4 py-10 text-center">
          <p className="text-sm font-semibold text-ink">
            {cursor
              ? "No more threads"
              : pinnedThreads.length > 0
                ? "No unpinned threads"
                : "Nothing here yet"}
          </p>
          <p className="mx-auto mt-1 max-w-sm text-xs leading-5 text-muted">
            {cursor
              ? "You have reached the end of this list."
              : pinnedThreads.length > 0
                ? "Pinned threads are shown above."
                : "Be the first to share something with this community."}
          </p>
          {!cursor ? (
            <Link
              href={createHref}
              className="mt-4 inline-flex items-center gap-1.5 rounded-full bg-orange-700 px-4 py-2 text-xs font-semibold text-white transition-colors hover:bg-orange-800"
            >
              <Plus className="size-3.5" />
              Create a post
            </Link>
          ) : null}
        </div>
      ) : (
        <>
          <div>
            {threads.map((thread) => (
              <ThreadCard key={thread.id} thread={thread} />
            ))}
          </div>

          {nextCursor ? (
            <div className="mt-4 flex justify-center">
              <Link
                href={buildHref({
                  board,
                  sort,
                  cursor: nextCursor,
                })}
                className="rounded-full border border-line bg-surface px-4 py-2 text-xs font-semibold text-muted transition-colors hover:bg-surface-muted hover:text-ink"
              >
                Older threads
              </Link>
            </div>
          ) : null}
        </>
      )}
    </ForumShell>
  );
}
