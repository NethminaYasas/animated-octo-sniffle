import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import type { Attachment, UploadState } from "@/lib/attachments";
import type { Database } from "@/lib/supabase/types";

type Client = SupabaseClient<Database>;

type LinkRow = {
  post_id: number;
  upload_id: string;
};

/**
 * Loads the uploads attached to the given posts. Members see the safe columns
 * plus nothing else; staff additionally get the removal reason and acting
 * moderator. Removed uploads are included so the UI can show the placeholder.
 */
export async function loadAttachments(
  supabase: Client,
  postIds: number[],
  isStaff: boolean,
): Promise<{
  byPost: Map<number, Attachment[]>;
  uploadStates: Record<string, UploadState>;
}> {
  const ids = [...new Set(postIds.filter((id) => Number.isSafeInteger(id) && id > 0))];
  const empty = { byPost: new Map<number, Attachment[]>(), uploadStates: {} };

  if (ids.length === 0) {
    return empty;
  }

  const { data: links, error: linkError } = await supabase
    .from("post_uploads")
    .select("post_id, upload_id")
    .in("post_id", ids);

  if (linkError || !links || links.length === 0) {
    if (linkError) {
      console.error("post_uploads lookup failed:", linkError.message);
    }

    return empty;
  }

  const linkRows = links as unknown as LinkRow[];
  const uploadIds = [...new Set(linkRows.map((row) => row.upload_id))];

  const { data: safeRows, error: safeError } = await supabase
    .from("public_uploads")
    .select("id, url, mime_type, size_bytes, status")
    .in("id", uploadIds);

  if (safeError) {
    console.error("public_uploads lookup failed:", safeError.message);
    return empty;
  }

  const safeById = new Map(
    ((safeRows ?? []) as unknown as Array<{
      id: string;
      url: string | null;
      mime_type: string;
      size_bytes: number;
      status: string;
    }>).map((row) => [row.id, row]),
  );

  let staffById = new Map<
    string,
    { removal_reason: string | null; removed_by_username: string | null }
  >();

  if (isStaff) {
    const { data: staffRows, error: staffError } = (await supabase.rpc(
      "staff_uploads",
    )) as {
      data: Array<{
        id: string;
        status: string;
        removal_reason: string | null;
        removed_by_username: string | null;
      }> | null;
      error: unknown;
    };

    if (staffError) {
      console.error(
        "staff_uploads lookup failed:",
        (staffError as { message?: string }).message,
      );
    } else {
      const wanted = new Set(uploadIds);
      staffById = new Map(
        (
          (staffRows ?? []) as unknown as Array<{
            id: string;
            status: string;
            removal_reason: string | null;
            removed_by_username: string | null;
          }>
        )
          .filter((row) => wanted.has(row.id) && row.status === "removed")
          .map((row) => [
            row.id,
            {
              removal_reason: row.removal_reason,
              removed_by_username: row.removed_by_username,
            },
          ]),
      );
    }
  }

  const byPost = new Map<number, Attachment[]>();
  const uploadStates: Record<string, UploadState> = {};

  for (const link of linkRows) {
    const safe = safeById.get(link.upload_id);

    if (!safe) {
      // Row exists in post_uploads but the upload is invisible (should not
      // happen; safe views cover all rows). Skip it rather than render an
      // unverified URL.
      continue;
    }

    const status = safe.status === "removed" ? "removed" : "active";

    if (safe.url) {
      uploadStates[safe.url] = status;
    }

    const staff = staffById.get(link.upload_id);
    const attachment: Attachment = {
      id: safe.id,
      postId: link.post_id,
      url: safe.url ?? null,
      mimeType: safe.mime_type,
      sizeBytes: Number(safe.size_bytes),
      status,
      removalReason: isStaff ? staff?.removal_reason ?? null : null,
      removedByUsername: isStaff ? staff?.removed_by_username ?? null : null,
    };

    const existing = byPost.get(link.post_id) ?? [];
    existing.push(attachment);
    byPost.set(link.post_id, existing);
  }

  return { byPost, uploadStates };
}
