"use client";

import Link from "next/link";
import { useState, useEffect, useRef, Suspense, type ReactNode } from "react";
import {
  Search,
  Home as HomeIcon,
  TrendingUp,
  Grid,
  Plus,
  MessageSquare,
  Share2,
  Bookmark,
  LogIn,
  UserPlus,
  Moon,
  Sun,
  AlertCircle,
  CheckCircle,
  Info,
  X,
} from "lucide-react";
import { Toaster, toast } from "sonner";

import { ThemeToggle } from "@/components/theme-toggle";

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

const boards = [
  { id: "announcements", name: "Announcements", initial: "A", description: "News from the kaluwo team" },
  { id: "general", name: "General", initial: "G", description: "General discussion" },
  { id: "technology", name: "Technology", initial: "T", description: "Tech talk and support" },
  { id: "life-sri-lanka", name: "Life in Sri Lanka", initial: "L", description: "Daily life, news, and events" },
  { id: "food", name: "Food", initial: "F", description: "Recipes, restaurants, and food culture" },
  { id: "travel", name: "Travel", initial: "T", description: "Travel tips and destinations" },
  { id: "sports", name: "Sports", initial: "S", description: "Cricket, rugby, and more" },
];

type SortOption = "new" | "hot" | "best";

const mockPosts = [
  {
    id: 1,
    boardId: "announcements",
    boardName: "Announcements",
    boardInitial: "A",
    author: "kaluwo",
    authorInitial: "k",
    title: "Welcome to kaluwo",
    content: "A Sri Lankan discussion forum for boards, threads and replies. This is a preview of how posts will appear — real posting and comments come in later steps.",
    createdAt: new Date(Date.now() - 1000 * 60 * 5).toISOString(),
    commentCount: 0,
    isPreview: true,
  },
];

function formatRelativeTime(dateString: string, now: Date): string {
  const date = new Date(dateString);
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / (1000 * 60));
  const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

  if (diffMins < 1) return "just now";
  if (diffMins < 60) return `${diffMins}m ago`;
  if (diffHours < 24) return `${diffHours}h ago`;
  if (diffDays < 7) return `${diffDays}d ago`;
  return date.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

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

function PostCard({ post, now }: { post: typeof mockPosts[0]; now: Date | null }) {
  const [saved, setSaved] = useState(false);

  const handleShare = async () => {
    const url = `${window.location.origin}/t/${post.id}`;
    const shareData = { title: post.title, text: post.content, url };
    if (navigator.share) {
      try {
        await navigator.share(shareData);
      } catch (error) {
        if ((error as DOMException)?.name !== "AbortError") {
          toast.error("Couldn't share this post");
        }
      }
      return;
    }
    try {
      await navigator.clipboard.writeText(url);
      toast.success("Link copied to clipboard", {
        description: "Share it with others.",
      });
    } catch {
      toast.error("Couldn't copy link");
    }
  };

  const handleSave = () => {
    const next = !saved;
    setSaved(next);
    toast.success(next ? "Saved for later" : "Removed from saved");
  };

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
      <h2 className="mt-2 block text-lg font-semibold leading-6 text-ink">
        {post.title}
      </h2>
      <p className="mt-2 max-w-2xl text-sm leading-6 text-body line-clamp-3">
        {post.content}
      </p>
      <div className="mt-3 flex flex-wrap items-center gap-4 text-[11px] font-semibold text-muted">
        <span className="flex items-center gap-1">
          <MessageSquare className="size-3.5" />
          {post.commentCount} comments
        </span>
        <button
          className="flex items-center gap-1 hover:text-ink dark:hover:text-ink transition-colors"
          title="Share"
          onClick={handleShare}
          type="button"
        >
          <Share2 className="size-3.5" />
          Share
        </button>
        <button
          className={`flex items-center gap-1 transition-colors ${
            saved
              ? "text-orange-700 dark:text-orange-400"
              : "hover:text-ink dark:hover:text-ink"
          }`}
          title={saved ? "Remove from saved" : "Save"}
          aria-pressed={saved}
          onClick={handleSave}
          type="button"
        >
          <Bookmark
            className={`size-3.5 ${saved ? "fill-orange-700 text-orange-700 dark:fill-orange-400 dark:text-orange-400" : ""}`}
          />
          {saved ? "Saved" : "Save"}
        </button>
      </div>
    </article>
  );
}

