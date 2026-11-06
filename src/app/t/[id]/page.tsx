import { notFound } from "next/navigation";
import { connection } from "next/server";
import { Suspense } from "react";

import { isBanActive } from "@/lib/ban";
import {
  loadPostReactionSummaries,
  loadThreadCommentPage,
} from "@/lib/forum/comments";
import type {
  OpeningPostView,
  ThreadView,
  ThreadViewer,
} from "@/lib/forum/types";
import { createClient } from "@/lib/supabase/server";

import ThreadPageClient, { ThreadFallback } from "./thread-content";

export const instant = false;

function initialOf(username: string | null): string {
  return username?.slice(0, 1).toLowerCase() || "?";
}

export default function ThreadPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  return (
    <Suspense fallback={<ThreadFallback />}>
      <ThreadPageContent params={params} />
    </Suspense>
  );
}

async function ThreadPageContent({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await connection();

  const { id: rawId } = await params;
  const threadId = Number(rawId);

  if (!Number.isSafeInteger(threadId) || threadId <= 0) {
    notFound();
  }

  const supabase = await createClient();

  const { data: claimsData } = await supabase.auth.getClaims();
  const viewerId = String(claimsData?.claims.sub ?? "");

  let viewer: ThreadViewer | null = null;

  if (viewerId) {
    const { data: profile } = await supabase
      .from("profiles")
      .select("username, role, is_banned, banned_until")
      .eq("id", viewerId)
      .maybeSingle();

    if (profile) {
      viewer = {
        id: viewerId,
        username: profile.username,
        role: profile.role,
        isBanned: isBanActive(profile.is_banned, profile.banned_until),
      };
    }
  }

  const isStaff = Boolean(
    viewer &&
      !viewer.isBanned &&
      (viewer.role === "moderator" || viewer.role === "admin"),
  );

  let threadQuery = supabase
    .from("threads")
    .select(
      "id, board_id, title, author_id, is_locked, is_pinned, is_deleted, created_at, last_post_at, reply_count, deleted_reason, deleted_by, author:profiles!threads_author_id_fkey(username), board:boards!threads_board_id_fkey(name), deleter:profiles!threads_deleted_by_fkey(username)",
    )
    .eq("id", threadId);

  if (!isStaff) {
    threadQuery = threadQuery.eq("is_deleted", false);
  }

  const { data: threadData, error: threadError } = await threadQuery.maybeSingle();

  if (threadError) {
    return <ThreadError />;
  }

  if (!threadData) {
    notFound();
  }

  const rawThread = threadData as unknown as {
    id: number;
    board_id: string;
    title: string;
    author_id: string | null;
    is_locked: boolean;
    is_pinned: boolean;
    is_deleted: boolean;
    created_at: string;
    last_post_at: string;
    reply_count: number;
    deleted_reason: string | null;
    deleted_by: string | null;
    author: { username: string } | null;
    board: { name: string } | null;
    deleter: { username: string } | null;
  };

  if (rawThread.is_deleted && !isStaff) {
    notFound();
  }

  let openingQuery = supabase
    .from("posts")
    .select(
      "id, author_id, content, created_at, is_deleted, deleted_reason, deleted_by, author:profiles!posts_author_id_fkey(username), deleter:profiles!posts_deleted_by_fkey(username)",
    )
    .eq("thread_id", threadId)
    .eq("is_opening", true);

  if (!isStaff) {
    openingQuery = openingQuery.eq("is_deleted", false);
  }

  const { data: openingData, error: openingError } =
    await openingQuery.maybeSingle();

  if (openingError) {
    return <ThreadError />;
  }

  if (!openingData) {
    // No opening post at all, or it is soft-deleted and the viewer is not
    // staff. Both cases hide the thread.
    notFound();
  }

  const rawOpening = openingData as unknown as {
    id: number;
    author_id: string | null;
    content: string;
    created_at: string;
    is_deleted: boolean;
    deleted_reason: string | null;
    deleted_by: string | null;
    author: { username: string } | null;
    deleter: { username: string } | null;
  };

  const commentPage = await loadThreadCommentPage(supabase, threadId, null);
  const reactionSummaries = await loadPostReactionSummaries(supabase, [
    rawOpening.id,
    ...commentPage.comments.map((comment) => comment.id),
  ]);

  const thread: ThreadView = {
    id: rawThread.id,
    boardId: rawThread.board_id,
    boardName: rawThread.board?.name ?? "Board",
    title: rawThread.title,
    authorId: rawThread.author_id,
    author: rawThread.author?.username ?? "unknown",
    authorInitial: initialOf(rawThread.author?.username ?? null),
    createdAt: rawThread.created_at,
    isLocked: rawThread.is_locked,
    isPinned: rawThread.is_pinned,
    isDeleted: rawThread.is_deleted,
    deletedReason: rawThread.deleted_reason,
    deletedBy: rawThread.deleter?.username ?? null,
  };

  const openingPost: OpeningPostView = {
    id: rawOpening.id,
    authorId: rawOpening.author_id,
    author: rawOpening.author?.username ?? "unknown",
    authorInitial: initialOf(rawOpening.author?.username ?? null),
    body: rawOpening.content,
    createdAt: rawOpening.created_at,
    isDeleted: rawOpening.is_deleted,
    deletedReason: rawOpening.deleted_reason,
    deletedBy: rawOpening.deleter?.username ?? null,
  };

  return (
    <ThreadPageClient
      thread={thread}
      openingPost={openingPost}
      comments={commentPage.comments}
      reactions={reactionSummaries}
      nextCommentCursor={commentPage.nextCursor}
      commentTotal={rawThread.reply_count}
      viewer={viewer}
    />
  );
}

function ThreadError() {
  return (
    <main className="mx-auto w-full max-w-4xl px-3 py-6 sm:px-4">
      <div className="rounded-lg border border-amber-200 bg-amber-50 p-5 text-amber-900 dark:border-amber-800/70 dark:bg-amber-950/40 dark:text-amber-200">
        <p className="font-semibold">Could not load this thread.</p>
        <p className="mt-1 text-sm">
          Check the Supabase configuration and try again.
        </p>
      </div>
    </main>
  );
}
