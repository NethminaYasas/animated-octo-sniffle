"use server";

import { revalidatePath } from "next/cache";

import { recordSecurityEvent } from "@/lib/audit/security-events";
import { getServerSession } from "@/lib/auth/server-user";
import { getUploadProvider } from "@/lib/media/provider";
import { moderationErrorMessage } from "@/lib/supabase-errors";

export type ModerationResult =
  | { ok: true; changed: boolean; modLogId: number | null }
  | { ok: false; error: string };

export type WarningResult =
  | {
      ok: true;
      changed: boolean;
      modLogId: number | null;
      warningId: number | null;
    }
  | { ok: false; error: string };

export type InviteCodeResult = {
  code: string;
  codeHash: string;
  codeHint: string;
  batchId: string;
};

export type CreateInviteCodesResult =
  | { ok: true; codes: InviteCodeResult[] }
  | { ok: false; error: string };

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const HASH_PATTERN = /^[a-f0-9]{64}$/;

function reasonProblem(reason: unknown, max = 1000): string | null {
  if (typeof reason !== "string" || reason.trim().length < 1) {
    return "A reason is required.";
  }

  if (reason.trim().length > max) {
    return `Keep the reason to ${max} characters or fewer.`;
  }

  return null;
}

function positiveId(value: unknown): number | null {
  const id = Number(value);
  return Number.isSafeInteger(id) && id > 0 ? id : null;
}

function revalidateContent(threadId?: number | null) {
  revalidatePath("/");
  revalidatePath("/moderation/log");

  if (threadId) {
    revalidatePath(`/t/${threadId}`);
  }
}

async function rpcResult(
  name:
    | "moderate_set_post_deleted"
    | "moderate_set_thread_deleted"
    | "moderate_set_thread_locked"
    | "moderate_set_thread_pinned"
    | "moderate_move_thread"
    | "moderate_ban_user"
    | "moderate_unban_user"
    | "admin_set_role"
    | "admin_revoke_invite_code"
    | "moderate_block_upload_hash"
    | "moderate_unblock_upload_hash",
  args: Record<string, unknown>,
): Promise<ModerationResult> {
  const { supabase } = await getServerSession();
  const { data, error } = await supabase.rpc(name, args as never);

  if (error) {
    return { ok: false, error: moderationErrorMessage(error) };
  }

  const row = (Array.isArray(data) ? data[0] : null) as
    | { changed?: boolean; mod_log_id?: number | null }
    | null;

  return {
    ok: true,
    changed: Boolean(row?.changed),
    modLogId: row?.mod_log_id ?? null,
  };
}

export async function setPostDeleted(input: {
  postId?: unknown;
  threadId?: unknown;
  deleted?: unknown;
  reason?: unknown;
}): Promise<ModerationResult> {
  const postId = positiveId(input.postId);
  const reason = reasonProblem(input.reason);

  if (!postId) {
    return { ok: false, error: "Post not found." };
  }

  if (reason) {
    return { ok: false, error: reason };
  }

  const result = await rpcResult("moderate_set_post_deleted", {
    p_post_id: postId,
    p_deleted: Boolean(input.deleted),
    p_reason: String(input.reason).trim(),
  });

  if (result.ok) {
    revalidateContent(positiveId(input.threadId) ?? undefined);
  }

  return result;
}

export async function setThreadDeleted(input: {
  threadId?: unknown;
  deleted?: unknown;
  reason?: unknown;
}): Promise<ModerationResult> {
  const threadId = positiveId(input.threadId);
  const reason = reasonProblem(input.reason);

  if (!threadId) {
    return { ok: false, error: "Thread not found." };
  }

  if (reason) {
    return { ok: false, error: reason };
  }

  const result = await rpcResult("moderate_set_thread_deleted", {
    p_thread_id: threadId,
    p_deleted: Boolean(input.deleted),
    p_reason: String(input.reason).trim(),
  });

  if (result.ok) {
    revalidateContent(threadId);
  }

  return result;
}

export async function setThreadLocked(input: {
  threadId?: unknown;
  locked?: unknown;
  reason?: unknown;
}): Promise<ModerationResult> {
  const threadId = positiveId(input.threadId);
  const reason = reasonProblem(input.reason);

  if (!threadId) {
    return { ok: false, error: "Thread not found." };
  }

  if (reason) {
    return { ok: false, error: reason };
  }

  const result = await rpcResult("moderate_set_thread_locked", {
    p_thread_id: threadId,
    p_locked: Boolean(input.locked),
    p_reason: String(input.reason).trim(),
  });

  if (result.ok) {
    revalidateContent(threadId);
  }

  return result;
}

