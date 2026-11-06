"use server";

import { recordSecurityEvent } from "@/lib/audit/security-events";
import { getServerSession } from "@/lib/auth/server-user";
import {
  isRateLimitError,
  rateLimitMessage,
  rateLimitRetrySeconds,
} from "@/lib/supabase-errors";

export type CreateReportResult =
  | { ok: true }
  | { ok: false; error: string };

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export async function createReport(input: {
  targetType?: unknown;
  postId?: unknown;
  targetUserId?: unknown;
  uploadId?: unknown;
  reason?: unknown;
}): Promise<CreateReportResult> {
  const targetType = input.targetType;
  const reason =
    typeof input.reason === "string" ? input.reason.trim() : "";

  if (targetType !== "post" && targetType !== "user" && targetType !== "upload") {
    return { ok: false, error: "Choose something to report." };
  }

  if (reason.length < 1) {
    return { ok: false, error: "Give a reason for the report." };
  }

  if (reason.length > 1000) {
    return { ok: false, error: "Keep the report reason to 1000 characters." };
  }

  const { supabase, user } = await getServerSession();

  if (!user) {
    return { ok: false, error: "Log in to report content." };
  }

  if (user.isBanned) {
    return { ok: false, error: "Banned members cannot submit reports." };
  }

  let postId: number | null = null;
  let targetUserId: string | null = null;
  let targetUploadId: string | null = null;

  if (targetType === "post") {
    postId = Number(input.postId);

    if (!Number.isSafeInteger(postId) || postId <= 0) {
      return { ok: false, error: "That post is not available." };
    }
  } else if (targetType === "user") {
    if (
      typeof input.targetUserId !== "string" ||
      !UUID_PATTERN.test(input.targetUserId)
    ) {
      return { ok: false, error: "That member is not available." };
    }

    targetUserId = input.targetUserId;
  } else {
    if (
      typeof input.uploadId !== "string" ||
      !UUID_PATTERN.test(input.uploadId)
    ) {
      return { ok: false, error: "That attachment is not available." };
    }

    targetUploadId = input.uploadId;
  }

  const { error } = await supabase.from("reports").insert({
    reporter_id: user.id,
    target_type: targetType,
    post_id: postId,
    target_user_id: targetUserId,
    target_upload_id: targetUploadId,
    reason,
    status: "open",
  });

  if (error) {
    if (isRateLimitError(error)) {
      await recordSecurityEvent({
        event: "forum.rate_limited",
        userId: user.id,
        metadata: {
          action: "report",
          retry_after_seconds: rateLimitRetrySeconds(error),
        },
      });

      return {
        ok: false,
        error: rateLimitMessage(rateLimitRetrySeconds(error)),
      };
    }

    if (error.code === "23505") {
      return {
        ok: false,
        error: "You already have an open report for that target.",
      };
    }

    if (error.code === "23514" || error.code === "42501") {
      return { ok: false, error: "That target cannot be reported." };
    }

    console.error("report insert failed:", error.message);
    return { ok: false, error: "Could not submit the report. Try again." };
  }

  return { ok: true };
}
