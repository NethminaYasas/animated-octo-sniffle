export type PendingAttachment = {
  id: string;
  url: string;
  mimeType: string;
  sizeBytes: number;
  fileName: string;
};

export const MAX_ATTACHMENTS = 8;
export const UPLOAD_ACCEPT =
  "image/jpeg,image/png,image/webp,image/gif,audio/mpeg,audio/ogg,video/mp4,video/webm";

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export type UploadResult = {
  attachments: PendingAttachment[];
  errors: { fileName: string; error: string }[];
};

/**
 * Uploads files through the same-origin `/api/uploads` route. The server
 * enforces the type, size and quota limits; the browser never talks to the
 * storage provider.
 *
 * `fileNameFor` lets callers keep the original client filename for drag-drop
 * and paste (which may have generated names). Returns successes and per-file
 * errors so UIs can toast without duplicating the fetch logic.
 */
export async function uploadFilesToServer(
  files: File[],
  options?: { max?: number },
): Promise<UploadResult> {
  const max = options?.max ?? MAX_ATTACHMENTS;
  const attachments: PendingAttachment[] = [];
  const errors: { fileName: string; error: string }[] = [];

  for (const file of files.slice(0, max)) {
    const formData = new FormData();
    formData.append("file", file, file.name);

    try {
      const response = await fetch("/api/uploads", {
        method: "POST",
        body: formData,
      });
      const body = (await response.json().catch(() => null)) as
        | {
            ok?: boolean;
            error?: string;
            upload?: {
              id: string;
              url: string;
              mimeType: string;
              sizeBytes: number;
            };
          }
        | null;

      if (!response.ok || !body?.ok || !body.upload) {
        errors.push({
          fileName: file.name,
          error: body?.error ?? "Try again in a few moments.",
        });
        continue;
      }

      if (!UUID_PATTERN.test(body.upload.id)) {
        errors.push({ fileName: file.name, error: "Invalid upload response." });
        continue;
      }

      attachments.push({
        id: body.upload.id,
        url: body.upload.url,
        mimeType: body.upload.mimeType,
        sizeBytes: body.upload.sizeBytes,
        fileName: file.name,
      });
    } catch {
      errors.push({
        fileName: file.name,
        error: "Check your connection and try again.",
      });
    }
  }

  return { attachments, errors };
}

export function isImageFile(file: File): boolean {
  return file.type.startsWith("image/");
}
