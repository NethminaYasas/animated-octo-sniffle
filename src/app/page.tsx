"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useEffect } from "react";
import { Plus } from "lucide-react";
import { Toaster } from "sonner";

import { ForumShell } from "@/components/forum-shell";
import { UserAvatar } from "@/components/user-avatar";
import { UserHoverCard } from "@/components/user-hover-card";
import { BOARDS } from "@/lib/boards";
import { SEED_POSTS } from "@/lib/seed-posts";
import {
  FEED_CHANGED_EVENT,
  loadComments,
  loadDeletedPostIds,
  loadPosts,
  type SavedComment,
  type SavedPost,
} from "@/lib/feed-store";

type SortOption = "new" | "hot" | "best";

type FeedPost = SavedPost & {
  /** Latest comment, or the post itself when nobody has replied yet. */
  lastActivityAt: string;
  lastCommentAuthor: string | null;
  lastCommentIsReply: boolean;
};

type PostActivity = {
  commentCount: number;
  lastCommentAuthor: string | null;
  lastCommentAt: string | null;
  lastCommentIsReply: boolean;
};

function formatPostDate(dateString: string): string {
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

function latestComment(comments: SavedComment[]): SavedComment | null {
  return comments.reduce<SavedComment | null>((latest, comment) => {
    if (!latest) {
      return comment;
    }

    return new Date(comment.createdAt).getTime() >
      new Date(latest.createdAt).getTime()
      ? comment
      : latest;
  }, null);
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

function PostCard({ post }: { post: FeedPost }) {
  return (
    <article className="mt-3 flex items-start gap-3 rounded border border-line bg-surface p-3 transition-colors hover:border-orange-700/30 dark:hover:border-orange-500/30 sm:p-4">
      <UserHoverCard
        username={post.author}
        initial={post.authorInitial}
        className="shrink-0 rounded-full focus:outline-none focus-visible:ring-2 focus-visible:ring-orange-600 focus-visible:ring-offset-2"
      >
        <UserAvatar
          username={post.author}
          initial={post.authorInitial}
          className="size-10 sm:size-11"
        />
        <span className="sr-only">{post.author}</span>
      </UserHoverCard>
      <div className="min-w-0 flex-1">
        <Link href={`/t/${post.id}`} className="block">
          <h2 className="text-base font-semibold leading-6 text-ink transition-colors hover:text-orange-700 sm:text-lg dark:hover:text-orange-400">
            {post.title}
          </h2>
        </Link>
        <p className="mt-0.5 text-xs text-muted">
          <UserHoverCard
            username={post.author}
            initial={post.authorInitial}
            className="font-semibold text-ink underline-offset-2 hover:underline"
          >
            {post.author}
          </UserHoverCard>
        </p>
        <p className="mt-0.5 flex flex-wrap items-center gap-x-1.5 text-[11px] text-faint">
          <span>Posted {formatPostDate(post.createdAt)}</span>
          {post.lastCommentAuthor ? (
            <>
              <span aria-hidden="true">•</span>
              <span>
                {post.lastCommentIsReply ? "Last reply" : "Last comment"} by{" "}
                <span className="font-semibold text-muted">
                  {post.lastCommentAuthor}
                </span>
              </span>
            </>
          ) : null}
        </p>
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
  posts: FeedPost[];
  sort: SortOption;
  now: Date | null;
  createPostHref: string;
}) {
  const sortedPosts = [...posts];

  const nowTime = now?.getTime() ?? 1704067200000; // 2024-01-01T00:00:00Z

  switch (sort) {
    case "new":
      // "New" means most recently active: a reply bumps the thread back up.
      sortedPosts.sort(
        (a, b) =>
          new Date(b.lastActivityAt).getTime() -
            new Date(a.lastActivityAt).getTime() ||
          new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
      );
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
        <PostCard key={post.id} post={post} />
      ))}
    </div>
  );
}

export default function Home() {
  return <HomeContent />;
}