export async function setThreadPinned(input: {
  threadId?: unknown;
  pinned?: unknown;
  reason?: unknown;
}): Promise<ModerationResult> {
  const threadId = positiveId(input.threadId);
  const reason = reasonProblem(input.reason);

  if (!threadId) {
    return { ok: false, error: "Thread not found." };
  }

  if (reason) {
    return { ok: false, error: reason };
  }

  const result = await rpcResult("moderate_set_thread_pinned", {
    p_thread_id: threadId,
    p_pinned: Boolean(input.pinned),
    p_reason: String(input.reason).trim(),
  });

  if (result.ok) {
    revalidateContent(threadId);
  }

  return result;
}

export async function moveThread(input: {
  threadId?: unknown;
  boardId?: unknown;
  reason?: unknown;
}): Promise<ModerationResult> {
  const threadId = positiveId(input.threadId);
  const boardId =
    typeof input.boardId === "string" ? input.boardId.trim() : "";
  const reason = reasonProblem(input.reason);

  if (!threadId) {
    return { ok: false, error: "Thread not found." };
  }

  if (!/^[a-z0-9]+(-[a-z0-9]+)*$/.test(boardId)) {
    return { ok: false, error: "Choose a board." };
  }

  if (reason) {
    return { ok: false, error: reason };
  }

  const result = await rpcResult("moderate_move_thread", {
    p_thread_id: threadId,
    p_board_id: boardId,
    p_reason: String(input.reason).trim(),
  });

  if (result.ok) {
    revalidateContent(threadId);
  }

  return result;
}

export async function banUser(input: {
  targetId?: unknown;
  reason?: unknown;
  until?: unknown;
}): Promise<ModerationResult> {
  if (typeof input.targetId !== "string" || !UUID_PATTERN.test(input.targetId)) {
    return { ok: false, error: "Member not found." };
  }

  const reason = reasonProblem(input.reason);

  if (reason) {
    return { ok: false, error: reason };
  }

  let until: string | null = null;

  if (input.until !== null && input.until !== undefined && input.until !== "") {
    if (typeof input.until !== "string") {
      return { ok: false, error: "Choose a valid ban expiry." };
    }

    const date = new Date(input.until);

    if (Number.isNaN(date.getTime())) {
      return { ok: false, error: "Choose a valid ban expiry." };
    }

    until = date.toISOString();
  }

  const result = await rpcResult("moderate_ban_user", {
    p_target_id: input.targetId,
    p_reason: String(input.reason).trim(),
    p_until: until,
  });

  if (result.ok) {
    revalidatePath("/moderation/members");
    revalidatePath("/moderation/log");
  }

  return result;
}

export async function unbanUser(input: {
  targetId?: unknown;
  reason?: unknown;
}): Promise<ModerationResult> {
  if (typeof input.targetId !== "string" || !UUID_PATTERN.test(input.targetId)) {
    return { ok: false, error: "Member not found." };
  }

  const reason = reasonProblem(input.reason);

  if (reason) {
    return { ok: false, error: reason };
  }

  const result = await rpcResult("moderate_unban_user", {
    p_target_id: input.targetId,
    p_reason: String(input.reason).trim(),
  });

  if (result.ok) {
    revalidatePath("/moderation/members");
    revalidatePath("/moderation/log");
  }

  return result;
}

export async function warnUser(input: {
  targetId?: unknown;
  reason?: unknown;
}): Promise<WarningResult> {
  if (typeof input.targetId !== "string" || !UUID_PATTERN.test(input.targetId)) {
    return { ok: false, error: "Member not found." };
  }

  const reason = reasonProblem(input.reason);

  if (reason) {
    return { ok: false, error: reason };
  }

  const { supabase } = await getServerSession();
  const { data, error } = await supabase.rpc("moderate_warn_user", {
    p_target_id: input.targetId,
    p_reason: String(input.reason).trim(),
  });

  if (error) {
    return { ok: false, error: moderationErrorMessage(error) };
  }

  const row = (Array.isArray(data) ? data[0] : null) as
    | {
        changed?: boolean;
        mod_log_id?: number | null;
        warning_id?: number | null;
      }
    | null;

  revalidatePath("/moderation/members");
  revalidatePath("/moderation/log");

  return {
    ok: true,
    changed: Boolean(row?.changed),
    modLogId: row?.mod_log_id ?? null,
    warningId: row?.warning_id ?? null,
  };
}

