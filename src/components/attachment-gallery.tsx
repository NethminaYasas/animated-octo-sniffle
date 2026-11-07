"use client";

import { Shield, Undo2, X } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";

import { formatBytes, type Attachment } from "@/lib/attachments";
import { setUploadRemoved } from "@/lib/moderation/actions";
import { ReportButton } from "@/components/report-button";

function MediaPreview({ attachment }: { attachment: Attachment }) {
  const mime = attachment.mimeType;
  const url = attachment.url;

  if (!url) {
    return null;
  }

  if (mime.startsWith("image/")) {
    // Attachments are user content from a known upload host; the parent page
    // renders no other remote images.
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={url}
        alt="Forum attachment"
        loading="lazy"
        className="max-h-96 w-auto max-w-full rounded-lg border border-line object-contain"
      />
    );
  }

  if (mime.startsWith("video/")) {
    return (
      <video
        src={url}
        controls
        preload="metadata"
        className="max-h-96 w-full max-w-2xl rounded-lg border border-line bg-black"
      />
    );
  }

  return (
    <audio
      src={url}
      controls
      preload="metadata"
      className="w-full max-w-xl"
    />
  );
}

function StaffActionDialog({
  title,
  confirmLabel,
  onClose,
  onSubmit,
}: {
  title: string;
  confirmLabel: string;
  onClose: () => void;
  onSubmit: (reason: string) => Promise<void>;
}) {
  const [reason, setReason] = useState("");
  const [pending, setPending] = useState(false);

  return (
    <div
      className="fixed inset-0 z-50 grid place-items-center bg-black/40 p-4"
      role="presentation"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) {
          onClose();
        }
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className="w-full max-w-md rounded-xl border border-line bg-surface p-4 shadow-xl"
      >
        <div className="flex items-start justify-between gap-3">
          <h2 className="text-sm font-semibold text-ink">{title}</h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="grid size-7 shrink-0 place-items-center rounded-full text-muted hover:bg-surface-muted hover:text-ink"
          >
            <X className="size-4" />
          </button>
        </div>

        <label className="mt-3 block text-xs font-medium text-muted">
          Reason
          <textarea
            autoFocus
            value={reason}
            onChange={(event) => setReason(event.target.value)}
            rows={3}
            maxLength={1000}
            className="mt-1 w-full rounded-lg border border-line bg-surface px-3 py-2 text-sm text-ink focus:outline-none focus:ring-2 focus:ring-orange-700"
            placeholder="Why is this action needed?"
          />
        </label>

        <div className="mt-4 flex justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            className="rounded-full border border-line px-3 py-2 text-xs font-semibold text-muted hover:bg-surface-muted hover:text-ink"
          >
            Cancel
          </button>
          <button
            type="button"
            disabled={pending || reason.trim().length === 0}
            onClick={() => {
              setPending(true);
              void onSubmit(reason.trim()).finally(() => {
                setPending(false);
              });
            }}
            className="rounded-full bg-red-700 px-4 py-2 text-xs font-semibold text-white hover:bg-red-800 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {pending ? "Saving…" : confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}

export function AttachmentGallery({
  attachments,
  isStaff,
  currentUserId,
  onStatusChange,
  inlineUrls,
}: {
  attachments: Attachment[];
  isStaff: boolean;
  currentUserId: string | null;
  onStatusChange?: (id: string, status: "active" | "removed") => void;
  /** URLs already rendered inline in the post body. Hidden for members. */
  inlineUrls?: ReadonlySet<string>;
}) {
  const router = useRouter();
  const [dialog, setDialog] = useState<
    | { mode: "remove" | "restore"; attachment: Attachment }
    | null
  >(null);

  // Images dropped into the editor appear inline where the author placed
  // them; showing them again below would be a duplicate for members. Staff
  // keep them so per-attachment report and remove/restore stay reachable
  // (comment Moderate menus have no attachments).
  const visible = attachments.filter(
    (attachment) =>
      isStaff || !attachment.url || !inlineUrls?.has(attachment.url),
  );

  if (visible.length === 0) {
    return null;
  }

  const submit = async (reason: string) => {
    if (!dialog) {
      return;
    }

    const result = await setUploadRemoved({
      uploadId: dialog.attachment.id,
      removed: dialog.mode === "remove",
      reason,
    });

    if (!result.ok) {
      toast.error("Could not update the attachment", {
        description: result.error,
      });
      return;
    }

    toast.success(
      dialog.mode === "remove"
        ? "Attachment removed"
        : "Attachment restored",
    );
    onStatusChange?.(
      dialog.attachment.id,
      dialog.mode === "remove" ? "removed" : "active",
    );
    setDialog(null);
    router.refresh();
  };

  return (
    <>
      <div className="mt-3 flex flex-wrap gap-3">
        {visible.map((attachment) => {
          if (attachment.status === "removed") {
            return (
              <div
                key={attachment.id}
                className="max-w-full rounded-lg border border-dashed border-line bg-surface-muted px-3 py-2 text-[11px] text-muted"
              >
                <p className="font-semibold text-body">
                  This attachment was removed by a moderator.
                </p>
                {isStaff ? (
                  <p className="mt-1 leading-4">
                    {attachment.removalReason ?? "No reason recorded."}
                    {attachment.removedByUsername
                      ? ` · removed by @${attachment.removedByUsername}`
                      : ""}
                  </p>
                ) : null}
                {isStaff ? (
                  <button
                    type="button"
                    onClick={() => setDialog({ mode: "restore", attachment })}
                    className="mt-2 flex items-center gap-1 font-semibold text-orange-700 hover:underline dark:text-orange-400"
                  >
                    <Undo2 className="size-3" />
                    Restore attachment
                  </button>
                ) : null}
              </div>
            );
          }

          return (
            <figure
              key={attachment.id}
              className="w-fit max-w-full overflow-hidden rounded-xl border border-line bg-surface"
            >
              <MediaPreview attachment={attachment} />
              <figcaption className="flex flex-wrap items-center gap-x-3 gap-y-1 border-t border-line px-2.5 py-1.5 text-[10px] text-muted">
                <span>{formatBytes(attachment.sizeBytes)}</span>
                <span>{attachment.mimeType}</span>
                <ReportButton
                  targetType="upload"
                  uploadId={attachment.id}
                  currentUserId={currentUserId}
                  label="Report attachment"
                />
                {isStaff ? (
                  <button
                    type="button"
                    onClick={() => setDialog({ mode: "remove", attachment })}
                    className="flex items-center gap-1 font-semibold text-orange-700 hover:underline dark:text-orange-400"
                  >
                    <Shield className="size-3" />
                    Remove
                  </button>
                ) : null}
              </figcaption>
            </figure>
          );
        })}
      </div>

      {dialog ? (
        <StaffActionDialog
          title={
            dialog.mode === "remove"
              ? "Remove attachment"
              : "Restore attachment"
          }
          confirmLabel={dialog.mode === "remove" ? "Remove" : "Restore"}
          onClose={() => setDialog(null)}
          onSubmit={submit}
        />
      ) : null}
    </>
  );
}
