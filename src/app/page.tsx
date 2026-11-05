"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useState, useEffect, Suspense } from "react";
import { Plus, MessageSquare } from "lucide-react";
import { Toaster } from "sonner";

import { SiteHeader } from "@/components/site-header";
import { BoardNav } from "@/components/board-nav";
import { MarkdownContent } from "@/components/markdown-content";
import { PostActions } from "@/components/post-actions";
import { BOARDS } from "@/lib/boards";
import { SEED_POSTS } from "@/lib/seed-posts";
import { loadPosts, loadComments, type SavedPost } from "@/lib/feed-store";
import { formatRelativeTime } from "@/lib/time";

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

export default function Home() {
  return (
    <Suspense
      fallback={
        <main className="flex flex-1 flex-col items-center justify-center px-4 text-center text-sm text-muted">
          <p>Loading…</p>
        </main>
      }
    >
      <HomeContent />
    </Suspense>
  );
}

function HomeContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const boardParam = searchParams.get("board");
  const activeBoard = BOARDS.some((board) => board.id === boardParam)
    ? boardParam
    : null;
  const setActiveBoard = (boardId: string | null) => {
    router.push(boardId ? `/?board=${encodeURIComponent(boardId)}` : "/");
  };

  const [activeSort, setActiveSort] = useState<SortOption>("new");
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

  return (
    <main className="flex flex-1 flex-col">
      <SiteHeader />

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