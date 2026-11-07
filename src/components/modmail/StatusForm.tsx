"use client";

import { useState } from "react";
import { toast } from "sonner";

import { setTicketStatus } from "@/lib/modmail/actions";

type StatusOption = "open" | "pending" | "resolved" | "closed";

const STATUS_OPTIONS: StatusOption[] = ["open", "pending", "resolved", "closed"];

export function StatusForm({
  ticketId,
  currentStatus,
  onChange,
}: {
  ticketId: string;
  currentStatus: string;
  onChange?: (status: string) => void;
}) {
  const [submitting, setSubmitting] = useState(false);

  const submit = async (status: StatusOption) => {
    setSubmitting(true);
    try {
      const result = await setTicketStatus({
        ticketId,
        status,
      });

      if (!result.ok) {
        toast.error(result.error);
        return;
      }

      onChange?.(status);
      toast.success("Status updated");
    } catch {
      toast.error("Could not update status. Try again.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="flex flex-wrap items-center gap-2">
      <span className="text-xs font-semibold text-muted">Status:</span>
      {STATUS_OPTIONS.map((status) => (
        <button
          key={status}
          type="button"
          onClick={() => submit(status)}
          disabled={submitting}
          className={`rounded-full px-2 py-0.5 text-[10px] font-semibold transition-colors ${
            currentStatus === status
              ? "bg-orange-700 text-white"
              : "bg-surface-muted text-muted hover:bg-surface"
          }`}
        >
          {status.charAt(0).toUpperCase() + status.slice(1)}
        </button>
      ))}
    </div>
  );
}
