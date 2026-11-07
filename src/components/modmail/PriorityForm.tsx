"use client";

import { useState } from "react";
import { toast } from "sonner";

import { setTicketPriority } from "@/lib/modmail/actions";

type PriorityOption = "low" | "normal" | "high" | "urgent";

const PRIORITY_OPTIONS: PriorityOption[] = ["low", "normal", "high", "urgent"];

export function PriorityForm({
  ticketId,
  currentPriority,
  onChange,
}: {
  ticketId: string;
  currentPriority: string;
  onChange?: (priority: string) => void;
}) {
  const [submitting, setSubmitting] = useState(false);

  const submit = async (priority: PriorityOption) => {
    setSubmitting(true);
    try {
      const result = await setTicketPriority({
        ticketId,
        priority,
      });

      if (!result.ok) {
        toast.error(result.error);
        return;
      }

      onChange?.(priority);
      toast.success("Priority updated");
    } catch {
      toast.error("Could not update priority. Try again.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="flex flex-wrap items-center gap-2">
      <span className="text-xs font-semibold text-muted">Priority:</span>
      {PRIORITY_OPTIONS.map((priority) => (
        <button
          key={priority}
          type="button"
          onClick={() => submit(priority)}
          disabled={submitting}
          className={`rounded-full px-2 py-0.5 text-[10px] font-semibold transition-colors ${
            currentPriority === priority
              ? "bg-orange-700 text-white"
              : "bg-surface-muted text-muted hover:bg-surface"
          }`}
        >
          {priority.charAt(0).toUpperCase() + priority.slice(1)}
        </button>
      ))}
    </div>
  );
}
