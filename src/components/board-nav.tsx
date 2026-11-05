"use client";

import { Home as HomeIcon, TrendingUp, Grid } from "lucide-react";

import { BOARDS } from "@/lib/boards";

/**
 * activeBoard controls which row looks selected:
 *   undefined → nothing selected (e.g. on the create-post page)
 *   null      → Home is selected
 *   string    → that board is selected
 */
export function BoardNav({
  activeBoard,
  onBoardChange,
}: {
  activeBoard?: string | null;
  onBoardChange: (boardId: string | null) => void;
}) {
  return (
    <nav aria-label="Forum navigation" className="sticky top-20 space-y-0.5">
      <button
        className={`flex w-full items-center gap-2.5 rounded px-3 py-2 text-sm font-medium transition-colors ${
          activeBoard === null
            ? "bg-surface-muted text-ink"
            : "text-muted hover:bg-surface-muted hover:text-ink"
        }`}
        onClick={() => onBoardChange(null)}
      >
        <HomeIcon className="size-4" />
        Home
      </button>
      <button
        className={`flex w-full cursor-default items-center gap-2.5 rounded px-3 py-2 text-sm transition-colors ${
          activeBoard === "popular"
            ? "bg-surface-muted text-ink"
            : "text-muted hover:bg-surface-muted hover:text-ink"
        }`}
        onClick={() => onBoardChange("popular")}
        disabled={true}
        title="Coming soon"
      >
        <TrendingUp className="size-4" />
        Popular
        <span className="ml-auto text-[10px] font-semibold uppercase tracking-wide text-faint">
          Soon
        </span>
      </button>
      <button
        className={`flex w-full cursor-default items-center gap-2.5 rounded px-3 py-2 text-sm transition-colors ${
          activeBoard === "all"
            ? "bg-surface-muted text-ink"
            : "text-muted hover:bg-surface-muted hover:text-ink"
        }`}
        onClick={() => onBoardChange("all")}
        disabled={true}
        title="Coming soon"
      >
        <Grid className="size-4" />
        All
        <span className="ml-auto text-[10px] font-semibold uppercase tracking-wide text-faint">
          Soon
        </span>
      </button>

      <div className="my-3 border-t border-line" />

      <p className="px-3 pb-1 text-[11px] font-semibold uppercase tracking-wide text-muted">
        Boards
      </p>
      {BOARDS.map((board) => {
        const Icon = board.icon;

        return (
          <button
            key={board.id}
            className={`flex w-full items-center gap-2.5 rounded px-3 py-2 text-sm text-left transition-colors ${
              activeBoard === board.id
                ? "bg-surface-muted text-ink"
                : "text-body hover:bg-surface-muted hover:text-ink"
            }`}
            onClick={() => onBoardChange(board.id)}
          >
            <span className="grid size-6 shrink-0 place-items-center rounded-full bg-surface-muted text-muted">
              <Icon className="size-3.5" aria-hidden="true" />
            </span>
            <span className="truncate">{board.name}</span>
          </button>
        );
      })}
      <p className="px-3 pt-3 text-[11px] leading-5 text-faint">
        Posts and comments are stored on this device until the database ships.
      </p>
    </nav>
  );
}