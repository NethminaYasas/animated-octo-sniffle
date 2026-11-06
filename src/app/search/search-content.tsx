"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState, type FormEvent, type ReactNode } from "react";
import { MessageSquare, Search as SearchIcon, X } from "lucide-react";

import { ForumShell } from "@/components/forum-shell";
import { BOARDS } from "@/lib/boards";
import { htmlToText } from "@/lib/mentions";
import { createClient } from "@/lib/supabase/client";
import { formatRelativeTime } from "@/lib/time";

type ThreadResult = {
  id: number;
  title: string;
  boardId: string;
  boardName: string;
  author: string;
  createdAt: string;
};

type CommentResult = {
  id: number;
  threadId: number;
  threadTitle: string;
  boardId: string;
  boardName: string;
  author: string;
  createdAt: string;
  text: string;
};

const MIN_QUERY_LENGTH = 2;

/** Escapes PostgreSQL LIKE wildcards so a literal % does not match everything. */
function escapeLikePattern(value: string): string {
  return value
    .replace(/\\/g, "\\\\")
    .replace(/%/g, "\\%")
    .replace(/_/g, "\\_");
}

/** A window of text around the first match, so long posts stay readable. */
function makeExcerpt(text: string, term: string): string {
  if (!text) {
    return "";
  }

  if (!term) {
    return text.length > 200 ? `${text.slice(0, 199).trimEnd()}…` : text;
  }

  const at = text.toLowerCase().indexOf(term);

  if (at === -1) {
    return text.length > 200 ? `${text.slice(0, 199).trimEnd()}…` : text;
  }

  const start = Math.max(0, at - 70);
  const end = Math.min(text.length, at + term.length + 140);

  return `${start > 0 ? "…" : ""}${text.slice(start, end).trim()}${
    end < text.length ? "…" : ""
  }`;
}

function Highlight({ text, term }: { text: string; term: string }) {
  if (!term) {
    return <>{text}</>;
  }

  const lowerText = text.toLowerCase();
  const lowerTerm = term.toLowerCase();
  const parts: ReactNode[] = [];
  let cursor = 0;
  let key = 0;

  while (cursor < text.length) {
    const at = lowerText.indexOf(lowerTerm, cursor);

    if (at === -1) {
      parts.push(text.slice(cursor));
      break;
    }

    if (at > cursor) {
      parts.push(text.slice(cursor, at));
    }

    parts.push(
      <mark
        key={key++}
        className="rounded bg-orange-100 px-0.5 text-inherit dark:bg-orange-950/70"
      >
        {text.slice(at, at + term.length)}
      </mark>,
    );
    cursor = at + term.length;
  }

  return <>{parts}</>;
}

