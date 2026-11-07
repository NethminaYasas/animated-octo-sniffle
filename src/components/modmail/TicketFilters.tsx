"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useCallback } from "react";

export type TicketFilter =
  | "open"
  | "pending"
  | "resolved"
  | "closed"
  | "mine"
  | "unassigned"
  | "all";

const FILTERS: TicketFilter[] = [
  "open",
  "pending",
  "resolved",
  "closed",
  "mine",
  "unassigned",
  "all",
];

export function TicketFilters({
  currentFilter,
}: {
  currentFilter: TicketFilter;
}) {
  const router = useRouter();
  const searchParams = useSearchParams();

  const onChange = useCallback(
    (filter: TicketFilter) => {
      const params = new URLSearchParams(searchParams.toString());
      params.set("filter", filter);
      params.delete("cursor"); // reset cursor when filter changes
      router.push(`?${params.toString()}`);
    },
    [router, searchParams],
  );

  return (
    <div className="flex flex-wrap items-center gap-2 text-xs">
      {FILTERS.map((filter) => (
        <button
          key={filter}
          type="button"
          onClick={() => onChange(filter)}
          className={`rounded-full px-2 py-0.5 text-[10px] font-semibold transition-colors ${
            currentFilter === filter
              ? "bg-orange-700 text-white"
              : "bg-surface-muted text-muted hover:bg-surface"
          }`}
        >
          {filter.charAt(0).toUpperCase() + filter.slice(1)}
        </button>
      ))}
    </div>
  );
}
