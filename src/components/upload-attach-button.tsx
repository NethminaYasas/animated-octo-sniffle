"use client";

import { Loader2, Paperclip, X } from "lucide-react";
import { useRef, useState } from "react";
import { toast } from "sonner";

export type PendingAttachment = {
  id: string;
  url: string;
  mimeType: string;
  sizeBytes: number;
  fileName: string;
};

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const MAX_ATTACHMENTS = 8;
const ACCEPT =
  "image/jpeg,image/png,image/webp,image/gif,audio/mpeg,audio/ogg,video/mp4,video/webm";

/**
 * Uploads files through the same-origin `/api/uploads` route. The server
 * enforces the type, size and quota limits; the browser never talks to the
 * storage provider.
 */
export function UploadAttachButton({
  attachments,
  onChange,
  disabled,
}: {
  attachments: PendingAttachment[];
  onChange: (next: PendingAttachment[]) => void;
  disabled?: boolean;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(0);

  const full = attachments.length >= MAX_ATTACHMENTS;

  const handleFiles = async (files: FileList | null) => {
    if (!files) {
      return;
    }

    if (attachments.length >= MAX_ATTACHMENTS) {
      toast.error("A post can have at most 8 attachments.");
      return;
    }

    setUploading((count) => count + 1);

    try {
      const current = [...attachments];

      for (const file of Array.from(files).slice(0, MAX_ATTACHMENTS - current.length)) {
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
            toast.error("Couldn't upload the file", {
              description: body?.error ?? "Try again in a few moments.",
            });
            continue;
          }

          if (!UUID_PATTERN.test(body.upload.id)) {
            continue;
          }

          current.push({
            id: body.upload.id,
            url: body.upload.url,
            mimeType: body.upload.mimeType,
            sizeBytes: body.upload.sizeBytes,
            fileName: file.name,
          });
          onChange([...current]);
        } catch {
          toast.error("Couldn't upload the file", {
            description: "Check your connection and try again.",
          });
        }
      }
    } finally {
      setUploading((count) => Math.max(0, count - 1));

      if (inputRef.current) {
        inputRef.current.value = "";
      }
    }
  };

  return (
    <div className="flex flex-wrap items-center gap-2">
      <input
        ref={inputRef}
        type="file"
        accept={ACCEPT}
        multiple
        hidden
        aria-hidden="true"
        tabIndex={-1}
        onChange={(event) => {
          void handleFiles(event.target.files);
        }}
      />

      <button
        type="button"
        disabled={disabled || full || uploading > 0}
        onClick={() => inputRef.current?.click()}
        title={full ? "A post can have at most 8 attachments" : "Attach a file"}
        aria-label="Attach a file"
        className="grid size-8 place-items-center rounded-full text-muted transition-colors hover:bg-surface-muted hover:text-ink disabled:cursor-not-allowed disabled:opacity-50"
      >
        {uploading > 0 ? (
          <Loader2 className="size-4 animate-spin" />
        ) : (
          <Paperclip className="size-4" />
        )}
      </button>

      {attachments.map((attachment) => (
        <span
          key={attachment.id}
          className="flex max-w-48 items-center gap-1.5 rounded-full border border-line bg-surface-muted px-2 py-1 text-[11px] font-medium text-body"
        >
          <span className="truncate">{attachment.fileName}</span>
          <button
            type="button"
            aria-label={`Remove ${attachment.fileName}`}
            onClick={() =>
              onChange(attachments.filter((candidate) => candidate.id !== attachment.id))
            }
            className="shrink-0 rounded-full text-muted transition-colors hover:text-ink"
          >
            <X className="size-3" />
          </button>
        </span>
      ))}
    </div>
  );
}
