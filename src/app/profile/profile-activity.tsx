"use client";

import { FileText, MessageSquare, Reply } from "lucide-react";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";

import { normaliseUsername } from "@/lib/auth/validation";
import {
  FEED_CHANGED_EVENT,
  loadAllComments,
  loadDeletedPostIds,
  loadPosts,
  type SavedComment,
  type SavedPost,
} from "@/lib/feed-store";
import { excerptFromHtml } from "@/lib/mentions";
import {
  loadReactionsForUser,
  type ReactionKind,
  type UserReaction,
} from "@/lib/reactions";
import { SEED_POSTS } from "@/lib/seed-posts";
import { formatRelativeTime } from "@/lib/time";

const REACTION_EMOJI: Record<ReactionKind, string> = {
  like: "👍",
  laugh: "😂",
  wow: "😮",
  anger: "😡",
  dislike: "👎",
};

type ProfileTab = "overview" | "posts" | "comments" | "reactions";

type ProfileActivityData = {
  allPosts: SavedPost[];
  posts: SavedPost[];
  allComments: SavedComment[];
  comments: SavedComment[];
  reactions: UserReaction[];
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

function byNewest(a: { createdAt: string }, b: { createdAt: string }) {
  return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
}

function readActivity(username: string): ProfileActivityData {
  const member = normaliseUsername(username);
  const deletedPosts = new Set(loadDeletedPostIds());
  const allPosts = [...SEED_POSTS, ...loadPosts()].filter(
    (post) => !deletedPosts.has(post.id),
  );
  const visiblePostIds = new Set(allPosts.map((post) => post.id));
  const allComments = loadAllComments().filter((comment) =>
    visiblePostIds.has(comment.postId),
  );

  return {
    allPosts,
    posts: allPosts
      .filter((post) => normaliseUsername(post.author) === member)
      .sort(byNewest),
    allComments,
    comments: allComments
      .filter((comment) => normaliseUsername(comment.author) === member)
      .sort(byNewest),
    reactions: loadReactionsForUser(member),
  };
}

export function ProfileActivity({
  username,
  isOwnProfile,
}: {
  username: string;
  isOwnProfile: boolean;
}) {
  const [data, setData] = useState<ProfileActivityData | null>(null);
  const [activeTab, setActiveTab] = useState<ProfileTab>("overview");
  const [now, setNow] = useState<Date | null>(null);

  useEffect(() => {
    const refresh = () => {
      setData(readActivity(username));
      setNow(new Date());
    };

    refresh();
    window.addEventListener(FEED_CHANGED_EVENT, refresh);
    const interval = window.setInterval(() => setNow(new Date()), 60_000);

    return () => {
      window.removeEventListener(FEED_CHANGED_EVENT, refresh);
      window.clearInterval(interval);
    };
  }, [username]);

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

  const commentCounts = useMemo(() => {
    const counts: Record<number, number> = {};

    for (const comment of data?.allComments ?? []) {
      counts[comment.postId] = (counts[comment.postId] ?? 0) + 1;
    }

    return counts;
  }, [data]);

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
            commentCounts={commentCounts}
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
  commentCounts,
  now,
  isOwnProfile,
}: {
  posts: SavedPost[];
  commentCounts: Record<number, number>;
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
            {commentCounts[post.id] ?? 0}{" "}
            {(commentCounts[post.id] ?? 0) === 1 ? "comment" : "comments"}
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
  comments: SavedComment[];
  postById: Map<number, SavedPost>;
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
