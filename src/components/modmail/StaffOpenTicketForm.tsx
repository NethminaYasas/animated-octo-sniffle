"use client";

import { useId, useState } from "react";
import { toast } from "sonner";
import { useRouter } from "next/navigation";

import { staffOpenTicket } from "@/lib/modmail/actions";

export function StaffOpenTicketForm() {
  const router = useRouter();
  const targetIdId = useId();
  const categoryId = useId();
  const subjectId = useId();
  const messageId = useId();
  const [targetId, setTargetId] = useState("");
  const [category, setCategory] = useState<"question" | "report_followup" | "ban_appeal" | "other">("question");
  const [subject, setSubject] = useState("");
  const [message, setMessage] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setSubmitting(true);
    setError(null);

    try {
      const result = await staffOpenTicket({
        targetId,
        category,
        subject,
        message,
      });

      if (!result.ok) {
        setError(result.error);
        return;
      }

      toast.success("Ticket opened");
      setTargetId("");
      setCategory("question");
      setSubject("");
      setMessage("");
      router.refresh();
    } catch {
      setError("Could not open ticket. Try again.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="rounded-xl border border-line bg-surface p-4">
      <h3 className="text-sm font-semibold text-ink mb-3">Open ticket for member</h3>
      <form onSubmit={submit} className="space-y-3">
        <div className="space-y-2">
          <label htmlFor={targetIdId} className="block text-xs font-semibold text-muted">
            Member ID
          </label>
          <input
            id={targetIdId}
            type="text"
            value={targetId}
            onChange={(event) => setTargetId(event.target.value)}
            placeholder="Member UUID"
            className="w-full rounded-lg border border-line bg-surface px-3 py-2 text-sm text-ink"
          />
        </div>

        <div className="space-y-2">
          <label htmlFor={categoryId} className="block text-xs font-semibold text-muted">
            Category
          </label>
          <select
            id={categoryId}
            value={category}
            onChange={(event) =>
              setCategory(
                event.target.value as
                  | "question"
                  | "report_followup"
                  | "ban_appeal"
                  | "other"
              )
            }
            className="w-full rounded-lg border border-line bg-surface px-3 py-2 text-sm text-ink"
          >
            <option value="question">Question</option>
            <option value="report_followup">Report follow-up</option>
            <option value="ban_appeal">Ban appeal</option>
            <option value="other">Other</option>
          </select>
        </div>

        <div className="space-y-2">
          <label htmlFor={subjectId} className="block text-xs font-semibold text-muted">
            Subject
          </label>
          <input
            id={subjectId}
            type="text"
            value={subject}
            onChange={(event) => setSubject(event.target.value)}
            maxLength={200}
            placeholder="Subject"
            className="w-full rounded-lg border border-line bg-surface px-3 py-2 text-sm text-ink"
          />
        </div>

        <div className="space-y-2">
          <label htmlFor={messageId} className="block text-xs font-semibold text-muted">
            Message
          </label>
          <textarea
            id={messageId}
            value={message}
            onChange={(event) => setMessage(event.target.value)}
            maxLength={10000}
            rows={4}
            placeholder="Message to member"
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
          disabled={submitting}
          className="inline-flex items-center gap-1.5 rounded-full bg-orange-700 px-3 py-1.5 text-xs font-semibold text-white transition-colors hover:bg-orange-800 disabled:opacity-60"
        >
          {submitting ? "Opening…" : "Open ticket"}
        </button>
      </form>
    </div>
  );
}
