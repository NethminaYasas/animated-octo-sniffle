"use client";

import { Ban } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";

import {
  blockUploadHash,
  setUploadRemoved,
  unblockUploadHash,
} from "@/lib/moderation/actions";

function reasonProblem(reason: string): string | null {
  if (reason.trim().length < 1) {
    return "A reason is required.";
  }

  if (reason.trim().length > 1000) {
    return "Keep the reason to 1000 characters or fewer.";
  }

  return null;
}

function InlineReasonForm({
  label,
  onSubmit,
  pendingLabel,
  tone,
}: {
  label: string;
  pendingLabel: string;
  onSubmit: (reason: string) => Promise<boolean>;
  tone?: "danger" | "neutral";
}) {
  const [reason, setReason] = useState("");
  const [pending, setPending] = useState(false);

  return (
    <div className="flex flex-wrap items-center gap-2">
      <input
        value={reason}
        onChange={(event) => setReason(event.target.value)}
        maxLength={1000}
        placeholder="Reason"
        aria-label={`Reason for ${label}`}
        className="min-w-40 flex-1 rounded-lg border border-line bg-surface px-2 py-1.5 text-[11px] text-ink"
      />
      <button
        type="button"
        disabled={pending || reason.trim().length === 0}
        onClick={() => {
          const problem = reasonProblem(reason);

          if (problem) {
            toast.error(problem);
            return;
          }

          setPending(true);
          void onSubmit(reason.trim())
            .then((ok) => {
              if (ok) {
                setReason("");
              }
            })
            .catch(() => {
              toast.error("The action failed. Try again.");
            })
            .finally(() => setPending(false));
        }}
        className={`rounded-full px-3 py-1.5 text-[11px] font-semibold text-white disabled:opacity-60 ${
          tone === "danger"
            ? "bg-red-700 hover:bg-red-800"
            : "bg-orange-700 hover:bg-orange-800"
        }`}
      >
        {pending ? pendingLabel : label}
      </button>
    </div>
  );
}

export function BlockHashForm() {
  const router = useRouter();
  const [hash, setHash] = useState("");

  return (
    <div className="mt-3 rounded-xl border border-line bg-surface p-3">
      <label className="block text-xs font-medium text-muted">
        Block a SHA-256 hash
        <input
          value={hash}
          onChange={(event) =>
            setHash(event.target.value.trim().toLowerCase())
          }
          placeholder="64 hex characters"
          maxLength={64}
          className="mt-1 block w-full rounded-lg border border-line bg-surface px-2 py-1.5 font-mono text-[11px] text-ink"
        />
      </label>

      <div className="mt-2">
        <InlineReasonForm
          label="Block hash"
          pendingLabel="Blocking…"
          tone="danger"
          onSubmit={async (reason) => {
            if (!/^[a-f0-9]{64}$/.test(hash)) {
              toast.error("Enter a 64-character lowercase SHA-256 hash.");
              return false;
            }

            const result = await blockUploadHash({ sha256: hash, reason });

            if (!result.ok) {
              toast.error("Could not block the hash", {
                description: result.error,
              });
              return false;
            }

            toast.success(
              result.changed ? "Hash blocked" : "That hash was already blocked",
            );
            setHash("");
            router.refresh();
            return true;
          }}
        />
      </div>
    </div>
  );
}

export function UnblockHashForm({ sha256 }: { sha256: string }) {
  const router = useRouter();

  return (
    <div className="w-full sm:w-auto">
      <InlineReasonForm
        label="Unblock"
        pendingLabel="Unblocking…"
        tone="neutral"
        onSubmit={async (reason) => {
          const result = await unblockUploadHash({ sha256, reason });

          if (!result.ok) {
            toast.error("Could not unblock the hash", {
              description: result.error,
            });
            return false;
          }

          toast.success(
            result.changed ? "Hash unblocked" : "That hash was not blocked",
          );
          router.refresh();
          return true;
        }}
      />
    </div>
  );
}

type UploadActionRow = {
  id: string;
  status: "active" | "removed";
  sha256: string;
  raw_sha256: string;
};

export function UploadRowActions({
  upload,
  isAdmin,
}: {
  upload: UploadActionRow;
  isAdmin: boolean;
}) {
  const router = useRouter();

  const act = async (
    mode: "remove" | "restore",
    reason: string,
  ): Promise<boolean> => {
    const result = await setUploadRemoved({
      uploadId: upload.id,
      removed: mode === "remove",
      reason,
    });

    if (!result.ok) {
      toast.error("Could not update the attachment", {
        description: result.error,
      });
      return false;
    }

    toast.success(mode === "remove" ? "Attachment removed" : "Attachment restored");
    router.refresh();
    return true;
  };

  return (
    <div className="flex w-full flex-col gap-2 sm:w-64">
      <InlineReasonForm
        label={upload.status === "active" ? "Remove" : "Restore"}
        pendingLabel="Saving…"
        tone={upload.status === "active" ? "danger" : "neutral"}
        onSubmit={(reason) =>
          act(upload.status === "active" ? "remove" : "restore", reason)
        }
      />
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() => {
            if (!navigator.clipboard) {
              toast.error("Clipboard is not available");
              return;
            }

            navigator.clipboard
              .writeText(upload.sha256)
              .then(() => toast.success("Stripped hash copied"))
              .catch(() => toast.error("Could not copy the hash"));
          }}
          className="rounded-full border border-line px-2.5 py-1 text-[10px] font-semibold text-muted hover:bg-surface-muted hover:text-ink"
        >
          Copy sha256
        </button>
        <button
          type="button"
          onClick={() => {
            if (!navigator.clipboard) {
              toast.error("Clipboard is not available");
              return;
            }

            navigator.clipboard
              .writeText(upload.raw_sha256)
              .then(() => toast.success("Raw hash copied"))
              .catch(() => toast.error("Could not copy the hash"));
          }}
          className="rounded-full border border-line px-2.5 py-1 text-[10px] font-semibold text-muted hover:bg-surface-muted hover:text-ink"
        >
          Copy raw
        </button>
      </div>
      {isAdmin ? null : (
        <p className="text-[10px] text-faint">
          <Ban className="mr-1 inline size-3 align-[-2px]" />
          Unblocking hashes is admin-only.
        </p>
      )}
    </div>
  );
}
