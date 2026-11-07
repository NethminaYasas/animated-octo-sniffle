"use client";

import { useState } from "react";
import { toast } from "sonner";

import { assignTicket } from "@/lib/modmail/actions";

export function AssignmentForm({
  ticketId,
  currentAssigneeId,
  onChange,
}: {
  ticketId: string;
  currentAssigneeId: string | null;
  onChange?: (assigneeId: string | null) => void;
}) {
  const [assigneeId, setAssigneeId] = useState(currentAssigneeId ?? "");
  const [submitting, setSubmitting] = useState(false);

  const submit = async () => {
    setSubmitting(true);
    try {
      const result = await assignTicket({
        ticketId,
        assigneeId: assigneeId || undefined,
      });

      if (!result.ok) {
        toast.error(result.error);
        return;
      }

      onChange?.(assigneeId || null);
      toast.success("Assignment updated");
    } catch {
      toast.error("Could not assign ticket. Try again.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="flex flex-wrap items-center gap-2">
      <span className="text-xs font-semibold text-muted">Assignee:</span>
      <input
        type="text"
        value={assigneeId}
        onChange={(event) => setAssigneeId(event.target.value)}
        placeholder="Member UUID"
        className="w-48 rounded-lg border border-line bg-surface px-3 py-2 text-xs text-ink"
      />
      <button
        type="button"
        onClick={submit}
        disabled={submitting}
        className="rounded-full px-3 py-1.5 text-[10px] font-semibold text-white bg-orange-700 hover:bg-orange-800 disabled:opacity-60"
      >
        {submitting ? "Assigning…" : "Assign"}
      </button>
    </div>
  );
}
