"use client";

import type { ModmailTicketStatus } from "@/lib/modmail/types";
import { STATUS_LABELS } from "@/lib/modmail/types";

export function StatusBadge({ status }: { status: ModmailTicketStatus }) {
  const variants: Record<ModmailTicketStatus, string> = {
    open: "bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300",
    pending: "bg-amber-50 text-amber-700 dark:bg-amber-950/40 dark:text-amber-300",
    resolved: "bg-blue-50 text-blue-700 dark:bg-blue-950/40 dark:text-blue-300",
    closed: "bg-slate-50 text-slate-700 dark:bg-slate-950/40 dark:text-slate-300",
  };

  return (
    <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${variants[status]}`}>
      {STATUS_LABELS[status]}
    </span>
  );
}
