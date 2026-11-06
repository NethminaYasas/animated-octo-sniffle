"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";

import {
  createInviteCodes,
  revokeInviteCode,
  type InviteCodeResult,
} from "@/lib/moderation/actions";

function newRequestId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }

  return `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

export function CreateInviteForm() {
  const router = useRouter();
  const [count, setCount] = useState(1);
  const [reason, setReason] = useState("");
  const [requestId, setRequestId] = useState(newRequestId);
  const [codes, setCodes] = useState<InviteCodeResult[]>([]);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async () => {
    if (pending) {
      return;
    }

    setPending(true);
    setError(null);
    setCodes([]);

    try {
      const result = await createInviteCodes({
        count,
        reason,
        requestId,
      });

      if (!result.ok) {
        setError(result.error);
        return;
      }

      if (result.codes.length === 0) {
        setError(
          "That batch was already created. Plaintext codes can only be shown once, so create a new batch if you lost them.",
        );
        setRequestId(newRequestId());
        router.refresh();
      } else {
        setCodes(result.codes);
        setReason("");
        setRequestId(newRequestId());
        router.refresh();
      }
    } catch {
      setError("Could not reach the server. Try again.");
    } finally {
      setPending(false);
    }
  };

  return (
    <section className="rounded-xl border border-line bg-surface p-4">
      <h2 className="text-sm font-semibold text-ink">Create invite codes</h2>
      <p className="mt-1 text-xs leading-5 text-muted">
        Codes are generated with 128-bit randomness and stored only as SHA-256
        hashes. Copy the plaintext now: the database cannot show it again.
      </p>

      <div className="mt-3 grid gap-2 sm:grid-cols-[8rem_minmax(0,1fr)]">
        <label className="text-xs font-medium text-muted">
          How many
          <input
            type="number"
            min={1}
            max={50}
            value={count}
            onChange={(event) => setCount(Number(event.target.value))}
            className="mt-1 block w-full rounded-lg border border-line bg-surface px-2 py-1.5 text-xs text-ink"
          />
        </label>
        <label className="text-xs font-medium text-muted">
          Reason
          <input
            value={reason}
            onChange={(event) => setReason(event.target.value)}
            maxLength={1000}
            className="mt-1 block w-full rounded-lg border border-line bg-surface px-2 py-1.5 text-xs text-ink"
            placeholder="Why are these codes being created?"
          />
        </label>
      </div>

      {codes.length > 0 ? (
        <div className="mt-3 rounded-lg border border-emerald-300 bg-emerald-50 p-3 dark:border-emerald-800/70 dark:bg-emerald-950/30">
          <p className="text-xs font-semibold text-emerald-900 dark:text-emerald-200">
            Copy these now — they will not be shown again.
          </p>
          <textarea
            readOnly
            value={codes.map((entry) => entry.code).join("\n")}
            rows={Math.min(10, Math.max(2, codes.length))}
            className="mt-2 w-full rounded border border-emerald-300 bg-surface px-2 py-1.5 font-mono text-xs text-ink dark:border-emerald-800"
          />
        </div>
      ) : null}

      {error ? (
        <p className="mt-2 text-xs text-red-600 dark:text-red-400">{error}</p>
      ) : null}

      <button
        type="button"
        disabled={pending || reason.trim().length === 0}
        onClick={() => void submit()}
        className="mt-3 rounded-full bg-orange-700 px-4 py-2 text-xs font-semibold text-white hover:bg-orange-800 disabled:opacity-60"
      >
        {pending ? "Creating…" : "Create codes"}
      </button>
    </section>
  );
}

export function RevokeInviteForm({
  codeHash,
  codeHint,
}: {
  codeHash: string;
  codeHint: string;
}) {
  const router = useRouter();
  const [reason, setReason] = useState("");
  const [pending, setPending] = useState(false);

  const submit = async () => {
    if (pending) {
      return;
    }

    setPending(true);

    try {
      const result = await revokeInviteCode({ codeHash, reason });

      if (!result.ok) {
        toast.error("Could not revoke the invite code", {
          description: result.error,
        });
        return;
      }

      toast.success(
        result.changed
          ? `Invite ${codeHint} revoked`
          : "That code was already revoked",
      );
      setReason("");
      router.refresh();
    } catch {
      toast.error("Could not reach the server. Try again.");
    } finally {
      setPending(false);
    }
  };

  return (
    <div className="mt-2 flex flex-wrap items-center gap-2">
      <input
        value={reason}
        onChange={(event) => setReason(event.target.value)}
        maxLength={1000}
        placeholder="Revocation reason"
        className="min-w-48 flex-1 rounded-lg border border-line bg-surface px-2 py-1.5 text-xs text-ink"
      />
      <button
        type="button"
        disabled={pending || reason.trim().length === 0}
        onClick={() => void submit()}
        className="rounded-full border border-red-300 px-3 py-1.5 text-[11px] font-semibold text-red-700 hover:bg-red-50 disabled:opacity-60 dark:border-red-800 dark:text-red-300 dark:hover:bg-red-950/30"
      >
        {pending ? "Revoking…" : "Revoke"}
      </button>
    </div>
  );
}
