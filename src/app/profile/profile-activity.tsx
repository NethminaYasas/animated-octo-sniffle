"use client";

import { FileText, MessageSquare, Reply } from "lucide-react";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";

import { BOARDS } from "@/lib/boards";
import { excerptFromHtml } from "@/lib/mentions";
import type { ReactionKind } from "@/lib/reactions";
import { createClient } from "@/lib/supabase/client";
import { formatRelativeTime } from "@/lib/time";

const REACTION_EMOJI: Record<ReactionKind, string> = {
  like: "👍",
  laugh: "😂",
  wow: "😮",
  anger: "😡",
  dislike: "👎",
};

type ProfileTab = "overview" | "posts" | "comments" | "reactions";

type ActivityPost = {
  id: number;
  boardId: string;
  boardName: string;
  boardInitial: string;
  author: string;
  authorInitial: string;
  title: string;
  content: string;
  createdAt: string;
  commentCount: number;
  isPreview: boolean;
};

type ActivityComment = {
  id: number;
  postId: number;
  author: string;
  authorInitial: string;
  body: string;
  createdAt: string;
  replyToId: number | null;
  replyToAuthor: string | null;
};

type ActivityReaction = {
  targetType: "post" | "comment";
  targetId: number;
  kind: ReactionKind;
};

type ProfileActivityData = {
  allPosts: ActivityPost[];
  posts: ActivityPost[];
  allComments: ActivityComment[];
  comments: ActivityComment[];
  reactions: ActivityReaction[];
};

type ActivityEntry = {
  key: string;
  kind: "post" | "comment" | "reply";
  context: string;
  title: string;
  excerpt: string;
  createdAt: string;
  href: string;
};

type ReactionEntry = {
  key: string;
  emoji: string;
  context: string;
  title: string;
  excerpt: string;
  href: string;
};

type ThreadLookup = {
  id: number;
  title: string;
  board_id: string;
  is_deleted: boolean;
};

function byNewest(a: { createdAt: string }, b: { createdAt: string }) {
  return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
}

function initialOf(value: string): string {
  return value.slice(0, 1).toLowerCase() || "?";
}

function boardFor(boardId: string): { name: string; initial: string } {
  const board = BOARDS.find((candidate) => candidate.id === boardId);

  return {
    name: board?.name ?? "Board",
    initial: board?.initial ?? "?",
  };
}

