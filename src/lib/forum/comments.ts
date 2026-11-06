import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import {
  encodeCommentCursor,
  type Cursor,
} from "@/lib/forum/cursor";
import type { ThreadComment } from "@/lib/forum/types";
import {
  summariseReactionCounts,
  type ReactionSummary,
  type ReactionSummaryRow,
} from "@/lib/reactions";
import type { Database } from "@/lib/supabase/types";

export const COMMENT_PAGE_SIZE = 50;

type Client = SupabaseClient<Database>;

type CommentRow = {
  id: number;
  author_id: string | null;
  author_username: string | null;
  content: string;
  created_at: string;
  reply_to_post_id: number | null;
  reply_to_author_username: string | null;
  is_deleted: boolean;
  deleted_reason: string | null;
  deleted_by_username: string | null;
};

function initialOf(username: string | null): string {
  return username?.slice(0, 1).toLowerCase() || "?";
}

export async function loadThreadCommentPage(
  supabase: Client,
  threadId: number,
  cursor: Cursor | null,
): Promise<{ comments: ThreadComment[]; nextCursor: string | null }> {
  const { data, error } = await supabase.rpc("list_thread_comments", {
    p_thread_id: threadId,
    p_after_at: cursor?.at ?? undefined,
    p_after_id: cursor?.id ?? undefined,
    p_limit: COMMENT_PAGE_SIZE + 1,
  });

  if (error) {
    throw new Error(error.message);
  }

  const rows = (data ?? []) as unknown as CommentRow[];
  const hasMore = rows.length > COMMENT_PAGE_SIZE;
  const visible = rows.slice(0, COMMENT_PAGE_SIZE);
  const comments = visible.map<ThreadComment>((row) => ({
    id: row.id,
    authorId: row.author_id,
    author: row.author_username ?? "unknown",
    authorInitial: initialOf(row.author_username),
    body: row.content,
    createdAt: row.created_at,
    replyToId: row.reply_to_post_id,
    replyToAuthor: row.reply_to_author_username,
    isDeleted: row.is_deleted,
    deletedReason: row.deleted_reason,
    deletedBy: row.deleted_by_username,
  }));

  const last = visible[visible.length - 1];

  return {
    comments,
    nextCursor:
      hasMore && last
        ? encodeCommentCursor({ at: last.created_at, id: last.id })
        : null,
  };
}

export async function loadPostReactionSummaries(
  supabase: Client,
  postIds: number[],
): Promise<Record<number, ReactionSummary>> {
  const ids = [...new Set(postIds.filter((id) => Number.isSafeInteger(id) && id > 0))];

  if (ids.length === 0) {
    return {};
  }

  const { data, error } = await supabase.rpc("post_reaction_summary", {
    p_post_ids: ids.slice(0, 200),
  });

  if (error) {
    console.error("post_reaction_summary failed:", error.message);
    return {};
  }

  const rows = (data ?? []) as unknown as Array<
    ReactionSummaryRow & { post_id: number }
  >;
  const grouped = new Map<number, ReactionSummaryRow[]>();

  for (const row of rows) {
    const existing = grouped.get(row.post_id) ?? [];
    existing.push(row);
    grouped.set(row.post_id, existing);
  }

  const summaries: Record<number, ReactionSummary> = {};

  for (const id of ids.slice(0, 200)) {
    summaries[id] = summariseReactionCounts(grouped.get(id) ?? []);
  }

  return summaries;
}
