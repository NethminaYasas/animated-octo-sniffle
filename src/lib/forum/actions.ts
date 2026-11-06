"use server";

import { revalidatePath } from "next/cache";

import { recordSecurityEvent } from "@/lib/audit/security-events";
import { getServerSession, type ServerUser } from "@/lib/auth/server-user";
import { verifyTurnstile } from "@/lib/auth/turnstile";
import {
  loadPostReactionSummaries,
  loadThreadCommentPage,
} from "@/lib/forum/comments";
import { loadAttachments } from "@/lib/media/attachments";
import { decodeCommentCursor } from "@/lib/forum/cursor";
import { sanitiseRichText } from "@/lib/forum/sanitize";
import type { Attachment, UploadState } from "@/lib/attachments";
import type { ThreadComment } from "@/lib/forum/types";
import {
  excerptFromHtml,
  extractMentions,
  extractQuoteAuthors,
  normaliseMentionName,
} from "@/lib/mentions";
import {
  isReactionKind,
  type ReactionCounts,
  type ReactionKind,
} from "@/lib/reactions";
import { hasRichText } from "@/lib/rich-text";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import {
  isRateLimitError,
  rateLimitMessage,
  rateLimitRetrySeconds,
  type SupabaseErrorShape,
} from "@/lib/supabase-errors";
import type { TablesInsert } from "@/lib/supabase/types";

const MAX_CONTENT_LENGTH = 20_000;
const MAX_TITLE_LENGTH = 200;
const MIN_TITLE_LENGTH = 3;
const MAX_NOTIFICATION_RECIPIENTS = 20;
const MAX_ATTACHMENTS = 8;
const UPLOAD_ID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function parseUploadIds(
  input: unknown,
): { ok: true; ids: string[] } | { ok: false; error: string } {
  if (input === null || input === undefined) {
    return { ok: true, ids: [] };
  }

  if (!Array.isArray(input)) {
    return { ok: false, error: "Invalid attachments." };
  }

  if (input.length > MAX_ATTACHMENTS) {
    return {
      ok: false,
      error: `A post can have at most ${MAX_ATTACHMENTS} attachments.`,
    };
  }

  const ids = [...new Set(input)];

  for (const value of ids) {
    if (typeof value !== "string" || !UPLOAD_ID_PATTERN.test(value)) {
      return { ok: false, error: "Invalid attachments." };
    }
  }

  return { ok: true, ids: ids as string[] };
}

async function linkUploads(
  supabase: Awaited<ReturnType<typeof createClient>>,
  postId: number,
  ids: string[],
): Promise<boolean> {
  if (ids.length === 0) {
    return true;
  }

  const { error } = await supabase.rpc("link_uploads_to_post", {
    p_post_id: postId,
    p_upload_ids: ids,
  });

  if (error) {
    console.error("link_uploads_to_post failed:", error.message);
    return false;
  }

  return true;
}

type NotificationKind = "reply" | "quote" | "mention";

type ProfileLookup = {
  id: string;
  username: string;
};

type ThreadRow = {
  id: number;
  title: string;
  author_id: string | null;
  is_locked: boolean;
  is_deleted: boolean;
};

type PostLookup = {
  id: number;
  author_id: string | null;
  thread_id: number;
  is_deleted: boolean;
};

type SupabaseServerClient = Awaited<
  ReturnType<typeof getServerSession>
>["supabase"];

export type CreateThreadResult =
  | { ok: true; threadId: number; attachmentsFailed?: boolean }
  | { ok: false; error: string };

export type CreatedComment = {
  id: number;
  authorId: string;
  author: string;
  authorInitial: string;
  body: string;
  createdAt: string;
  replyToId: number | null;
  replyToAuthor: string | null;
};

export type CreateCommentResult =
  | { ok: true; comment: CreatedComment; attachmentsFailed?: boolean }
  | { ok: false; error: string };

export type BasicActionResult =
  | { ok: true }
  | { ok: false; error: string };

function failure(message: string): { ok: false; error: string } {
  return { ok: false, error: message };
}

