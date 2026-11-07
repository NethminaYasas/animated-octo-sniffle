"use client";

import { useState } from "react";
import { toast } from "sonner";

import { replyToTicket } from "@/lib/modmail/actions";

export function ReplyForm({ ticketId }: { ticketId: string }) {
  const [message, setMessage] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setSubmitting(true);
    setError(null);

    try {
      const result = await replyToTicket({
        ticketId,
        message,
      });

      if (!result.ok) {
        setError(result.error);
        return;
      }

      setMessage("");
      toast.success("Reply sent");
    } catch {
      setError("Could not send reply. Try again.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <form onSubmit={submit} className="mt-6 space-y-3">
      <div className="space-y-2">
        <label className="block text-xs font-semibold text-muted">
          Reply
        </label>
        <textarea
          value={message}
          onChange={(event) => setMessage(event.target.value)}
          rows={4}
          placeholder="Write your reply..."
          className="w-full rounded-lg border border-line bg-surface px-3 py-2 text-sm text-ink"
        />
      </div>

      {error ? (
        <p className="mt-2 text-xs text-red-600 dark:text-red-400">
          {error}
        </p>
      ) : null}

      <button
        type="submit"
        disabled={submitting || message.trim().length === 0}
        className="inline-flex items-center gap-1.5 rounded-full bg-orange-700 px-3 py-1.5 text-xs font-semibold text-white transition-colors hover:bg-orange-800 disabled:opacity-60"
      >
        {submitting ? "Sending…" : "Send reply"}
      </button>
    </form>
  );
}
