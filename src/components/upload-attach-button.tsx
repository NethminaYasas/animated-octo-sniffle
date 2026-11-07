"use client";

import { Loader2, Paperclip, X } from "lucide-react";
import { useRef, useState } from "react";
import { toast } from "sonner";

import {
  MAX_ATTACHMENTS,
  UPLOAD_ACCEPT,
  uploadFilesToServer,
  type PendingAttachment,
} from "@/lib/upload-client";

export type { PendingAttachment };

/**
 * Uploads files through the same-origin `/api/uploads` route. The server
 * enforces the type, size and quota limits; the browser never talks to the
 * storage provider.
 */
export function UploadAttachButton({
  attachments,
  onChange,
  disabled,
  inlineUrls,
}: {
  attachments: PendingAttachment[];
  onChange: (next: PendingAttachment[]) => void;
  disabled?: boolean;
  /** URLs already inserted inline in the editor. They hang off the body and
   * need no chip — delete the image itself to remove them. */
  inlineUrls?: ReadonlySet<string>;
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
      const remaining = MAX_ATTACHMENTS - attachments.length;
      const { attachments: uploaded, errors } = await uploadFilesToServer(
        Array.from(files),
        { max: remaining },
      );

      for (const error of errors) {
        toast.error("Couldn't upload the file", {
          description: error.error,
        });
      }

      if (uploaded.length > 0) {
        onChange([...attachments, ...uploaded]);
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
        accept={UPLOAD_ACCEPT}
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

      {attachments
        .filter((attachment) => !inlineUrls?.has(attachment.url))
        .map((attachment) => (
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
