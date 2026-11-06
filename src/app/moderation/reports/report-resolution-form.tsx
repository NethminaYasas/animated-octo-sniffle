"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";

import { resolveReport } from "@/lib/moderation/actions";

export function ReportResolutionForm({
  reportId,
  canResolve,
  blockedReason,
}: {
  reportId: number;
  canResolve: boolean;
  blockedReason: string | null;
}) {
  const router = useRouter();
  const [note, setNote] = useState("");
  const [pending, setPending] = useState<"resolved" | "dismissed" | null>(null);

  if (!canResolve) {
    return (
      <p className="mt-2 text-[11px] text-muted">
        {blockedReason ?? "You cannot resolve this report."}
      </p>
    );
  }

  const submit = async (status: "resolved" | "dismissed") => {
    if (pending) {
      return;
    }

    setPending(status);

    try {
      const result = await resolveReport({
        reportId,
        status,
        note,
      });

      if (!result.ok) {
        toast.error("Could not handle the report", {
          description: result.error,
        });
        return;
      }

      toast.success(
        result.changed
          ? status === "resolved"
            ? "Report resolved"
            : "Report dismissed"
          : "That report was already handled",
      );
      setNote("");
      router.refresh();
    } catch {
      toast.error("Could not reach the server. Try again.");
    } finally {
      setPending(null);
    }
  };

  return (
    <div className="mt-2 space-y-2">
      <textarea
        value={note}
        onChange={(event) => setNote(event.target.value)}
        rows={2}
        maxLength={2000}
        placeholder="Resolution note (staff only)"
        className="w-full rounded-lg border border-line bg-surface px-3 py-2 text-xs text-ink focus:outline-none focus:ring-2 focus:ring-orange-700"
      />
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          disabled={pending !== null || note.trim().length === 0}
          onClick={() => void submit("resolved")}
          className="rounded-full bg-emerald-700 px-3 py-1.5 text-[11px] font-semibold text-white hover:bg-emerald-800 disabled:opacity-60"
        >
          {pending === "resolved" ? "Resolving…" : "Resolve"}
        </button>
        <button
          type="button"
          disabled={pending !== null || note.trim().length === 0}
          onClick={() => void submit("dismissed")}
          className="rounded-full border border-line px-3 py-1.5 text-[11px] font-semibold text-muted hover:bg-surface-muted hover:text-ink disabled:opacity-60"
        >
          {pending === "dismissed" ? "Dismissing…" : "Dismiss"}
        </button>
      </div>
    </div>
  );
}
