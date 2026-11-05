"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  useEffect,
  useMemo,
  useState,
  type FormEvent,
  type ReactNode,
} from "react";
import { MessageSquare, Search as SearchIcon, X } from "lucide-react";

import { ForumShell } from "@/components/forum-shell";
import { BOARDS } from "@/lib/boards";
import {
  FEED_CHANGED_EVENT,
  loadComments,
  loadDeletedPostIds,
  loadPosts,
  type SavedComment,
  type SavedPost,
} from "@/lib/feed-store";
import { htmlToText } from "@/lib/mentions";
import { SEED_POSTS } from "@/lib/seed-posts";
import { formatRelativeTime } from "@/lib/time";

type PostEntry = { post: SavedPost; text: string };
type CommentEntry = { comment: SavedComment; post: SavedPost; text: string };

type Index = {
  posts: PostEntry[];
  comments: CommentEntry[];
};

const EMPTY_INDEX: Index = { posts: [], comments: [] };

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
  const [index, setIndex] = useState<Index>(EMPTY_INDEX);
  const [ready, setReady] = useState(false);
  const [now, setNow] = useState<Date | null>(null);

  useEffect(() => {
    const build = () => {
      const deleted = new Set(loadDeletedPostIds());
      const posts = [...SEED_POSTS, ...loadPosts()].filter(
        (post) => !deleted.has(post.id),
      );

      setIndex({
        posts: posts.map((post) => ({
          post,
          text: htmlToText(post.content),
        })),
        comments: posts.flatMap((post) =>
          loadComments(post.id).map((comment) => ({
            comment,
            post,
            text: htmlToText(comment.body),
          })),
        ),
      });
      setReady(true);
    };

    build();
    window.addEventListener(FEED_CHANGED_EVENT, build);

    return () => window.removeEventListener(FEED_CHANGED_EVENT, build);
  }, []);

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

  const results = useMemo(() => {
    if (!term) {
      return { posts: [], comments: [] };
    }

    const matches = (value: string) => value.toLowerCase().includes(term);

    return {
      posts: index.posts
        .filter(
          ({ post, text }) =>
            matches(post.title) ||
            matches(text) ||
            matches(post.author) ||
            matches(post.boardName),
        )
        .map((entry) => ({
          ...entry,
          rank: matches(entry.post.title)
            ? 2
            : matches(entry.text)
              ? 1
              : 0,
        }))
        .sort(
          (a, b) =>
            b.rank - a.rank ||
            new Date(b.post.createdAt).getTime() -
              new Date(a.post.createdAt).getTime(),
        ),
      comments: index.comments
        .filter(
          ({ comment, text }) => matches(text) || matches(comment.author),
        )
        .sort(
          (a, b) =>
            new Date(b.comment.createdAt).getTime() -
            new Date(a.comment.createdAt).getTime(),
        ),
    };
  }, [index, term]);

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const next = query.trim();
    router.replace(next ? `/search?q=${encodeURIComponent(next)}` : "/search");
  };

  const total = results.posts.length + results.comments.length;

  return (
    <ForumShell activeBoard={undefined}>
      <div className="border-b border-line pb-4">
        <h1 className="text-lg font-semibold tracking-tight text-ink">
          Search
        </h1>
        <p className="text-xs text-muted">
          Find posts and replies across kaluwo.
        </p>

        <form
          role="search"
          onSubmit={handleSubmit}
          className="mt-3 flex items-center gap-2"
        >
          <div className="flex h-10 min-w-0 flex-1 items-center gap-2 rounded-full border border-line bg-surface px-4 text-sm text-muted transition-colors focus-within:border-orange-700/40 dark:focus-within:border-orange-500/40">
            <SearchIcon className="size-4 shrink-0" aria-hidden="true" />
            <input
              autoFocus
              type="search"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search posts, replies, people…"
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

      {term && ready ? (
        <p className="mt-3 text-xs text-muted" role="status">
          {total === 0
            ? "No results"
            : `${total} ${total === 1 ? "result" : "results"}`}{" "}
          for{" "}
          <span className="font-semibold text-ink">“{query.trim()}”</span>
        </p>
      ) : (
        <div className="mt-3 rounded border border-line bg-surface p-4">
          <p className="text-sm font-semibold text-ink">Search kaluwo</p>
          <p className="mt-1 text-xs leading-5 text-muted">
            Titles, posts, replies and members are searchable. Or jump to a
            board:
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
      )}

      {term && ready && results.posts.length > 0 ? (
        <section aria-labelledby="post-results" className="mt-4">
          <h2
            id="post-results"
            className="text-[11px] font-semibold uppercase tracking-wide text-muted"
          >
            Posts
          </h2>
          <div className="mt-2 space-y-2">
            {results.posts.map(({ post, text }) => (
              <article
                key={post.id}
                className="rounded border border-line bg-surface p-3 transition-colors hover:border-orange-700/30 sm:p-4 dark:hover:border-orange-500/30"
              >
                <div className="flex flex-wrap items-center gap-x-1.5 gap-y-1 text-xs text-muted">
                  <span className="font-semibold text-ink">
                    {post.boardName}
                  </span>
                  <span>•</span>
                  <span>@{post.author}</span>
                  <span>•</span>
                  <span suppressHydrationWarning>
                    {now
                      ? formatRelativeTime(post.createdAt, now)
                      : "just now"}
                  </span>
                </div>
                <Link href={`/t/${post.id}`} className="mt-1.5 block">
                  <h3 className="text-base font-semibold leading-6 text-ink transition-colors hover:text-orange-700 dark:hover:text-orange-400">
                    <Highlight text={post.title} term={query.trim()} />
                  </h3>
                </Link>
                {text ? (
                  <p className="mt-1 text-xs leading-5 text-muted">
                    <Highlight
                      text={makeExcerpt(text, term)}
                      term={query.trim()}
                    />
                  </p>
                ) : null}
              </article>
            ))}
          </div>
        </section>
      ) : null}

      {term && ready && results.comments.length > 0 ? (
        <section aria-labelledby="reply-results" className="mt-4">
          <h2
            id="reply-results"
            className="text-[11px] font-semibold uppercase tracking-wide text-muted"
          >
            Replies
          </h2>
          <div className="mt-2 space-y-2">
            {results.comments.map(({ comment, post, text }) => (
              <article
                key={`${post.id}-${comment.id}`}
                className="rounded border border-line bg-surface p-3 transition-colors hover:border-orange-700/30 sm:p-4 dark:hover:border-orange-500/30"
              >
                <div className="flex flex-wrap items-center gap-x-1.5 gap-y-1 text-xs text-muted">
                  <MessageSquare className="size-3.5" aria-hidden="true" />
                  <span>@{comment.author}</span>
                  <span>•</span>
                  <Link
                    href={`/t/${post.id}`}
                    className="truncate font-semibold text-ink hover:text-orange-700 dark:hover:text-orange-400"
                  >
                    {post.title}
                  </Link>
                  <span>•</span>
                  <span suppressHydrationWarning>
                    {now
                      ? formatRelativeTime(comment.createdAt, now)
                      : "just now"}
                  </span>
                </div>
                <p className="mt-1.5 text-sm leading-6 text-body">
                  <Highlight
                    text={makeExcerpt(text, term)}
                    term={query.trim()}
                  />
                </p>
                <Link
                  href={`/t/${post.id}#comment-${comment.id}`}
                  className="mt-1 inline-block text-[11px] font-semibold text-orange-700 hover:underline dark:text-orange-400"
                >
                  Jump to reply
                </Link>
              </article>
            ))}
          </div>
        </section>
      ) : null}

      {term && ready && total === 0 ? (
        <div className="mt-3 rounded border border-dashed border-line bg-surface px-4 py-10 text-center">
          <p className="text-sm font-semibold text-ink">Nothing matched</p>
          <p className="mx-auto mt-1 max-w-sm text-xs leading-5 text-muted">
            Try a shorter word, a board name, or a member’s username.
          </p>
        </div>
      ) : null}
    </ForumShell>
  );
}
