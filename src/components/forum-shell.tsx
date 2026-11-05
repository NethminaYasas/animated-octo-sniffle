"use client";

import { useRouter } from "next/navigation";
import type { ReactNode } from "react";

import { BoardNav } from "@/components/board-nav";

/**
 * The shared page frame: board nav plus the main column. Keeping this in one
 * place stops the feed, thread and create pages from drifting out of step
 * with the site header.
 */
export function ForumShell({
  activeBoard,
  onBoardSelect,
  children,
}: {
  activeBoard?: string | null;
  onBoardSelect?: (boardId: string | null) => void;
  children: ReactNode;
}) {
  const router = useRouter();

  const selectBoard = (boardId: string | null) => {
    if (onBoardSelect) {
      onBoardSelect(boardId);
      return;
    }

    router.push(boardId ? `/?board=${encodeURIComponent(boardId)}` : "/");
  };

  return (
    <main className="flex flex-1 flex-col">
      <div className="mx-auto grid w-full max-w-[90rem] flex-1 grid-cols-1 gap-6 px-3 py-3 sm:px-4 lg:grid-cols-[14rem_minmax(0,1fr)]">
        <div className="hidden lg:block">
          <BoardNav activeBoard={activeBoard} onBoardChange={selectBoard} />
        </div>

        <section className="min-w-0">{children}</section>
      </div>
    </main>
  );
}
