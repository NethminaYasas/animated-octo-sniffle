export type AttachmentStatus = "active" | "removed";

export type Attachment = {
  id: string;
  postId: number;
  /** Null for a removed upload viewed by a member (staff keep the URL). */
  url: string | null;
  mimeType: string;
  sizeBytes: number;
  status: AttachmentStatus;
  /** Staff only. Null for members and anonymous viewers. */
  removalReason: string | null;
  /** Staff only. Null for members and anonymous viewers. */
  removedByUsername: string | null;
};

/** Status of an upload URL, used to gate inline markdown media. */
export type UploadState = AttachmentStatus;

/**
 * Upload URLs already shown inline in a post/comment body. Members see the
 * inline placement only; the gallery would otherwise render the same image a
 * second time below the post.
 */
export function extractInlineUploadUrls(html: string): Set<string> {
  const urls = new Set<string>();
  const pattern = /<img[^>]+src="([^"]+)"/gi;
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(html)) !== null) {
    urls.add(match[1]);
  }
  return urls;
}

export function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) {
    return "0 B";
  }

  const units = ["B", "KB", "MB", "GB"];
  let value = bytes;
  let unit = 0;

  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024;
    unit += 1;
  }

  return `${value >= 10 || unit === 0 ? Math.round(value) : value.toFixed(1)} ${units[unit]}`;
}