export async function setMemberRole(input: {
  targetId?: unknown;
  role?: unknown;
  reason?: unknown;
}): Promise<ModerationResult> {
  if (typeof input.targetId !== "string" || !UUID_PATTERN.test(input.targetId)) {
    return { ok: false, error: "Member not found." };
  }

  if (
    input.role !== "member" &&
    input.role !== "moderator" &&
    input.role !== "admin"
  ) {
    return { ok: false, error: "Choose a valid role." };
  }

  const reason = reasonProblem(input.reason);

  if (reason) {
    return { ok: false, error: reason };
  }

  const result = await rpcResult("admin_set_role", {
    p_target_id: input.targetId,
    p_role: input.role,
    p_reason: String(input.reason).trim(),
  });

  if (result.ok) {
    revalidatePath("/moderation/members");
    revalidatePath("/moderation/log");
  }

  return result;
}

export async function resolveReport(input: {
  reportId?: unknown;
  status?: unknown;
  note?: unknown;
}): Promise<ModerationResult> {
  const reportId = positiveId(input.reportId);

  if (!reportId) {
    return { ok: false, error: "Report not found." };
  }

  if (input.status !== "resolved" && input.status !== "dismissed") {
    return { ok: false, error: "Choose resolve or dismiss." };
  }

  const noteProblem = reasonProblem(input.note, 2000);

  if (noteProblem) {
    return { ok: false, error: noteProblem };
  }

  const { supabase } = await getServerSession();
  const { data, error } = await supabase.rpc("staff_resolve_report", {
    p_report_id: reportId,
    p_status: input.status,
    p_note: String(input.note).trim(),
  });

  if (error) {
    return { ok: false, error: moderationErrorMessage(error) };
  }

  const row = (Array.isArray(data) ? data[0] : null) as
    | { changed?: boolean; mod_log_id?: number | null }
    | null;

  revalidatePath("/moderation/reports");
  revalidatePath("/moderation/log");

  return {
    ok: true,
    changed: Boolean(row?.changed),
    modLogId: row?.mod_log_id ?? null,
  };
}

export async function createInviteCodes(input: {
  count?: unknown;
  reason?: unknown;
  requestId?: unknown;
}): Promise<CreateInviteCodesResult> {
  const count = Number(input.count);

  if (!Number.isSafeInteger(count) || count < 1 || count > 50) {
    return { ok: false, error: "Create between 1 and 50 codes at a time." };
  }

  const reason = reasonProblem(input.reason);

  if (reason) {
    return { ok: false, error: reason };
  }

  const requestId =
    typeof input.requestId === "string" && UUID_PATTERN.test(input.requestId)
      ? input.requestId
      : null;

  const { supabase } = await getServerSession();
  const { data, error } = await supabase.rpc("admin_create_invite_codes", {
    p_count: count,
    p_reason: String(input.reason).trim(),
    p_request_id: requestId ?? undefined,
  });

  if (error) {
    return { ok: false, error: moderationErrorMessage(error) };
  }

  revalidatePath("/moderation/invites");
  revalidatePath("/moderation/log");

  const codes = ((data ?? []) as Array<{
    code: string;
    code_hash: string;
    code_hint: string;
    batch_id: string;
  }>).map((row) => ({
    code: row.code,
    codeHash: row.code_hash,
    codeHint: row.code_hint,
    batchId: row.batch_id,
  }));

  return { ok: true, codes };
}

export async function revokeInviteCode(input: {
  codeHash?: unknown;
  reason?: unknown;
}): Promise<ModerationResult> {
  if (typeof input.codeHash !== "string" || !HASH_PATTERN.test(input.codeHash)) {
    return { ok: false, error: "Invalid invite code." };
  }

  const reason = reasonProblem(input.reason);

  if (reason) {
    return { ok: false, error: reason };
  }

  const result = await rpcResult("admin_revoke_invite_code", {
    p_code_hash: input.codeHash,
    p_reason: String(input.reason).trim(),
  });

  if (result.ok) {
    revalidatePath("/moderation/invites");
    revalidatePath("/moderation/log");
  }

  return result;
}

