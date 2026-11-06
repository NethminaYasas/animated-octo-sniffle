"use client";

import { Flag, X } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { createReport } from "@/lib/reports/actions";

export function ReportButton({
  targetType,
  postId,
  targetUserId,
  uploadId,
  authorId,
  currentUserId,
  label = "Report",
}: {
  targetType: "post" | "user" | "upload";
  postId?: number;
  targetUserId?: string;
  uploadId?: string;
  authorId?: string | null;
  currentUserId: string | null;
  label?: string;
}) {
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const isOwn =
    (targetType === "post" && authorId && authorId === currentUserId) ||
    (targetType === "user" && targetUserId === currentUserId) ||
    (targetType === "upload" && authorId === currentUserId);

  if (!currentUserId || isOwn) {
    return null;
  }

  const submit = async () => {
    if (submitting) {
      return;
    }

    setError(null);
    setSubmitting(true);

    try {
      const result = await createReport({
        targetType,
        postId,
        targetUserId,
        uploadId,
        reason,
      });

      if (!result.ok) {
        setError(result.error);
        return;
      }

      toast.success("Report submitted", {
        description: "The moderation team will review it.",
      });
      setOpen(false);
      setReason("");
    } catch {
      setError("Could not reach the server. Try again.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label={label}
        title={label}
        className="flex items-center gap-1 transition-colors hover:text-ink"
      >
        <Flag className="size-3.5" />
        {label}
      </button>

      {open ? (
        <div
          className="fixed inset-0 z-50 grid place-items-center bg-black/40 p-4"
          role="presentation"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) {
              setOpen(false);
            }
          }}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-label={label}
            className="w-full max-w-md rounded-xl border border-line bg-surface p-4 shadow-xl"
          >
            <div className="flex items-start justify-between gap-3">
              <div>
                <h2 className="text-sm font-semibold text-ink">{label}</h2>
                <p className="mt-1 text-xs leading-5 text-muted">
                  Tell the moderation team why this needs attention. Reports are
                  not end-to-end encrypted; staff can read what you submit.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setOpen(false)}
                aria-label="Close report dialog"
                className="grid size-7 shrink-0 place-items-center rounded-full text-muted hover:bg-surface-muted hover:text-ink"
              >
                <X className="size-4" />
              </button>
            </div>

            <label
              htmlFor="report-reason"
              className="mt-4 block text-xs font-medium text-muted"
            >
              Reason
            </label>
            <textarea
              id="report-reason"
              value={reason}
              onChange={(event) => setReason(event.target.value)}
              rows={4}
              maxLength={1000}
              className="mt-1 w-full rounded-lg border border-line bg-surface px-3 py-2 text-sm text-ink focus:outline-none focus:ring-2 focus:ring-orange-700"
              placeholder="What is wrong with this?"
            />

            {error ? (
              <p className="mt-2 text-xs text-red-600 dark:text-red-400">
                {error}
              </p>
            ) : null}

            <div className="mt-4 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="rounded-full border border-line px-3 py-2 text-xs font-semibold text-muted hover:bg-surface-muted hover:text-ink"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={submitting || reason.trim().length === 0}
                onClick={() => void submit()}
                className="rounded-full bg-orange-700 px-4 py-2 text-xs font-semibold text-white hover:bg-orange-800 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {submitting ? "Submitting…" : "Submit report"}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
