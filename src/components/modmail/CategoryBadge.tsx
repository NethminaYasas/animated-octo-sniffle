"use client";

import type { ModmailTicketCategory } from "@/lib/modmail/types";
import { CATEGORY_LABELS } from "@/lib/modmail/types";

export function CategoryBadge({ category }: { category: ModmailTicketCategory }) {
  return (
    <span className="rounded-full px-2 py-0.5 text-[10px] font-semibold text-muted">
      {CATEGORY_LABELS[category]}
    </span>
  );
}