function HomeContent() {
  const router = useRouter();
  const [activeBoard, setActiveBoardState] = useState<string | null>(null);
  const setActiveBoard = (boardId: string | null) => {
    setActiveBoardState(boardId);
    router.push(boardId ? `/?board=${encodeURIComponent(boardId)}` : "/");
  };

  useEffect(() => {
    const syncBoard = () => {
      const params = new URLSearchParams(window.location.search);
      const board = params.get("board");
      setActiveBoardState(
        BOARDS.some((candidate) => candidate.id === board) ? board : null,
      );
    };

    syncBoard();
    window.addEventListener("popstate", syncBoard);

    return () => window.removeEventListener("popstate", syncBoard);
  }, []);

  const [activeSort, setActiveSort] = useState<SortOption>("new");
  const [createdPosts, setCreatedPosts] = useState<SavedPost[]>([]);
  const [deletedPostIds, setDeletedPostIds] = useState<number[]>([]);
  const [postActivity, setPostActivity] = useState<Record<number, PostActivity>>({});
  const [now, setNow] = useState<Date | null>(null);

  useEffect(() => {
    const currentDate = new Date();
    // eslint-disable-next-line react-hooks/set-state-in-effect -- start the ranking clock on the client
    setNow(currentDate);
    const interval = setInterval(() => setNow(new Date()), 60_000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    const syncFeed = () => {
      const saved = loadPosts();
      setCreatedPosts(saved);
      setDeletedPostIds(loadDeletedPostIds());

      const activity: Record<number, PostActivity> = {};
      for (const post of [...SEED_POSTS, ...saved]) {
        const comments = loadComments(post.id);
        const latest = latestComment(comments);

        activity[post.id] = {
          commentCount: comments.length,
          lastCommentAuthor: latest?.author ?? null,
          lastCommentAt: latest?.createdAt ?? null,
          lastCommentIsReply: Boolean(latest?.replyToAuthor),
        };
      }
      setPostActivity(activity);
    };

    syncFeed();
    window.addEventListener(FEED_CHANGED_EVENT, syncFeed);
    // Comments written in another tab arrive as a storage event.
    window.addEventListener("storage", syncFeed);

    return () => {
      window.removeEventListener(FEED_CHANGED_EVENT, syncFeed);
      window.removeEventListener("storage", syncFeed);
    };
  }, []);

  const feed: FeedPost[] = [...SEED_POSTS, ...createdPosts]
    .filter((post) => !deletedPostIds.includes(post.id))
    .map((post) => {
      const activity = postActivity[post.id];
      const lastCommentAt = activity?.lastCommentAt ?? null;
      const lastActivityAt =
        lastCommentAt &&
        new Date(lastCommentAt).getTime() > new Date(post.createdAt).getTime()
          ? lastCommentAt
          : post.createdAt;

      return {
        ...post,
        commentCount: activity?.commentCount ?? post.commentCount,
        lastActivityAt,
        lastCommentAuthor: activity?.lastCommentAuthor ?? null,
        lastCommentIsReply: activity?.lastCommentIsReply ?? false,
      };
    });

  const filteredPosts = activeBoard
    ? feed.filter((p) => p.boardId === activeBoard)
    : feed;

  const createPostHref = activeBoard
    ? `/create?board=${encodeURIComponent(activeBoard)}`
    : "/create";

  return (
    <>
      <ForumShell activeBoard={activeBoard} onBoardSelect={setActiveBoard}>
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
            {BOARDS.map((board) => {
              const Icon = board.icon;

              return (
                <button
                  key={board.id}
                  className={`flex shrink-0 items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-semibold transition-colors ${
                    activeBoard === board.id
                      ? "bg-orange-700 text-white"
                      : "bg-surface-muted text-muted hover:text-ink"
                  }`}
                  onClick={() => setActiveBoard(board.id)}
                >
                  <Icon className="size-3.5" aria-hidden="true" />
                  {board.name}
                </button>
              );
            })}
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

      </ForumShell>

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
    </>
  );
}