async function readActivity(
  profileId: string,
  username: string,
): Promise<ProfileActivityData> {
  const supabase = createClient();

  const [threadsResponse, commentsResponse, reactionsResponse] =
    await Promise.all([
      supabase
        .from("threads")
        .select("id, title, board_id, created_at, reply_count")
        .eq("author_id", profileId)
        .eq("is_deleted", false)
        .order("created_at", { ascending: false })
        .limit(50),
      supabase
        .from("posts")
        .select(
          "id, thread_id, content, created_at, reply_to_post_id, thread:threads!posts_thread_id_fkey(id, title, board_id, is_deleted)",
        )
        .eq("author_id", profileId)
        .eq("is_deleted", false)
        .eq("is_opening", false)
        .order("created_at", { ascending: false })
        .limit(50),
      supabase
        .from("reactions")
        .select(
          "post_id, kind, created_at, post:posts!reactions_post_id_fkey(id, thread_id, content, is_opening, is_deleted, created_at, thread:threads!posts_thread_id_fkey(id, title, board_id, is_deleted))",
        )
        .eq("user_id", profileId)
        .order("created_at", { ascending: false })
        .limit(100),
    ]);

  if (threadsResponse.error || commentsResponse.error || reactionsResponse.error) {
    throw new Error("Could not load profile activity.");
  }

  const authoredThreads = (threadsResponse.data ?? []) as unknown as Array<{
    id: number;
    title: string;
    board_id: string;
    created_at: string;
    reply_count: number;
  }>;

  const threadIds = authoredThreads.map((thread) => thread.id);
  let openingPosts: Array<{ thread_id: number; content: string }> = [];

  if (threadIds.length > 0) {
    const { data: openingData, error: openingError } = await supabase
      .from("posts")
      .select("thread_id, content")
      .in("thread_id", threadIds)
      .eq("is_opening", true)
      .eq("is_deleted", false);

    if (openingError) {
      throw new Error("Could not load profile activity.");
    }

    openingPosts = (openingData ?? []) as unknown as typeof openingPosts;
  }

  const openingByThread = new Map(
    openingPosts.map((post) => [post.thread_id, post.content]),
  );

  const authoredComments = (
    (commentsResponse.data ?? []) as unknown as Array<{
      id: number;
      thread_id: number;
      content: string;
      created_at: string;
      reply_to_post_id: number | null;
      thread: ThreadLookup | null;
    }>
  ).filter(
    (comment): comment is typeof comment & { thread: ThreadLookup } =>
      Boolean(comment.thread && !comment.thread.is_deleted),
  );

  const replyIds = [
    ...new Set(
      authoredComments
        .map((comment) => comment.reply_to_post_id)
        .filter((id): id is number => typeof id === "number"),
    ),
  ];

  const replyAuthors = new Map<number, string>();

  if (replyIds.length > 0) {
    const { data } = await supabase
      .from("posts")
      .select("id, author:profiles!posts_author_id_fkey(username)")
      .in("id", replyIds);

    for (const row of (data ?? []) as unknown as Array<{
      id: number;
      author: { username: string } | null;
    }>) {
      if (row.author?.username) {
        replyAuthors.set(row.id, row.author.username);
      }
    }
  }

  const authoredPosts: ActivityPost[] = authoredThreads
    .filter((thread) => openingByThread.has(thread.id))
    .map((thread) => {
      const board = boardFor(thread.board_id);

      return {
        id: thread.id,
        boardId: thread.board_id,
        boardName: board.name,
        boardInitial: board.initial,
        author: username,
        authorInitial: initialOf(username),
        title: thread.title,
        content: openingByThread.get(thread.id) ?? "",
        createdAt: thread.created_at,
        commentCount: thread.reply_count,
        isPreview: false,
      };
    });

  const allPosts = new Map(
    authoredPosts.map((post) => [post.id, post] as const),
  );

  const ensureThread = (thread: ThreadLookup) => {
    if (allPosts.has(thread.id)) {
      return;
    }

    const board = boardFor(thread.board_id);

    allPosts.set(thread.id, {
      id: thread.id,
      boardId: thread.board_id,
      boardName: board.name,
      boardInitial: board.initial,
      author: "",
      authorInitial: "?",
      title: thread.title,
      content: "",
      createdAt: "",
      commentCount: 0,
      isPreview: false,
    });
  };

  const authoredCommentEntries: ActivityComment[] = authoredComments.map(
    (comment) => {
      ensureThread(comment.thread);

      return {
        id: comment.id,
        postId: comment.thread_id,
        author: username,
        authorInitial: initialOf(username),
        body: comment.content,
        createdAt: comment.created_at,
        replyToId: comment.reply_to_post_id,
        replyToAuthor: comment.reply_to_post_id
          ? (replyAuthors.get(comment.reply_to_post_id) ?? null)
          : null,
      };
    },
  );

  const allComments = new Map(
    authoredCommentEntries.map((comment) => [comment.id, comment] as const),
  );

  const reactionRows = (reactionsResponse.data ?? []) as unknown as Array<{
    post_id: number;
    kind: ReactionKind;
    created_at: string;
    post: {
      id: number;
      thread_id: number;
      content: string;
      is_opening: boolean;
      is_deleted: boolean;
      created_at: string;
      thread: ThreadLookup | null;
    } | null;
  }>;

  const reactions: ActivityReaction[] = [];

  for (const row of reactionRows) {
    const post = row.post;

    if (
      !post ||
      post.is_deleted ||
      !post.thread ||
      post.thread.is_deleted
    ) {
      continue;
    }

    ensureThread(post.thread);

    if (post.is_opening) {
      reactions.push({
        targetType: "post",
        targetId: post.thread_id,
        kind: row.kind,
      });
      continue;
    }

    if (!allComments.has(post.id)) {
      allComments.set(post.id, {
        id: post.id,
        postId: post.thread_id,
        author: "",
        authorInitial: "?",
        body: post.content,
        createdAt: post.created_at,
        replyToId: null,
        replyToAuthor: null,
      });
    }

    reactions.push({
      targetType: "comment",
      targetId: post.id,
      kind: row.kind,
    });
  }

  return {
    allPosts: [...allPosts.values()],
    posts: authoredPosts,
    allComments: [...allComments.values()],
    comments: authoredCommentEntries,
    reactions,
  };
}