async function recordRateLimit(
  userId: string,
  action: "thread" | "comment",
  error: SupabaseErrorShape,
): Promise<void> {
  await recordSecurityEvent({
    event: "forum.rate_limited",
    userId,
    metadata: {
      action,
      retry_after_seconds: rateLimitRetrySeconds(error),
    },
  });
}

function validateTitle(value: unknown): { title: string } | { error: string } {
  const title = typeof value === "string" ? value.trim() : "";
  const length = [...title].length;

  if (length < MIN_TITLE_LENGTH) {
    return { error: `Use at least ${MIN_TITLE_LENGTH} characters for the title.` };
  }

  if (length > MAX_TITLE_LENGTH) {
    return { error: `Use at most ${MAX_TITLE_LENGTH} characters for the title.` };
  }

  return { title };
}

function validateContent(value: unknown): { content: string } | { error: string } {
  if (typeof value !== "string") {
    return { error: "Write something before posting." };
  }

  if (value.length > MAX_CONTENT_LENGTH) {
    return { error: "That post is too long." };
  }

  const content = sanitiseRichText(value);

  if (!hasRichText(content)) {
    return { error: "Write something before posting." };
  }

  if (content.length > MAX_CONTENT_LENGTH) {
    return { error: "That post is too long." };
  }

  return { content };
}

async function captchaProblem(
  user: ServerUser,
  token: unknown,
): Promise<string | null> {
  // SPEC: Turnstile is required for new accounts, not established members.
  if (user.role !== "new_member") {
    return null;
  }

  if (typeof token !== "string" || token.trim() === "") {
    return "Complete the CAPTCHA before posting.";
  }

  const result = await verifyTurnstile(token);
  return result.ok ? null : result.error;
}

async function profilesByUsername(
  supabase: SupabaseServerClient,
  usernames: string[],
): Promise<ProfileLookup[]> {
  const names = [
    ...new Set(
      usernames
        .map(normaliseMentionName)
        .filter(Boolean)
        .slice(0, MAX_NOTIFICATION_RECIPIENTS),
    ),
  ];

  if (names.length === 0) {
    return [];
  }

  const { data, error } = await supabase
    .from("profiles")
    .select("id, username")
    .in("username", names);

  if (error) {
    return [];
  }

  return (data ?? []) as ProfileLookup[];
}

/**
 * Creates reply/quote/mention notifications after a comment or opening post is
 * saved. Every recipient is resolved from a database row: the reply target's
 * author_id, the thread's author_id, or a profile looked up by username. The
 * client never supplies a recipient id.
 */
async function createNotifications(input: {
  supabase: SupabaseServerClient;
  actor: ServerUser;
  threadId: number;
  threadTitle: string;
  postId: number;
  content: string;
  replyRecipientId?: string | null;
  fallbackThreadAuthorId?: string | null;
}): Promise<void> {
  const recipients = new Map<string, NotificationKind>();
  const priority: Record<NotificationKind, number> = {
    reply: 3,
    quote: 2,
    mention: 1,
  };

  const addRecipient = (id: string | null | undefined, kind: NotificationKind) => {
    if (!id || id === input.actor.id) {
      return;
    }

    const existing = recipients.get(id);

    if (!existing || priority[kind] > priority[existing]) {
      recipients.set(id, kind);
    }
  };

  addRecipient(
    input.replyRecipientId ?? input.fallbackThreadAuthorId ?? null,
    "reply",
  );

  const nameKinds = new Map<string, NotificationKind>();

  for (const name of extractQuoteAuthors(input.content)) {
    nameKinds.set(normaliseMentionName(name), "quote");
  }

  for (const name of extractMentions(input.content)) {
    const normalised = normaliseMentionName(name);

    if (!nameKinds.has(normalised)) {
      nameKinds.set(normalised, "mention");
    }
  }

  const profiles = await profilesByUsername(
    input.supabase,
    [...nameKinds.keys()].slice(0, MAX_NOTIFICATION_RECIPIENTS),
  );

  for (const profile of profiles) {
    const kind = nameKinds.get(normaliseMentionName(profile.username));

    if (kind) {
      addRecipient(profile.id, kind);
    }
  }

  if (recipients.size === 0) {
    return;
  }

  const excerpt = excerptFromHtml(input.content, 180);

  const rows: TablesInsert<"notifications">[] = [...recipients.entries()].map(
    ([userId, kind]) => ({
      user_id: userId,
      actor_id: input.actor.id,
      actor_username: input.actor.username,
      kind,
      thread_id: input.threadId,
      thread_title: input.threadTitle,
      post_id: input.postId,
      excerpt,
    }),
  );

  const admin = createAdminClient();

  if (!admin) {
    console.error(
      "notifications were not written: SUPABASE_SERVICE_ROLE_KEY is not configured",
    );
    return;
  }

  const { error } = await admin.from("notifications").insert(rows);

  if (error) {
    console.error("notifications insert failed:", error.message);
  }
}