export function SearchContent({ initialQuery }: { initialQuery: string }) {
  const router = useRouter();
  const [query, setQuery] = useState(initialQuery);
  const [threads, setThreads] = useState<ThreadResult[]>([]);
  const [comments, setComments] = useState<CommentResult[]>([]);
  const [ready, setReady] = useState(false);
  const [loading, setLoading] = useState(false);
  const [settledTerm, setSettledTerm] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [now, setNow] = useState<Date | null>(null);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- relative times need the client clock
    setNow(new Date());
  }, []);

  useEffect(() => {
    // Back/forward or a header search can change the URL under us.
    // eslint-disable-next-line react-hooks/set-state-in-effect -- mirror the URL query
    setQuery(initialQuery);
  }, [initialQuery]);

  const term = query.trim().toLowerCase();

  useEffect(() => {
    if (term.length < MIN_QUERY_LENGTH) {
      const resetTimer = window.setTimeout(() => {
        setThreads([]);
        setComments([]);
        setReady(true);
        setLoading(false);
        setSettledTerm(null);
        setError(null);
      }, 0);

      return () => window.clearTimeout(resetTimer);
    }

    let active = true;

    const timer = window.setTimeout(() => {
      setLoading(true);
      setError(null);
      setReady(false);

      void (async () => {
        try {
          const supabase = createClient();
          const pattern = `%${escapeLikePattern(term)}%`;

          const [threadResponse, commentResponse] = await Promise.all([
            supabase
              .from("threads")
              .select(
                "id, title, board_id, created_at, author:profiles!threads_author_id_fkey(username), board:boards!threads_board_id_fkey(name)",
              )
              .eq("is_deleted", false)
              .ilike("title", pattern)
              .order("last_post_at", { ascending: false })
              .limit(20),
            supabase
              .from("posts")
              .select(
                "id, content, created_at, thread_id, author:profiles!posts_author_id_fkey(username), thread:threads!posts_thread_id_fkey(id, title, board_id, is_deleted, board:boards!threads_board_id_fkey(name))",
              )
              .eq("is_deleted", false)
              .ilike("content", pattern)
              .order("created_at", { ascending: false })
              .limit(30),
          ]);

          if (!active) {
            return;
          }

          if (threadResponse.error || commentResponse.error) {
            setError("Search is unavailable right now. Try again shortly.");
            setThreads([]);
            setComments([]);
            return;
          }

          const threadRows = (threadResponse.data ?? []) as unknown as Array<{
            id: number;
            title: string;
            board_id: string;
            created_at: string;
            author: { username: string } | null;
            board: { name: string } | null;
          }>;

          const commentRows = (commentResponse.data ?? []) as unknown as Array<{
            id: number;
            content: string;
            created_at: string;
            thread_id: number;
            author: { username: string } | null;
            thread: {
              id: number;
              title: string;
              board_id: string;
              is_deleted: boolean;
              board: { name: string } | null;
            } | null;
          }>;

          setThreads(
            threadRows.map((row) => ({
              id: row.id,
              title: row.title,
              boardId: row.board_id,
              boardName: row.board?.name ?? "Board",
              author: row.author?.username ?? "unknown",
              createdAt: row.created_at,
            })),
          );

          setComments(
            commentRows
              .filter((row) => row.thread && !row.thread.is_deleted)
              .map((row) => ({
                id: row.id,
                threadId: row.thread_id,
                threadTitle: row.thread?.title ?? "Thread",
                boardId: row.thread?.board_id ?? "",
                boardName: row.thread?.board?.name ?? "Board",
                author: row.author?.username ?? "unknown",
                createdAt: row.created_at,
                text: htmlToText(row.content),
              })),
          );
        } catch {
          if (active) {
            setError("Search is unavailable right now. Try again shortly.");
            setThreads([]);
            setComments([]);
          }
        } finally {
          if (active) {
            setReady(true);
            setLoading(false);
            setSettledTerm(term);
          }
        }
      })();
    }, 250);

    return () => {
      active = false;
      window.clearTimeout(timer);
    };
  }, [term]);

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const next = query.trim();
    router.replace(next ? `/search?q=${encodeURIComponent(next)}` : "/search");
  };

  const total = useMemo(() => threads.length + comments.length, [comments.length, threads.length]);
  const showResults = term.length >= MIN_QUERY_LENGTH;
  const pending = showResults && (loading || settledTerm !== term);

  return (
    <ForumShell activeBoard={undefined}>
      <div className="border-b border-line pb-4">
        <h1 className="text-lg font-semibold tracking-tight text-ink">Search</h1>
        <p className="text-xs text-muted">Find posts and replies across kaluwo.</p>

        <form role="search" onSubmit={handleSubmit} className="mt-3 flex items-center gap-2">
          <div className="flex h-10 min-w-0 flex-1 items-center gap-2 rounded-full border border-line bg-surface px-4 text-sm text-muted transition-colors focus-within:border-orange-700/40 dark:focus-within:border-orange-500/40">
            <SearchIcon className="size-4 shrink-0" aria-hidden="true" />
            <input
              autoFocus
              type="search"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search posts and replies…"
              aria-label="Search posts and replies"
              enterKeyHint="search"
              className="min-w-0 flex-1 bg-transparent text-sm text-ink placeholder:text-muted focus:outline-none"
            />
            {query ? (
              <button
                type="button"
                onClick={() => {
                  setQuery("");
                  router.replace("/search");
                }}
                aria-label="Clear search"
                className="grid size-6 shrink-0 place-items-center rounded-full text-muted transition-colors hover:bg-surface-muted hover:text-ink"
              >
                <X className="size-3.5" />
              </button>
            ) : null}
          </div>
          <button
            type="submit"
            className="rounded-full bg-orange-700 px-4 py-2.5 text-xs font-semibold text-white transition-colors hover:bg-orange-800 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-orange-600"
          >
            Search
          </button>
        </form>
      </div>

      {!showResults ? (
        <div className="mt-3 rounded border border-line bg-surface p-4">
          <p className="text-sm font-semibold text-ink">Search kaluwo</p>
          <p className="mt-1 text-xs leading-5 text-muted">
            Type at least {MIN_QUERY_LENGTH} characters. Titles and post bodies
            are searchable. Or jump to a board:
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            {BOARDS.map((board) => {
              const Icon = board.icon;

              return (
                <Link
                  key={board.id}
                  href={`/?board=${encodeURIComponent(board.id)}`}
                  className="flex items-center gap-1.5 rounded-full bg-surface-muted px-3 py-1.5 text-xs font-semibold text-muted transition-colors hover:text-ink"
                >
                  <Icon className="size-3.5" aria-hidden="true" />
                  {board.name}
                </Link>
              );
            })}
          </div>
        </div>
      ) : pending ? (
        <p className="mt-3 text-xs text-muted" role="status">
          Searching…
        </p>
      ) : error ? (
        <div className="mt-3 rounded border border-amber-200 bg-amber-50 px-4 py-6 text-sm text-amber-900 dark:border-amber-800/70 dark:bg-amber-950/40 dark:text-amber-200">
          {error}
        </div>
      ) : (
        <p className="mt-3 text-xs text-muted" role="status">
          {total === 0 ? "No results" : `${total} ${total === 1 ? "result" : "results"}`}{" "}
          for <span className="font-semibold text-ink">“{query.trim()}”</span>
        </p>
      )}

      {showResults && !pending && !error && threads.length > 0 ? (
        <section aria-labelledby="post-results" className="mt-4">
          <h2
            id="post-results"
            className="text-[11px] font-semibold uppercase tracking-wide text-muted"
          >
            Threads
          </h2>
          <div className="mt-2 space-y-2">
            {threads.map((thread) => (
              <article
                key={thread.id}
                className="rounded border border-line bg-surface p-3 transition-colors hover:border-orange-700/30 sm:p-4 dark:hover:border-orange-500/30"
              >
                <div className="flex flex-wrap items-center gap-x-1.5 gap-y-1 text-xs text-muted">
                  <span className="font-semibold text-ink">{thread.boardName}</span>
                  <span>•</span>
                  <span>@{thread.author}</span>
                  <span>•</span>
                  <span suppressHydrationWarning>
                    {now ? formatRelativeTime(thread.createdAt, now) : "just now"}
                  </span>
                </div>
                <Link href={`/t/${thread.id}`} className="mt-1.5 block">
                  <h3 className="text-base font-semibold leading-6 text-ink transition-colors hover:text-orange-700 dark:hover:text-orange-400">
                    <Highlight text={thread.title} term={query.trim()} />
                  </h3>
                </Link>
              </article>
            ))}
          </div>
        </section>
      ) : null}

      {showResults && !pending && !error && comments.length > 0 ? (
        <section aria-labelledby="reply-results" className="mt-4">
          <h2
            id="reply-results"
            className="text-[11px] font-semibold uppercase tracking-wide text-muted"
          >
            Replies
          </h2>
          <div className="mt-2 space-y-2">
            {comments.map((comment) => (
              <article
                key={comment.id}
                className="rounded border border-line bg-surface p-3 transition-colors hover:border-orange-700/30 sm:p-4 dark:hover:border-orange-500/30"
              >
                <div className="flex flex-wrap items-center gap-x-1.5 gap-y-1 text-xs text-muted">
                  <MessageSquare className="size-3.5" aria-hidden="true" />
                  <span>@{comment.author}</span>
                  <span>•</span>
                  <Link
                    href={`/t/${comment.threadId}`}
                    className="truncate font-semibold text-ink hover:text-orange-700 dark:hover:text-orange-400"
                  >
                    {comment.threadTitle}
                  </Link>
                  <span>•</span>
                  <span suppressHydrationWarning>
                    {now ? formatRelativeTime(comment.createdAt, now) : "just now"}
                  </span>
                </div>
                <p className="mt-1.5 text-sm leading-6 text-body">
                  <Highlight text={makeExcerpt(comment.text, term)} term={query.trim()} />
                </p>
                <Link
                  href={`/t/${comment.threadId}#comment-${comment.id}`}
                  className="mt-1 inline-block text-[11px] font-semibold text-orange-700 hover:underline dark:text-orange-400"
                >
                  Jump to reply
                </Link>
              </article>
            ))}
          </div>
        </section>
      ) : null}

      {showResults && ready && !pending && !error && total === 0 ? (
        <div className="mt-3 rounded border border-dashed border-line bg-surface px-4 py-10 text-center">
          <p className="text-sm font-semibold text-ink">Nothing matched</p>
          <p className="mx-auto mt-1 max-w-sm text-xs leading-5 text-muted">
            Try a shorter word or a different phrase.
          </p>
        </div>
      ) : null}
    </ForumShell>
  );
}