export function ProfileActivity({
  profileId,
  username,
  isOwnProfile,
}: {
  profileId: string;
  username: string;
  isOwnProfile: boolean;
}) {
  const [data, setData] = useState<ProfileActivityData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<ProfileTab>("overview");
  const [now, setNow] = useState<Date | null>(null);

  useEffect(() => {
    let active = true;

    const refresh = async () => {
      try {
        const next = await readActivity(profileId, username);

        if (active) {
          setData(next);
          setError(null);
          setNow(new Date());
        }
      } catch {
        if (active) {
          setData({
            allPosts: [],
            posts: [],
            allComments: [],
            comments: [],
            reactions: [],
          });
          setError("Could not load this member's activity.");
          setNow(new Date());
        }
      }
    };

    void refresh();
    const interval = window.setInterval(() => setNow(new Date()), 60_000);

    return () => {
      active = false;
      window.clearInterval(interval);
    };
  }, [profileId, username]);

  const postById = useMemo(
    () => new Map((data?.allPosts ?? []).map((post) => [post.id, post])),
    [data],
  );

  const commentById = useMemo(
    () => new Map((data?.allComments ?? []).map((comment) => [comment.id, comment])),
    [data],
  );

  const activity = useMemo(() => {
    if (!data) {
      return [];
    }

    const entries: ActivityEntry[] = [];

    for (const post of data.posts) {
      entries.push({
        key: `post-${post.id}`,
        kind: "post",
        context: `Posted in ${post.boardName}`,
        title: post.title,
        excerpt: excerptFromHtml(post.content, 170),
        createdAt: post.createdAt,
        href: `/t/${post.id}`,
      });
    }

    for (const comment of data.comments) {
      const post = postById.get(comment.postId);

      if (!post) {
        continue;
      }

      entries.push({
        key: `comment-${comment.id}`,
        kind: comment.replyToAuthor ? "reply" : "comment",
        context: comment.replyToAuthor
          ? `Replied to @${comment.replyToAuthor} in ${post.boardName}`
          : `Commented in ${post.boardName}`,
        title: post.title,
        excerpt: excerptFromHtml(comment.body, 170),
        createdAt: comment.createdAt,
        href: `/t/${comment.postId}#comment-${comment.id}`,
      });
    }

    return entries.sort(byNewest);
  }, [data, postById]);

  const reactionEntries = useMemo(() => {
    if (!data) {
      return [];
    }

    const entries: ReactionEntry[] = [];

    for (const reaction of data.reactions) {
      const emoji = REACTION_EMOJI[reaction.kind];

      if (reaction.targetType === "post") {
        const post = postById.get(reaction.targetId);

        if (!post) {
          continue;
        }

        entries.push({
          key: `reaction-post-${post.id}`,
          emoji,
          context: `Reacted to a post in ${post.boardName}`,
          title: post.title,
          excerpt: "",
          href: `/t/${post.id}`,
        });
        continue;
      }

      const comment = commentById.get(reaction.targetId);
      const post = comment ? postById.get(comment.postId) : null;

      if (!comment || !post) {
        continue;
      }

      entries.push({
        key: `reaction-comment-${comment.id}`,
        emoji,
        context: `Reacted to a comment in ${post.boardName}`,
        title: post.title,
        excerpt: excerptFromHtml(comment.body, 130),
        href: `/t/${post.id}#comment-${comment.id}`,
      });
    }

    return entries;
  }, [commentById, data, postById]);

  const tabs: Array<{ id: ProfileTab; label: string; count?: number }> = [
    { id: "overview", label: "Overview" },
    { id: "posts", label: "Posts", count: data?.posts.length ?? 0 },
    { id: "comments", label: "Comments", count: data?.comments.length ?? 0 },
    { id: "reactions", label: "Reactions", count: reactionEntries.length },
  ];

  return (
    <section className="mt-4 overflow-hidden rounded-xl border border-line bg-surface">
      <div
        role="tablist"
        aria-label="Profile activity"
        className="flex gap-1 overflow-x-auto border-b border-line px-2 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
      >
        {tabs.map((tab) => {
          const selected = activeTab === tab.id;

          return (
            <button
              key={tab.id}
              type="button"
              role="tab"
              aria-selected={selected}
              aria-controls={`profile-panel-${tab.id}`}
              id={`profile-tab-${tab.id}`}
              onClick={() => setActiveTab(tab.id)}
              className={`relative flex shrink-0 items-center gap-1.5 px-3 py-2.5 text-xs font-semibold transition-colors ${
                selected ? "text-ink" : "text-muted hover:text-ink"
              }`}
            >
              {tab.label}
              {tab.count && tab.count > 0 ? (
                <span className="rounded-full bg-surface-muted px-1.5 py-0.5 text-[10px] font-semibold leading-none text-muted">
                  {tab.count}
                </span>
              ) : null}
              {selected ? (
                <span
                  aria-hidden="true"
                  className="absolute inset-x-2 -bottom-px h-0.5 bg-orange-700 dark:bg-orange-500"
                />
              ) : null}
            </button>
          );
        })}
      </div>

      {error ? (
        <p className="border-b border-line bg-amber-50 px-4 py-2 text-xs text-amber-900 dark:bg-amber-950/30 dark:text-amber-200">
          {error}
        </p>
      ) : null}

      <div
        id={`profile-panel-${activeTab}`}
        role="tabpanel"
        aria-labelledby={`profile-tab-${activeTab}`}
      >
        {!data ? (
          <ActivitySkeleton />
        ) : activeTab === "overview" ? (
          <OverviewPanel
            activity={activity}
            reactions={reactionEntries}
            now={now}
            isOwnProfile={isOwnProfile}
          />
        ) : activeTab === "posts" ? (
          <PostsPanel
            posts={data.posts}
            now={now}
            isOwnProfile={isOwnProfile}
          />
        ) : activeTab === "comments" ? (
          <CommentsPanel
            comments={data.comments}
            postById={postById}
            now={now}
            isOwnProfile={isOwnProfile}
          />
        ) : (
          <ReactionsPanel
            reactions={reactionEntries}
            isOwnProfile={isOwnProfile}
          />
        )}
      </div>
    </section>
  );
}

