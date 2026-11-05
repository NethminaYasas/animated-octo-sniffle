"use client";

import Link from "next/link";
import { useState, useEffect, Suspense, type ReactNode } from "react";
import {
  Search,
  Home as HomeIcon,
  TrendingUp,
  Grid,
  Plus,
  MessageSquare,
  LogIn,
  UserPlus,
  AlertCircle,
  CheckCircle,
  Info,
} from "lucide-react";
import { Toaster, toast } from "sonner";

import { ThemeToggle } from "@/components/theme-toggle";
import { MarkdownContent } from "@/components/markdown-content";
import { PostActions } from "@/components/post-actions";
import { BOARDS } from "@/lib/boards";
import { SEED_POSTS } from "@/lib/seed-posts";
import { loadPosts, loadComments, type SavedPost } from "@/lib/feed-store";
import { formatRelativeTime } from "@/lib/time";

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

  const iconMap = {
    neutral: <Info className="size-4" />,
    success: <CheckCircle className="size-4" />,
    warning: <AlertCircle className="size-4" />,
    error: <AlertCircle className="size-4" />,
  };

  return (
    <div
      className={`mt-3 flex items-start gap-2 rounded border px-3 py-2 ${styles.container}`}
    >
      <span
        aria-hidden="true"
        className={`mt-1.5 size-2 shrink-0 rounded-full ${styles.dot}`}
      />
      <div className="min-w-0">
        <p className="text-xs font-semibold flex items-center gap-1.5">
          {iconMap[tone]}
          {title}
        </p>
        {detail ? (
          <div className="mt-0.5 text-xs leading-5 opacity-80">{detail}</div>
        ) : null}
      </div>
    </div>
  );
}

function SupabaseStatus() {
  const [status, setStatus] = useState<{
    state: "connected" | "unconfigured" | "error";
    message?: string;
  } | null>(null);

  useEffect(() => {
    fetch("/api/supabase-status", { cache: "no-store" })
      .then((res) => {
        if (!res.ok) throw new Error(`Status ${res.status}`);
        return res.json();
      })
      .then((data) =>
        setStatus(
          data &&
            ["connected", "unconfigured", "error"].includes(data.state)
            ? data
            : { state: "error", message: "Unexpected status response." }
        )
      )
      .catch(() =>
        setStatus({ state: "error", message: "Failed to check connection" })
      );
  }, []);

  if (!status) {
    return (
      <StatusStrip
        tone="neutral"
        title="Checking Supabase…"
        detail="Waiting for the project to respond."
      />
    );
  }

  if (status.state === "connected") {
    return (
      <StatusStrip
        tone="success"
        title="Connected"
        detail="Supabase is reachable and the project settings were accepted."
      />
    );
  }

  if (status.state === "unconfigured") {
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
          {status.message} See the troubleshooting section in{" "}
          <code className="text-[11px]">README.md</code>.
        </>
      }
    />
  );
}

type SortOption = "new" | "hot" | "best";

function SortTabs({ activeSort, onSortChange }: { activeSort: SortOption; onSortChange: (sort: SortOption) => void }) {
  const sorts: { value: SortOption; label: string }[] = [
    { value: "new", label: "New" },
    { value: "hot", label: "Hot" },
    { value: "best", label: "Best" },
  ];

  return (
    <div className="mt-3 flex items-center gap-1 border-b border-line" role="tablist" aria-label="Sort posts">
      {sorts.map((sort) => (
        <button
          key={sort.value}
          role="tab"
          aria-selected={activeSort === sort.value}
          onClick={() => onSortChange(sort.value)}
          className={`px-3 py-2 text-xs font-semibold transition-colors ${
            activeSort === sort.value
              ? "border-b-2 border-orange-700 text-ink dark:border-orange-500"
              : "border-b-2 border-transparent text-faint hover:text-muted"
          }`}
        >
          {sort.label}
        </button>
      ))}
    </div>
  );
}