export async function createThread(input: {
  boardId?: unknown;
  title?: unknown;
  content?: unknown;
  captchaToken?: unknown;
  uploadIds?: unknown;
}): Promise<CreateThreadResult> {
  const { supabase, user } = await getServerSession();

  if (!user) {
    return failure("Log in to start a thread.");
  }

  if (user.isBanned) {
    return failure("Banned members cannot start threads.");
  }

  const boardId =
    typeof input.boardId === "string" ? input.boardId.trim() : "";

  if (!/^[a-z0-9]+(-[a-z0-9]+)*$/.test(boardId)) {
    return failure("Choose a board.");
  }

  const { data: board, error: boardError } = await supabase
    .from("boards")
    .select("id")
    .eq("id", boardId)
    .maybeSingle();

  if (boardError || !board) {
    return failure("That board does not exist.");
  }

  const titleResult = validateTitle(input.title);

  if ("error" in titleResult) {
    return failure(titleResult.error);
  }

  const contentResult = validateContent(input.content);

  if ("error" in contentResult) {
    return failure(contentResult.error);
  }

  const captchaError = await captchaProblem(user, input.captchaToken);

  if (captchaError) {
    return failure(captchaError);
  }

  const uploadIds = parseUploadIds(input.uploadIds);

  if (!uploadIds.ok) {
    return failure(uploadIds.error);
  }

  const { data, error } = await supabase.rpc("create_thread", {
    p_board_id: boardId,
    p_title: titleResult.title,
    p_content: contentResult.content,
  });

  if (error) {
    if (isRateLimitError(error)) {
      await recordRateLimit(user.id, "thread", error);
      return failure(rateLimitMessage(rateLimitRetrySeconds(error)));
    }

    console.error("create_thread failed:", error.message);
    return failure("Could not create the thread. Try again.");
  }

  const created = Array.isArray(data) ? data[0] : null;

  if (!created) {
    return failure("Could not create the thread. Try again.");
  }

  const attachmentsOk = await linkUploads(
    supabase,
    created.post_id,
    uploadIds.ids,
  );

  if (!attachmentsOk) {
    await recordSecurityEvent({
      event: "upload.attachment_failed",
      userId: user.id,
      metadata: { postId: created.post_id, kind: "thread" },
    });
  }

  await createNotifications({
    supabase,
    actor: user,
    threadId: created.thread_id,
    threadTitle: titleResult.title,
    postId: created.post_id,
    content: contentResult.content,
  });

  revalidatePath("/");
  revalidatePath("/create");
  revalidatePath(`/t/${created.thread_id}`);

  return {
    ok: true,
    threadId: created.thread_id,
    attachmentsFailed: !attachmentsOk,
  };
}