function ActivitySkeleton() {
  return (
    <div className="space-y-4 p-4" aria-busy="true">
      {[0, 1, 2].map((row) => (
        <div key={row} className="flex gap-3">
          <span className="size-8 shrink-0 animate-pulse rounded-full bg-surface-muted" />
          <div className="min-w-0 flex-1 space-y-2">
            <span className="block h-3 w-32 animate-pulse rounded bg-surface-muted" />
            <span className="block h-4 w-3/4 animate-pulse rounded bg-surface-muted" />
            <span className="block h-3 w-full animate-pulse rounded bg-surface-muted" />
          </div>
        </div>
      ))}
    </div>
  );
}

function EmptyState({
  title,
  description,
}: {
  title: string;
  description: string;
}) {
  return (
    <div className="px-4 py-10 text-center">
      <p className="text-sm font-semibold text-ink">{title}</p>
      <p className="mx-auto mt-1 max-w-sm text-xs leading-5 text-muted">
        {description}
      </p>
    </div>
  );
}

function ActivityIcon({ kind }: { kind: ActivityEntry["kind"] }) {
  const Icon =
    kind === "post" ? FileText : kind === "reply" ? Reply : MessageSquare;

  return (
    <span className="grid size-8 shrink-0 place-items-center rounded-full bg-surface-muted text-muted">
      <Icon className="size-4" aria-hidden="true" />
    </span>
  );
}