function PostList({ posts, sort, now }: { posts: typeof mockPosts; sort: SortOption; now: Date | null }) {
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
        <p className="text-sm font-semibold text-ink">No posts yet</p>
        <p className="mx-auto mt-1 max-w-sm text-xs leading-5 text-muted">
          Once boards and posting are added, threads will show up here.
        </p>
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
      {boards.map((board) => (
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
      <p className="px-3 pt-3 text-[11px] leading-5 text-muted">
        Boards open when the database is added.
      </p>
    </nav>
  );
}

export default function Home() {
  const [activeSort, setActiveSort] = useState<SortOption>("new");
  const [activeBoard, setActiveBoard] = useState<string | null>(null);
  const [showCreatePost, setShowCreatePost] = useState(false);
  const [now, setNow] = useState<Date | null>(null);
  const [mounted, setMounted] = useState(false);
  const createPostButtonRef = useRef<HTMLButtonElement>(null);
  const createPostModalRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setMounted(true);
    const currentDate = new Date();
    setNow(currentDate);
    const interval = setInterval(() => setNow(new Date()), 60_000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    if (!showCreatePost) return;

    const modal = createPostModalRef.current;
    if (!modal) return;

    const focusable = Array.from(
      modal.querySelectorAll<HTMLElement>(
        'button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"]):not([disabled])',
      ),
    );

    focusable[0]?.focus();

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setShowCreatePost(false);
        return;
      }

      if (event.key !== "Tab" || focusable.length === 0) return;

      const first = focusable[0];
      const last = focusable[focusable.length - 1];

      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };

    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("keydown", handleKeyDown);
      createPostButtonRef.current?.focus();
    };
  }, [showCreatePost]);

  const filteredPosts = activeBoard
    ? mockPosts.filter((p) => p.boardId === activeBoard)
    : mockPosts;

  const handleCreatePost = () => {
    // Auth is not implemented yet — open the preview modal directly.
    // Actual publishing will require a signed-in account once auth ships.
    setShowCreatePost(true);
  };

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
            {boards.map((board) => (
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
                  ? boards.find((b) => b.id === activeBoard)?.name || "Board"
                  : "Home"}
              </h1>
              <p className="text-xs text-muted">
                {activeBoard
                  ? boards.find((b) => b.id === activeBoard)?.description || "Board description"
                  : "The front page of kaluwo"}
              </p>
            </div>
            <button
              ref={createPostButtonRef}
              className="flex items-center gap-1.5 rounded-full border border-line bg-surface px-3 py-1.5 text-xs font-semibold text-muted hover:bg-surface-muted hover:text-ink transition-colors"
              type="button"
              onClick={handleCreatePost}
            >
              <Plus className="size-3.5" />
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

          <SortTabs activeSort={activeSort} onSortChange={setActiveSort} />

          <PostList posts={filteredPosts} sort={activeSort} now={now} />

        </section>
      </div>

      {showCreatePost && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
          onClick={() => setShowCreatePost(false)}
        >
          <div
            ref={createPostModalRef}
            role="dialog"
            aria-modal="true"
            aria-labelledby="create-post-title"
            className="w-full max-w-md rounded-lg border border-line bg-surface p-6 shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between">
              <h2 id="create-post-title" className="text-lg font-semibold text-ink">Create Post (Preview)</h2>
              <button
                className="text-muted hover:text-ink transition-colors"
                onClick={() => setShowCreatePost(false)}
                aria-label="Close"
              >
                <X className="size-5" />
              </button>
            </div>
            <p className="mt-2 text-sm text-muted">Posting functionality arrives in a later step. You will need to log in to publish.</p>
            <div className="mt-4 space-y-3">
              <div>
                <label htmlFor="post-board" className="block text-xs font-medium text-muted mb-1">Board</label>
                <select id="post-board" className="w-full rounded border border-line bg-surface px-3 py-2 text-sm text-ink focus:outline-none focus:ring-2 focus:ring-orange-700">
                  {boards.map((b) => (
                    <option key={b.id} value={b.id}>{b.name}</option>
                  ))}
                </select>
              </div>
              <div>
                <label htmlFor="post-title" className="block text-xs font-medium text-muted mb-1">Title</label>
                <input id="post-title" type="text" className="w-full rounded border border-line bg-surface px-3 py-2 text-sm text-ink focus:outline-none focus:ring-2 focus:ring-orange-700" placeholder="What's on your mind?" />
              </div>
              <div>
                <label htmlFor="post-content" className="block text-xs font-medium text-muted mb-1">Content</label>
                <textarea id="post-content" rows={6} className="w-full rounded border border-line bg-surface px-3 py-2 text-sm text-ink focus:outline-none focus:ring-2 focus:ring-orange-700" placeholder="Write your post here... (Markdown supported)" />
              </div>
            </div>
            <div className="mt-4 flex justify-end gap-2">
              <button className="rounded-full border border-line px-3 py-1.5 text-xs font-semibold text-muted hover:bg-surface-muted" onClick={() => setShowCreatePost(false)}>Cancel</button>
              <button className="rounded-full bg-orange-700 px-3 py-1.5 text-xs font-semibold text-white hover:bg-orange-800" disabled>Post (Disabled)</button>
            </div>
          </div>
        </div>
      )}

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