export async function createComment(input: {
  threadId?: unknown;
  content?: unknown;
  replyToPostId?: unknown;
  captchaToken?: unknown;
  uploadIds?: unknown;
}): Promise<CreateCommentResult> {
  const threadId = Number(input.threadId);

  if (!Number.isSafeInteger(threadId) || threadId <= 0) {
    return failure("Thread not found.");
  }

  const { supabase, user } = await getServerSession();

  if (!user) {
    return failure("Log in to comment.");
  }

  if (user.isBanned) {
    return failure("Banned members cannot comment.");
  }

  const { data: threadData, error: threadError } = await supabase
    .from("threads")
    .select("id, title, author_id, is_locked, is_deleted")
    .eq("id", threadId)
    .maybeSingle();

  const thread = threadData as ThreadRow | null;

  if (threadError || !thread || thread.is_deleted) {
    return failure("This thread is not available.");
  }

  if (thread.is_locked) {
    return failure("This thread is locked.");
  }

  const { data: openingPost, error: openingError } = await supabase
    .from("posts")
    .select("id")
    .eq("thread_id", threadId)
    .eq("is_opening", true)
    .eq("is_deleted", false)
    .maybeSingle();

  if (openingError || !openingPost) {
    return failure("This thread is not available.");
  }

  let replyTarget:
    | { id: number; authorId: string | null; authorUsername: string | null }
    | null = null;

  if (input.replyToPostId !== null && input.replyToPostId !== undefined) {
    const replyToPostId = Number(input.replyToPostId);

    if (!Number.isSafeInteger(replyToPostId) || replyToPostId <= 0) {
      return failure("That reply target is not available.");
    }

    const { data: targetData, error: targetError } = await supabase
      .from("posts")
      .select("id, author_id, thread_id, is_deleted")
      .eq("id", replyToPostId)
      .maybeSingle();

    const target = targetData as PostLookup | null;

    if (
      targetError ||
      !target ||
      target.is_deleted ||
      target.thread_id !== threadId
    ) {
      return failure("That reply target is not available.");
    }

    let authorUsername: string | null = null;

    if (target.author_id) {
      const { data: author } = await supabase
        .from("profiles")
        .select("username")
        .eq("id", target.author_id)
        .maybeSingle();

      authorUsername = author?.username ?? null;
    }

    replyTarget = {
      id: target.id,
      authorId: target.author_id,
      authorUsername,
    };
  }

  const contentResult = validateContent(input.content);

  if ("error" in contentResult) {
    return failure(contentResult.error);
  }

  const captchaError = await captchaProblem(user, input.captchaToken);

  if (captchaError) {
    return failure(captchaError);
  }

  const uploadIds = parseUploadIds(input.uploadIds);

  if (!uploadIds.ok) {
    return failure(uploadIds.error);
  }

  const { data: inserted, error } = await supabase
    .from("posts")
    .insert({
      thread_id: threadId,
      author_id: user.id,
      content: contentResult.content,
      reply_to_post_id: replyTarget?.id ?? null,
      is_opening: false,
    })
    .select("id, created_at")
    .single();

  if (error) {
    if (isRateLimitError(error)) {
      await recordRateLimit(user.id, "comment", error);
      return failure(rateLimitMessage(rateLimitRetrySeconds(error)));
    }

    console.error("create comment failed:", error.message);
    return failure("Could not post your comment. Try again.");
  }

  const insertedPostId = inserted.id as number;
  const attachmentsOk = await linkUploads(supabase, insertedPostId, uploadIds.ids);

  if (!attachmentsOk) {
    await recordSecurityEvent({
      event: "upload.attachment_failed",
      userId: user.id,
      metadata: { postId: insertedPostId, kind: "comment" },
    });
  }

  await createNotifications({
    supabase,
    actor: user,
    threadId,
    threadTitle: thread.title,
    postId: insertedPostId,
    content: contentResult.content,
    replyRecipientId: replyTarget ? replyTarget.authorId : null,
    fallbackThreadAuthorId: replyTarget ? null : thread.author_id,
  });

  revalidatePath("/");
  revalidatePath(`/t/${threadId}`);

  return {
    ok: true,
    comment: {
      id: insertedPostId,
      authorId: user.id,
      author: user.username,
      authorInitial: user.username.slice(0, 1).toLowerCase() || "?",
      body: contentResult.content,
      createdAt: inserted.created_at,
      replyToId: replyTarget?.id ?? null,
      replyToAuthor: replyTarget?.authorUsername ?? null,
    },
    attachmentsFailed: !attachmentsOk,
  };
}