function ActivityRow({
  entry,
  now,
}: {
  entry: ActivityEntry;
  now: Date | null;
}) {
  return (
    <li className="flex gap-3 px-4 py-3.5">
      <ActivityIcon kind={entry.kind} />
      <div className="min-w-0 flex-1">
        <p className="text-[11px] font-medium text-muted">{entry.context}</p>
        <Link
          href={entry.href}
          className="mt-1 block text-sm font-semibold text-ink transition-colors hover:text-orange-700 dark:hover:text-orange-400"
        >
          {entry.title}
        </Link>
        {entry.excerpt ? (
          <p className="mt-1 line-clamp-2 text-xs leading-5 text-muted">
            {entry.excerpt}
          </p>
        ) : null}
        <p
          suppressHydrationWarning
          className="mt-1.5 text-[11px] text-faint"
        >
          {now ? formatRelativeTime(entry.createdAt, now) : "just now"}
        </p>
      </div>
    </li>
  );
}

function OverviewPanel({
  activity,
  reactions,
  now,
  isOwnProfile,
}: {
  activity: ActivityEntry[];
  reactions: ReactionEntry[];
  now: Date | null;
  isOwnProfile: boolean;
}) {
  if (activity.length === 0 && reactions.length === 0) {
    return (
      <EmptyState
        title="No activity yet"
        description={
          isOwnProfile
            ? "Your posts, comments, replies and reactions will show up here."
            : "This member's posts, comments and reactions will show up here."
        }
      />
    );
  }

  return (
    <div>
      {activity.length > 0 ? (
        <ol className="divide-y divide-line">
          {activity.slice(0, 10).map((entry) => (
            <ActivityRow key={entry.key} entry={entry} now={now} />
          ))}
        </ol>
      ) : null}

      {reactions.length > 0 ? (
        <div className="border-t border-line px-4 py-3.5">
          <h3 className="text-[11px] font-semibold uppercase tracking-wide text-muted">
            Recent reactions
          </h3>
          <ul className="mt-2 space-y-2.5">
            {reactions.slice(0, 5).map((entry) => (
              <li key={entry.key} className="flex items-start gap-2 text-xs">
                <span aria-hidden="true" className="text-base leading-5">
                  {entry.emoji}
                </span>
                <div className="min-w-0">
                  <p className="text-muted">{entry.context}</p>
                  <Link
                    href={entry.href}
                    className="font-semibold text-ink transition-colors hover:text-orange-700 dark:hover:text-orange-400"
                  >
                    {entry.title}
                  </Link>
                </div>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </div>
  );
}

function PostsPanel({
  posts,
  now,
  isOwnProfile,
}: {
  posts: ActivityPost[];
  now: Date | null;
  isOwnProfile: boolean;
}) {
  if (posts.length === 0) {
    return (
      <EmptyState
        title="No posts yet"
        description={
          isOwnProfile
            ? "Start a thread and it will appear on your profile."
            : "This member has not posted yet."
        }
      />
    );
  }

  return (
    <ol className="divide-y divide-line">
      {posts.map((post) => (
        <li key={post.id} className="px-4 py-3.5">
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[11px] text-muted">
            <span className="font-semibold text-ink">{post.boardName}</span>
            <span aria-hidden="true">•</span>
            <span suppressHydrationWarning>
              {now ? formatRelativeTime(post.createdAt, now) : "just now"}
            </span>
          </div>
          <Link
            href={`/t/${post.id}`}
            className="mt-1 block text-sm font-semibold text-ink transition-colors hover:text-orange-700 dark:hover:text-orange-400"
          >
            {post.title}
          </Link>
          {post.content.trim() ? (
            <p className="mt-1 line-clamp-2 text-xs leading-5 text-muted">
              {excerptFromHtml(post.content, 180)}
            </p>
          ) : null}
          <div className="mt-2 flex items-center gap-1.5 text-[11px] font-semibold text-muted">
            <MessageSquare className="size-3.5" aria-hidden="true" />
            {post.commentCount}{" "}
            {post.commentCount === 1 ? "comment" : "comments"}
          </div>
        </li>
      ))}
    </ol>
  );
}

function CommentsPanel({
  comments,
  postById,
  now,
  isOwnProfile,
}: {
  comments: ActivityComment[];
  postById: Map<number, ActivityPost>;
  now: Date | null;
  isOwnProfile: boolean;
}) {
  if (comments.length === 0) {
    return (
      <EmptyState
        title="No comments yet"
        description={
          isOwnProfile
            ? "Join a discussion and your comments and replies will appear here."
            : "This member has not commented yet."
        }
      />
    );
  }

  return (
    <ol className="divide-y divide-line">
      {comments.map((comment) => {
        const post = postById.get(comment.postId);

        if (!post) {
          return null;
        }

        return (
          <li key={comment.id} className="px-4 py-3.5">
            <p className="text-[11px] text-muted">
              {comment.replyToAuthor
                ? `Replied to @${comment.replyToAuthor}`
                : "Commented"}{" "}
              in{" "}
              <Link
                href={`/t/${post.id}#comment-${comment.id}`}
                className="font-semibold text-ink hover:text-orange-700 dark:hover:text-orange-400"
              >
                {post.title}
              </Link>
            </p>
            <p className="mt-1.5 line-clamp-3 text-sm leading-6 text-body">
              {excerptFromHtml(comment.body, 260)}
            </p>
            <p
              suppressHydrationWarning
              className="mt-1.5 text-[11px] text-faint"
            >
              {now ? formatRelativeTime(comment.createdAt, now) : "just now"}
            </p>
          </li>
        );
      })}
    </ol>
  );
}

function ReactionsPanel({
  reactions,
  isOwnProfile,
}: {
  reactions: ReactionEntry[];
  isOwnProfile: boolean;
}) {
  if (reactions.length === 0) {
    return (
      <EmptyState
        title="No reactions yet"
        description={
          isOwnProfile
            ? "Reactions you leave on posts and comments will appear here."
            : "This member has not reacted to anything yet."
        }
      />
    );
  }

  return (
    <ul className="divide-y divide-line">
      {reactions.map((entry) => (
        <li key={entry.key} className="flex gap-3 px-4 py-3.5">
          <span
            aria-hidden="true"
            className="grid size-8 shrink-0 place-items-center rounded-full bg-surface-muted text-base"
          >
            {entry.emoji}
          </span>
          <div className="min-w-0 flex-1">
            <p className="text-[11px] text-muted">{entry.context}</p>
            <Link
              href={entry.href}
              className="mt-1 block text-sm font-semibold text-ink transition-colors hover:text-orange-700 dark:hover:text-orange-400"
            >
              {entry.title}
            </Link>
            {entry.excerpt ? (
              <p className="mt-1 line-clamp-2 text-xs leading-5 text-muted">
                {entry.excerpt}
              </p>
            ) : null}
          </div>
        </li>
      ))}
    </ul>
  );
}