function PostCard({ post, now }: { post: SavedPost; now: Date | null }) {
  return (
    <article className="mt-3 rounded border border-line bg-surface p-3 sm:p-4 hover:border-orange-700/30 dark:hover:border-orange-500/30 transition-colors">
      <div className="flex flex-wrap items-center gap-x-1.5 gap-y-1 text-[11px] text-muted">
        <span className="grid size-5 place-items-center rounded-full bg-orange-700 text-[10px] font-bold text-white">
          {post.boardInitial}
        </span>
        <span className="font-semibold text-ink">{post.boardName}</span>
        <span>•</span>
        <span>Posted by {post.author}</span>
        <span>•</span>
        <span suppressHydrationWarning>{now ? formatRelativeTime(post.createdAt, now) : "just now"}</span>
        {post.isPreview && (
          <span className="ml-1 rounded bg-orange-50 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-orange-800 dark:bg-orange-950/60 dark:text-orange-300">
            Preview
          </span>
        )}
      </div>
      <Link href={`/t/${post.id}`} className="mt-2 block">
        <h2 className="text-lg font-semibold leading-6 text-ink transition-colors hover:text-orange-700 dark:hover:text-orange-400">
          {post.title}
        </h2>
      </Link>
      {post.content.trim() !== "" ? (
        <div className="mt-2 max-h-44 overflow-hidden">
          <MarkdownContent>{post.content}</MarkdownContent>
        </div>
      ) : null}
      <div className="mt-3 flex flex-wrap items-center gap-4 text-[11px] font-semibold text-muted">
        <Link href={`/t/${post.id}`} className="flex items-center gap-1 transition-colors hover:text-ink dark:hover:text-ink">
          <MessageSquare className="size-3.5" />
          {post.commentCount} comments
        </Link>
        <PostActions postId={post.id} title={post.title} body={post.content} />
      </div>
    </article>
  );
}

function PostList({
  posts,
  sort,
  now,
  createPostHref,
}: {
  posts: SavedPost[];
  sort: SortOption;
  now: Date | null;
  createPostHref: string;
}) {
  let sortedPosts = [...posts];

  const nowTime = now?.getTime() ?? 1704067200000; // 2024-01-01T00:00:00Z

  switch (sort) {
    case "new":
      sortedPosts.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
      break;
    case "hot":
      sortedPosts.sort((a, b) => {
        const scoreA = a.commentCount * 10 + Math.max(0, 100 - (nowTime - new Date(a.createdAt).getTime()) / (1000 * 60 * 60));
        const scoreB = b.commentCount * 10 + Math.max(0, 100 - (nowTime - new Date(b.createdAt).getTime()) / (1000 * 60 * 60));
        return scoreB - scoreA;
      });
      break;
    case "best":
      sortedPosts.sort((a, b) => b.commentCount - a.commentCount);
      break;
  }

  if (sortedPosts.length === 0) {
    return (
      <div className="mt-3 rounded border border-dashed border-line bg-surface px-4 py-10 text-center">
        <p className="text-sm font-semibold text-ink">Nothing here yet</p>
        <p className="mx-auto mt-1 max-w-sm text-xs leading-5 text-muted">
          Be the first to share something with this community.
        </p>
        <Link
          href={createPostHref}
          className="mt-4 inline-flex items-center gap-1.5 rounded-full bg-orange-700 px-4 py-2 text-xs font-semibold text-white transition-colors hover:bg-orange-800"
        >
          <Plus className="size-3.5" />
          Create a post
        </Link>
      </div>
    );
  }

  return (
    <div className="mt-3 space-y-0">
      {sortedPosts.map((post) => (
        <PostCard key={post.id} post={post} now={now} />
      ))}
    </div>
  );
}

