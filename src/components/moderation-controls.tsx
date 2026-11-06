"use client";

import { Shield, X } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { BOARDS } from "@/lib/boards";
import {
  moveThread,
  setPostDeleted,
  setThreadDeleted,
  setThreadLocked,
  setThreadPinned,
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

export function ModerationControls({
  target,
  isStaff,
}: {
  target: ModerationTarget;
  isStaff: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [action, setAction] = useState(target.isDeleted ? "restore" : "delete");
  const [reason, setReason] = useState("");
  const [boardId, setBoardId] = useState(
    target.type === "thread" ? target.boardId : "general",
  );
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!isStaff) {
    return null;
  }

  const options =
    target.type === "thread"
      ? [
          { value: target.isDeleted ? "restore" : "delete", label: target.isDeleted ? "Restore thread" : "Delete thread" },
          { value: target.isLocked ? "unlock" : "lock", label: target.isLocked ? "Unlock thread" : "Lock thread" },
          { value: target.isPinned ? "unpin" : "pin", label: target.isPinned ? "Unpin thread" : "Pin thread" },
          { value: "move", label: "Move thread" },
        ]
      : [
          { value: target.isDeleted ? "restore" : "delete", label: target.isDeleted ? "Restore post/comment" : "Delete post/comment" },
        ];

  const submit = async () => {
    if (submitting) {
      return;
    }

    setError(null);
    setSubmitting(true);

    try {
      let result;

      if (target.type === "thread") {
        if (action === "delete" || action === "restore") {
          result = await setThreadDeleted({
            threadId: target.id,
            deleted: action === "delete",
            reason,
          });
        } else if (action === "lock" || action === "unlock") {
          result = await setThreadLocked({
            threadId: target.id,
            locked: action === "lock",
            reason,
          });
        } else if (action === "pin" || action === "unpin") {
          result = await setThreadPinned({
            threadId: target.id,
            pinned: action === "pin",
            reason,
          });
        } else {
          result = await moveThread({
            threadId: target.id,
            boardId,
            reason,
          });
        }
      } else {
        result = await setPostDeleted({
          postId: target.id,
          threadId: target.threadId,
          deleted: action === "delete",
          reason,
        });
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
                  Moderate {target.type === "thread" ? target.title : target.label}
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
                onChange={(event) => setAction(event.target.value)}
                className="mt-1 w-full rounded-lg border border-line bg-surface px-3 py-2 text-sm text-ink focus:outline-none focus:ring-2 focus:ring-orange-700"
              >
                {options.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </label>

            {target.type === "thread" && action === "move" ? (
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