export async function setPostReaction(input: {
  postId?: unknown;
  kind?: unknown;
}): Promise<BasicActionResult> {
  const postId = Number(input.postId);

  if (!Number.isSafeInteger(postId) || postId <= 0) {
    return failure("Post not found.");
  }

  const kind: ReactionKind | null | undefined =
    input.kind === null
      ? null
      : isReactionKind(input.kind)
        ? input.kind
        : undefined;

  if (kind === undefined) {
    return failure("Unknown reaction.");
  }

  const { supabase, user } = await getServerSession();

  if (!user) {
    return failure("Log in to react.");
  }

  const { data: postData, error: postError } = await supabase
    .from("posts")
    .select("id, author_id, thread_id, is_deleted")
    .eq("id", postId)
    .maybeSingle();

  const post = postData as PostLookup | null;

  if (postError || !post || post.is_deleted) {
    return failure("This post is not available.");
  }

  if (post.author_id === user.id) {
    return failure("You cannot react to your own content.");
  }

  if (kind === null) {
    const { error } = await supabase
      .from("reactions")
      .delete()
      .eq("post_id", postId)
      .eq("user_id", user.id);

    if (error) {
      console.error("reaction delete failed:", error.message);
      return failure("Could not update your reaction.");
    }

    return { ok: true };
  }

  const { error } = await supabase
    .from("reactions")
    .upsert(
      {
        post_id: postId,
        user_id: user.id,
        kind,
      },
      { onConflict: "post_id,user_id" },
    );

  if (error) {
    console.error("reaction upsert failed:", error.message);
    return failure("Could not update your reaction.");
  }

  return { ok: true };
}

export async function markNotificationRead(
  id: number,
): Promise<BasicActionResult> {
  if (!Number.isSafeInteger(id) || id <= 0) {
    return failure("Notification not found.");
  }

  const { supabase, user } = await getServerSession();

  if (!user) {
    return failure("Log in to manage notifications.");
  }

  const { error } = await supabase
    .from("notifications")
    .update({ read_at: new Date().toISOString() })
    .eq("id", id)
    .eq("user_id", user.id)
    .is("read_at", null);

  if (error) {
    console.error("notification read update failed:", error.message);
    return failure("Could not update that notification.");
  }

  return { ok: true };
}

export async function markAllNotificationsRead(): Promise<BasicActionResult> {
  const { supabase, user } = await getServerSession();

  if (!user) {
    return failure("Log in to manage notifications.");
  }

  const { error } = await supabase
    .from("notifications")
    .update({ read_at: new Date().toISOString() })
    .eq("user_id", user.id)
    .is("read_at", null);

  if (error) {
    console.error("notification mark-all update failed:", error.message);
    return failure("Could not update your notifications.");
  }

  return { ok: true };
}

export type LoadMoreCommentsResult =
  | {
      ok: true;
      comments: ThreadComment[];
      reactions: Record<
        number,
        { counts: ReactionCounts; mine: ReactionKind | null }
      >;
      attachments: Record<number, Attachment[]>;
      uploadStates: Record<string, UploadState>;
      nextCursor: string | null;
    }
  | { ok: false; error: string };

export async function loadMoreComments(input: {
  threadId?: unknown;
  cursor?: unknown;
}): Promise<LoadMoreCommentsResult> {
  const threadId = Number(input.threadId);

  if (!Number.isSafeInteger(threadId) || threadId <= 0) {
    return failure("Thread not found.");
  }

  let cursor: ReturnType<typeof decodeCommentCursor> = null;

  if (input.cursor !== null && input.cursor !== undefined) {
    if (typeof input.cursor !== "string") {
      return failure("Invalid comment cursor.");
    }

    cursor = decodeCommentCursor(input.cursor);

    if (!cursor) {
      return failure("Invalid comment cursor.");
    }
  }

  try {
    const supabase = await createClient();
    const { user } = await getServerSession();
    const isStaff = Boolean(
      user && !user.isBanned && (user.role === "moderator" || user.role === "admin"),
    );
    const page = await loadThreadCommentPage(supabase, threadId, cursor);
    const commentIds = page.comments.map((comment) => comment.id);
    const [reactions, attachmentLoad] = await Promise.all([
      loadPostReactionSummaries(supabase, commentIds),
      loadAttachments(supabase, commentIds, isStaff),
    ]);

    return {
      ok: true,
      comments: page.comments,
      reactions,
      attachments: Object.fromEntries(attachmentLoad.byPost),
      uploadStates: attachmentLoad.uploadStates,
      nextCursor: page.nextCursor,
    };
  } catch {
    return failure("Could not load more comments.");
  }
}
