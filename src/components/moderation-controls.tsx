"use client";

import { Shield, X } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { BOARDS } from "@/lib/boards";
import type { Attachment } from "@/lib/attachments";
import {
  moveThread,
  setPostDeleted,
  setThreadDeleted,
  setThreadLocked,
  setThreadPinned,
  setUploadRemoved,
} from "@/lib/moderation/actions";

type ModerationTarget =
  | {
      type: "thread";
      id: number;
      title: string;
      boardId: string;
      isDeleted: boolean;
      isLocked: boolean;
      isPinned: boolean;
    }
  | {
      type: "post";
      id: number;
      threadId: number;
      label: string;
      isDeleted: boolean;
    };

type ActionOption = {
  value: string;
  label: string;
};

export function ModerationControls({
  target,
  isStaff,
  attachments = [],
  openingPostId,
  openingPostDeleted,
}: {
  target: ModerationTarget;
  isStaff: boolean;
  attachments?: Attachment[];
  openingPostId?: number;
  openingPostDeleted?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [action, setAction] = useState(
    target.type === "thread"
      ? target.isDeleted
        ? "thread:restore"
        : "thread:delete"
      : target.isDeleted
        ? "post:restore"
        : "post:delete",
  );
  const [reason, setReason] = useState("");
  const [boardId, setBoardId] = useState(
    target.type === "thread" ? target.boardId : "general",
  );
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!isStaff) {
    return null;
  }

  const targetLabel =
    target.type === "thread" ? target.title : target.label;

  const isThread = target.type === "thread";

  // Composite values: target:action (thread:delete, post:restore, upload:<id>:remove)
  const threadOptions: ActionOption[] = isThread
    ? [
        {
          value: target.isDeleted ? "thread:restore" : "thread:delete",
          label: target.isDeleted ? "Restore thread" : "Delete thread",
        },
        {
          value: target.isLocked ? "thread:unlock" : "thread:lock",
          label: target.isLocked ? "Unlock thread" : "Lock thread",
        },
        {
          value: target.isPinned ? "thread:unpin" : "thread:pin",
          label: target.isPinned ? "Unpin thread" : "Pin thread",
        },
        { value: "thread:move", label: "Move thread" },
      ]
    : [];

  const postDeleted = isThread ? Boolean(openingPostDeleted) : target.isDeleted;
  const postOptions: ActionOption[] =
    isThread && openingPostId === undefined
      ? []
      : [
          {
            value: postDeleted ? "post:restore" : "post:delete",
            label: isThread
              ? postDeleted
                ? "Restore opening post"
                : "Delete opening post"
              : postDeleted
                ? "Restore post/comment"
                : "Delete post/comment",
          },
        ];

  // Upload actions: one Remove/Restore option per attachment.
  const uploadOptions: ActionOption[] = attachments.map((attachment) => ({
    value: `upload:${attachment.id}:${
      attachment.status === "removed" ? "restore" : "remove"
    }`,
    label:
      attachment.status === "removed"
        ? `Restore attachment (${attachment.mimeType})`
        : `Remove attachment (${attachment.mimeType})`,
  }));

  // Parse the composite value into target kind and action.
  const [actionTarget, actionVerb] = action.split(":") as [
    "thread" | "post" | "upload",
    string,
  ];

  const isUploadAction = actionTarget === "upload";

  const submit = async () => {
    if (submitting) {
      return;
    }

    setError(null);
    setSubmitting(true);

    try {
      let result;

      if (isUploadAction) {
        // Handle upload remove/restore.
        const [, uploadId, mode] = action.split(":");
        result = await setUploadRemoved({
          uploadId,
          removed: mode === "remove",
          reason,
        });
      } else if (actionTarget === "thread") {
        if (actionVerb === "delete" || actionVerb === "restore") {
          result = await setThreadDeleted({
            threadId: target.id,
            deleted: actionVerb === "delete",
            reason,
          });
        } else if (actionVerb === "lock" || actionVerb === "unlock") {
          result = await setThreadLocked({
            threadId: target.id,
            locked: actionVerb === "lock",
            reason,
          });
        } else if (actionVerb === "pin" || actionVerb === "unpin") {
          result = await setThreadPinned({
            threadId: target.id,
            pinned: actionVerb === "pin",
            reason,
          });
        } else if (actionVerb === "move") {
          result = await moveThread({
            threadId: target.id,
            boardId,
            reason,
          });
        }
      } else if (actionTarget === "post") {
        const postId =
          target.type === "thread" ? openingPostId : target.id;
        const threadId =
          target.type === "thread" ? target.id : target.threadId;
        if (postId === undefined || threadId === undefined) {
          setError("Unknown moderation action");
          return;
        }
        result = await setPostDeleted({
          postId,
          threadId,
          deleted: actionVerb === "delete",
          reason,
        });
      }

      if (!result) {
        setError("Unknown moderation action");
        return;
      }

      if (!result.ok) {
        setError(result.error);
        return;
      }

      toast.success(result.changed ? "Moderation action saved" : "No change needed");
      setOpen(false);
      setReason("");
      window.location.reload();
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
        title="Moderate"
        aria-label="Moderate"
        className="flex items-center gap-1 text-orange-700 transition-colors hover:text-orange-800 dark:text-orange-400 dark:hover:text-orange-300"
      >
        <Shield className="size-3.5" />
        Moderate
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
            aria-label="Moderation action"
            className="w-full max-w-md rounded-xl border border-line bg-surface p-4 shadow-xl"
          >
            <div className="flex items-start justify-between gap-3">
              <div>
                <h2 className="text-sm font-semibold text-ink">
                  Moderate {targetLabel}
                </h2>
                <p className="mt-1 text-xs leading-5 text-muted">
                  Every action requires a reason and is recorded in the mod log.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setOpen(false)}
                aria-label="Close moderation dialog"
                className="grid size-7 shrink-0 place-items-center rounded-full text-muted hover:bg-surface-muted hover:text-ink"
              >
                <X className="size-4" />
              </button>
            </div>

            <label className="mt-4 block text-xs font-medium text-muted">
              Action
              <select
                value={action}
                onChange={(event) =>
                  setAction(event.target.value as string)}
                className="mt-1 w-full rounded-lg border border-line bg-surface px-3 py-2 text-sm text-ink focus:outline-none focus:ring-2 focus:ring-orange-700"
              >
                {threadOptions.length > 0 && (
                  <optgroup label="Thread">
                    {threadOptions.map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </optgroup>
                )}
                <optgroup label={isThread ? "Opening post" : "Post"}>
                  {postOptions.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </optgroup>
                {uploadOptions.length > 0 && (
                  <optgroup label="Attachments">
                    {uploadOptions.map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </optgroup>
                )}
              </select>
            </label>

            {target.type === "thread" && action === "thread:move" ? (
              <label className="mt-3 block text-xs font-medium text-muted">
                Move to board
                <select
                  value={boardId}
                  onChange={(event) => setBoardId(event.target.value)}
                  className="mt-1 w-full rounded-lg border border-line bg-surface px-3 py-2 text-sm text-ink focus:outline-none focus:ring-2 focus:ring-orange-700"
                >
                  {BOARDS.map((board) => (
                    <option key={board.id} value={board.id}>
                      {board.name}
                    </option>
                  ))}
                </select>
              </label>
            ) : null}

            <label className="mt-3 block text-xs font-medium text-muted">
              Reason
              <textarea
                value={reason}
                onChange={(event) => setReason(event.target.value)}
                rows={3}
                maxLength={1000}
                className="mt-1 w-full rounded-lg border border-line bg-surface px-3 py-2 text-sm text-ink focus:outline-none focus:ring-2 focus:ring-orange-700"
                placeholder="Why is this action needed?"
              />
            </label>

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
                {submitting ? "Saving…" : "Apply"}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