function BoardNav({ activeBoard, onBoardChange }: { activeBoard: string | null; onBoardChange: (boardId: string | null) => void }) {
  return (
    <nav aria-label="Forum navigation" className="sticky top-20 space-y-0.5">
      <button
        className={`flex w-full items-center gap-2.5 rounded px-3 py-2 text-sm font-medium transition-colors ${
          activeBoard === null
            ? "bg-surface-muted text-ink"
            : "text-muted hover:bg-surface-muted hover:text-ink"
        }`}
        onClick={() => onBoardChange(null)}
      >
        <HomeIcon className="size-4" />
        Home
      </button>
      <button
        className={`flex w-full cursor-default items-center gap-2.5 rounded px-3 py-2 text-sm transition-colors ${
          activeBoard === "popular"
            ? "bg-surface-muted text-ink"
            : "text-muted hover:bg-surface-muted hover:text-ink"
        }`}
        onClick={() => onBoardChange("popular")}
        disabled={true}
        title="Coming soon"
      >
        <TrendingUp className="size-4" />
        Popular
        <span className="ml-auto text-[10px] font-semibold uppercase tracking-wide text-faint">
          Soon
        </span>
      </button>
      <button
        className={`flex w-full cursor-default items-center gap-2.5 rounded px-3 py-2 text-sm transition-colors ${
          activeBoard === "all"
            ? "bg-surface-muted text-ink"
            : "text-muted hover:bg-surface-muted hover:text-ink"
        }`}
        onClick={() => onBoardChange("all")}
        disabled={true}
        title="Coming soon"
      >
        <Grid className="size-4" />
        All
        <span className="ml-auto text-[10px] font-semibold uppercase tracking-wide text-faint">
          Soon
        </span>
      </button>

      <div className="my-3 border-t border-line" />

      <p className="px-3 pb-1 text-[11px] font-semibold uppercase tracking-wide text-muted">
        Boards
      </p>
      {BOARDS.map((board) => (
        <button
          key={board.id}
          className={`flex w-full items-center gap-2.5 rounded px-3 py-2 text-sm text-left transition-colors ${
            activeBoard === board.id
              ? "bg-surface-muted text-ink"
              : "text-body hover:bg-surface-muted hover:text-ink"
          }`}
          onClick={() => onBoardChange(board.id)}
        >
          <span className="grid size-6 shrink-0 place-items-center rounded-full bg-surface-muted text-[10px] font-bold text-muted">
            {board.initial}
          </span>
          <span className="truncate">{board.name}</span>
        </button>
      ))}
      <p className="px-3 pt-3 text-[11px] leading-5 text-faint">
        Posts and comments are stored on this device until the database ships.
      </p>
    </nav>
  );
}