export async function setUploadRemoved(input: {
  uploadId?: unknown;
  removed?: unknown;
  reason?: unknown;
}): Promise<ModerationResult> {
  if (typeof input.uploadId !== "string" || !UUID_PATTERN.test(input.uploadId)) {
    return { ok: false, error: "Upload not found." };
  }

  const reason = reasonProblem(input.reason);

  if (reason) {
    return { ok: false, error: reason };
  }

  const remove = input.removed !== false;
  const { supabase } = await getServerSession();

  if (!remove) {
    const { data, error } = await supabase.rpc("moderate_restore_upload", {
      p_upload_id: input.uploadId,
      p_reason: String(input.reason).trim(),
    });

    if (error) {
      return { ok: false, error: moderationErrorMessage(error) };
    }

    const row = (Array.isArray(data) ? data[0] : null) as
      | { changed?: boolean; mod_log_id?: number | null }
      | null;

    revalidatePath("/moderation/uploads");
    revalidatePath("/moderation/log");

    return {
      ok: true,
      changed: Boolean(row?.changed),
      modLogId: row?.mod_log_id ?? null,
    };
  }

  const { data, error } = await supabase.rpc("moderate_remove_upload", {
    p_upload_id: input.uploadId,
    p_reason: String(input.reason).trim(),
  });

  if (error) {
    return { ok: false, error: moderationErrorMessage(error) };
  }

  const row = (Array.isArray(data) ? data[0] : null) as
    | {
        changed?: boolean;
        mod_log_id?: number | null;
        provider_file_id?: string | null;
      }
    | null;

  // Best effort: hide is already enforced by the database status. Deleting at
  // the provider is impossible without a CATBOX_USERHASH and can fail for
  // deduplicated files; never block or roll back the action on that account.
  if (row?.changed && row.provider_file_id) {
    try {
      const provider = getUploadProvider();
      await provider.delete(row.provider_file_id);
    } catch {
      await recordSecurityEvent({
        event: "upload.provider_delete_failed",
        metadata: { providerFileId: row.provider_file_id },
      });
    }
  }

  revalidatePath("/moderation/uploads");
  revalidatePath("/moderation/log");

  return {
    ok: true,
    changed: Boolean(row?.changed),
    modLogId: row?.mod_log_id ?? null,
  };
}

export async function blockUploadHash(input: {
  sha256?: unknown;
  reason?: unknown;
}): Promise<ModerationResult> {
  if (typeof input.sha256 !== "string" || !HASH_PATTERN.test(input.sha256)) {
    return { ok: false, error: "Enter a SHA-256 hash." };
  }

  const reason = reasonProblem(input.reason);

  if (reason) {
    return { ok: false, error: reason };
  }

  const result = await rpcResult("moderate_block_upload_hash", {
    p_sha256: input.sha256,
    p_reason: String(input.reason).trim(),
  });

  if (result.ok) {
    revalidatePath("/moderation/uploads");
    revalidatePath("/moderation/log");
  }

  return result;
}

export async function unblockUploadHash(input: {
  sha256?: unknown;
  reason?: unknown;
}): Promise<ModerationResult> {
  if (typeof input.sha256 !== "string" || !HASH_PATTERN.test(input.sha256)) {
    return { ok: false, error: "Enter a SHA-256 hash." };
  }

  const reason = reasonProblem(input.reason);

  if (reason) {
    return { ok: false, error: reason };
  }

  const result = await rpcResult("moderate_unblock_upload_hash", {
    p_sha256: input.sha256,
    p_reason: String(input.reason).trim(),
  });

  if (result.ok) {
    revalidatePath("/moderation/uploads");
    revalidatePath("/moderation/log");
  }

  return result;
}

export async function acknowledgeWarning(
  warningId: unknown,
): Promise<{ ok: true; changed: boolean } | { ok: false; error: string }> {
  const id = positiveId(warningId);

  if (!id) {
    return { ok: false, error: "Warning not found." };
  }

  const { supabase, user } = await getServerSession();

  if (!user) {
    return { ok: false, error: "Log in to view your warnings." };
  }

  const { data, error } = await supabase.rpc("acknowledge_warning", {
    p_warning_id: id,
  });

  if (error) {
    return { ok: false, error: "Could not acknowledge that warning." };
  }

  revalidatePath("/profile");

  return { ok: true, changed: Boolean(data) };
}
