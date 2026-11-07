"use client";

import type { ModmailTicketPriority } from "@/lib/modmail/types";
import { PRIORITY_LABELS } from "@/lib/modmail/types";

export function PriorityBadge({ priority }: { priority: ModmailTicketPriority }) {
  const variants: Record<ModmailTicketPriority, string> = {
    low: "bg-slate-100 text-slate-700 dark:bg-slate-900 dark:text-slate-300",
    normal: "bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300",
    high: "bg-amber-50 text-amber-700 dark:bg-amber-950/40 dark:text-amber-300",
    urgent: "bg-red-50 text-red-700 dark:bg-red-950/40 dark:text-red-300",
  };

  return (
    <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${variants[priority]}`}>
      {PRIORITY_LABELS[priority]}
    </span>
  );
}
