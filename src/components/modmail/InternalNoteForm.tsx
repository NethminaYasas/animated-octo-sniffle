"use client";

import { useState } from "react";
import { toast } from "sonner";

import { addInternalNote } from "@/lib/modmail/actions";

export function InternalNoteForm({
  ticketId,
  onNoteAdded,
}: {
  ticketId: string;
  onNoteAdded?: () => void;
}) {
  const [body, setBody] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setSubmitting(true);

    try {
      const result = await addInternalNote({
        ticketId,
        message: body,
      });

      if (!result.ok) {
        toast.error(result.error);
        return;
      }

      setBody("");
      onNoteAdded?.();
      toast.success("Note added");
    } catch {
      toast.error("Could not add note. Try again.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <form onSubmit={submit} className="mt-4 space-y-3">
      <div className="space-y-2">
        <label className="block text-xs font-semibold text-muted">
          Internal note (staff only)
        </label>
        <textarea
          value={body}
          onChange={(event) => setBody(event.target.value)}
          rows={3}
          placeholder="Internal note..."
          className="w-full rounded-lg border border-line bg-surface px-3 py-2 text-sm text-ink"
        />
      </div>

      <button
        type="submit"
        disabled={submitting || body.trim().length === 0}
        className="inline-flex items-center gap-1.5 rounded-full bg-blue-700 px-3 py-1.5 text-xs font-semibold text-white transition-colors hover:bg-blue-800 disabled:opacity-60"
      >
        {submitting ? "Adding…" : "Add note"}
      </button>
    </form>
  );
}