export default function Home() {
  const [activeSort, setActiveSort] = useState<SortOption>("new");
  const [activeBoard, setActiveBoard] = useState<string | null>(null);
  const [createdPosts, setCreatedPosts] = useState<SavedPost[]>([]);
  const [commentCounts, setCommentCounts] = useState<Record<number, number>>({});
  const [now, setNow] = useState<Date | null>(null);

  useEffect(() => {
    const currentDate = new Date();
    setNow(currentDate);
    const interval = setInterval(() => setNow(new Date()), 60_000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    const saved = loadPosts();
    setCreatedPosts(saved);
    const counts: Record<number, number> = {};
    for (const post of [...SEED_POSTS, ...saved]) {
      counts[post.id] = loadComments(post.id).length;
    }
    setCommentCounts(counts);
  }, []);

  const feed = [...SEED_POSTS, ...createdPosts].map((post) => ({
    ...post,
    commentCount: commentCounts[post.id] ?? post.commentCount,
  }));

  const filteredPosts = activeBoard
    ? feed.filter((p) => p.boardId === activeBoard)
    : feed;

  const createPostHref = activeBoard
    ? `/create?board=${encodeURIComponent(activeBoard)}`
    : "/create";

  const handleAuthClick = (action: "login" | "signup") => {
    toast.info(`${action === "login" ? "Log in" : "Sign up"} functionality`, {
      description: "Coming in the auth step!",
    });
  };

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
              <Search className="size-4 shrink-0" />
              <span className="truncate">Search kaluwo</span>
              <span className="ml-auto shrink-0 text-[10px] font-semibold uppercase tracking-wide text-faint">
                Soon
              </span>
            </div>
          </div>

          <div className="ml-auto flex shrink-0 items-center gap-2">
            <ThemeToggle />
            <button
              className="hidden sm:flex items-center gap-1.5 rounded-full border border-orange-700 px-3 py-1.5 text-xs font-semibold text-orange-700 hover:bg-orange-50 dark:border-orange-500 dark:text-orange-400 dark:hover:bg-orange-950/30"
              title="Login arrives in the auth step"
              type="button"
              onClick={() => handleAuthClick("login")}
            >
              <LogIn className="size-3.5" />
              Log in
            </button>
            <button
              className="flex items-center gap-1.5 rounded-full bg-orange-700 px-3 py-1.5 text-xs font-semibold text-white hover:bg-orange-800"
              title="Registration arrives in the auth step"
              type="button"
              onClick={() => handleAuthClick("signup")}
            >
              <UserPlus className="size-3.5" />
              Sign up
            </button>
          </div>
        </div>
      </header>

      <div className="mx-auto grid w-full max-w-5xl flex-1 grid-cols-1 gap-6 px-3 py-3 sm:px-4 lg:grid-cols-[200px_minmax(0,1fr)]">
        <div className="hidden lg:block">
          <BoardNav activeBoard={activeBoard} onBoardChange={setActiveBoard} />
        </div>

        <section className="min-w-0">
          <nav
            aria-label="Boards"
            className="mb-3 flex gap-2 overflow-x-auto border-b border-line pb-3 lg:hidden"
          >
            <button
              className={`shrink-0 rounded-full px-3 py-1.5 text-xs font-semibold transition-colors ${
                activeBoard === null
                  ? "bg-orange-700 text-white"
                  : "bg-surface-muted text-muted hover:text-ink"
              }`}
              onClick={() => setActiveBoard(null)}
            >
              Home
            </button>
            {BOARDS.map((board) => (
              <button
                key={board.id}
                className={`shrink-0 rounded-full px-3 py-1.5 text-xs font-semibold transition-colors ${
                  activeBoard === board.id
                    ? "bg-orange-700 text-white"
                    : "bg-surface-muted text-muted hover:text-ink"
                }`}
                onClick={() => setActiveBoard(board.id)}
              >
                {board.name}
              </button>
            ))}
          </nav>
          <div className="flex items-center justify-between gap-3 border-b border-line pb-3">
            <div>
              <h1 className="text-lg font-semibold tracking-tight text-ink">
                {activeBoard
                  ? BOARDS.find((b) => b.id === activeBoard)?.name || "Board"
                  : "Home"}
              </h1>
              <p className="text-xs text-muted">
                {activeBoard
                  ? BOARDS.find((b) => b.id === activeBoard)?.description || "Board description"
                  : "The front page of kaluwo"}
              </p>
            </div>
            <Link
              href={createPostHref}
              className="flex items-center gap-1.5 rounded-full border border-line bg-surface px-3 py-1.5 text-xs font-semibold text-muted transition-colors hover:bg-surface-muted hover:text-ink"
            >
              <Plus className="size-3.5" />
              Create post
            </Link>
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

          <SortTabs activeSort={activeSort} onSortChange={setActiveSort} />

          <PostList
            posts={filteredPosts}
            sort={activeSort}
            now={now}
            createPostHref={createPostHref}
          />

        </section>
      </div>

      <Toaster
        position="top-right"
        theme="system"
        toastOptions={{
          classNames: {
            toast: "rounded-lg border border-line bg-surface text-ink",
            description: "text-muted",
            actionButton: "bg-orange-700 hover:bg-orange-800",
            cancelButton: "bg-surface-muted hover:bg-surface",
          },
        }}
      />
    </main>
  );
}