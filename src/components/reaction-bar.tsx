"use client";

import {
  useEffect,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
} from "react";
import { toast } from "sonner";

import {
  REACTION_KINDS,
  reactionTotal,
  type ReactionCounts,
  type ReactionKind,
} from "@/lib/reactions";
import { useReactions } from "@/lib/use-reactions";

const REACTION_META: Record<
  ReactionKind,
  { emoji: string; label: string }
> = {
  like: { emoji: "👍", label: "Like" },
  laugh: { emoji: "😂", label: "Laugh" },
  wow: { emoji: "😮", label: "Wow" },
  anger: { emoji: "😡", label: "Anger" },
  dislike: { emoji: "👎", label: "Dislike" },
};

const LONG_PRESS_MS = 350;

/**
 * One primary Like button. Hovering (mouse) or long-pressing (touch) opens the
 * emoji picker; a plain click/tap likes the post or comment.
 *
 * Reactions are only offered to signed-in members on other members' content.
 * Banned members can still react; the RLS policy intentionally allows it.
 */
export function ReactionBar({
  postId,
  authorId,
  currentUserId,
  initialCounts,
  initialMine,
}: {
  postId: number;
  authorId: string | null;
  currentUserId: string | null;
  initialCounts: ReactionCounts;
  initialMine: ReactionKind | null;
}) {
  const { counts, mine, pending, save } = useReactions(
    postId,
    initialCounts,
    initialMine,
  );
  const [pickerOpen, setPickerOpen] = useState(false);
  const wrapperRef = useRef<HTMLDivElement>(null);
  const closeTimerRef = useRef<number | null>(null);
  const pressTimerRef = useRef<number | null>(null);
  const longPressRef = useRef(false);

  const isOwn = currentUserId !== null && authorId === currentUserId;

  useEffect(() => {
    if (!pickerOpen) {
      return;
    }

    const handlePointerDown = (event: PointerEvent) => {
      if (!wrapperRef.current?.contains(event.target as Node)) {
        setPickerOpen(false);
      }
    };

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setPickerOpen(false);
      }
    };

    document.addEventListener("pointerdown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);

    return () => {
      document.removeEventListener("pointerdown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [pickerOpen]);

  useEffect(() => {
    return () => {
      if (closeTimerRef.current) {
        window.clearTimeout(closeTimerRef.current);
      }

      if (pressTimerRef.current) {
        window.clearTimeout(pressTimerRef.current);
      }
    };
  }, []);

  if (!currentUserId || isOwn) {
    return null;
  }

  const total = reactionTotal(counts);
  const current = mine ? REACTION_META[mine] : null;

  const saveReaction = async (kind: ReactionKind | null) => {
    const error = await save(kind);

    if (error) {
      toast.error("Couldn't save your reaction", {
        description: error,
      });
    }
  };

  const handleLike = () => {
    void saveReaction(mine === "like" ? null : "like");
  };

  const handlePick = (kind: ReactionKind) => {
    void saveReaction(mine === kind ? null : kind);
    setPickerOpen(false);
    longPressRef.current = false;
  };

  const openPicker = () => {
    if (closeTimerRef.current) {
      window.clearTimeout(closeTimerRef.current);
      closeTimerRef.current = null;
    }

    setPickerOpen(true);
  };

  const scheduleClose = () => {
    if (closeTimerRef.current) {
      window.clearTimeout(closeTimerRef.current);
    }

    closeTimerRef.current = window.setTimeout(() => {
      setPickerOpen(false);
      closeTimerRef.current = null;
    }, 150);
  };

  const clearPressTimer = () => {
    if (pressTimerRef.current) {
      window.clearTimeout(pressTimerRef.current);
      pressTimerRef.current = null;
    }
  };

  const handlePointerDown = (event: ReactPointerEvent<HTMLButtonElement>) => {
    if (event.pointerType === "mouse") {
      return;
    }

    longPressRef.current = false;
    clearPressTimer();

    pressTimerRef.current = window.setTimeout(() => {
      longPressRef.current = true;
      setPickerOpen(true);
      pressTimerRef.current = null;
    }, LONG_PRESS_MS);
  };

  const handleClick = () => {
    if (longPressRef.current) {
      longPressRef.current = false;
      return;
    }

    handleLike();
  };

  return (
    <div
      ref={wrapperRef}
      className="relative"
      onPointerEnter={(event) => {
        if (event.pointerType === "mouse") {
          openPicker();
        }
      }}
      onPointerLeave={(event) => {
        if (event.pointerType === "mouse") {
          scheduleClose();
        }
      }}
    >
      {pickerOpen ? (
        <div
          role="menu"
          aria-label="Choose a reaction"
          className="absolute bottom-full left-0 z-20 mb-1.5 flex select-none items-center gap-0.5 rounded-full border border-line bg-surface px-1.5 py-1 shadow-lg"
        >
          {REACTION_KINDS.map((kind) => {
            const { emoji, label } = REACTION_META[kind];
            const count = counts[kind];
            const selected = mine === kind;

            return (
              <button
                key={kind}
                type="button"
                role="menuitem"
                aria-label={`${label}${count > 0 ? `, ${count}` : ""}`}
                title={label}
                disabled={pending}
                onClick={() => handlePick(kind)}
                className={`relative grid size-8 select-none place-items-center rounded-full text-lg leading-none transition-transform hover:scale-110 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-orange-600 disabled:cursor-wait disabled:opacity-70 ${
                  selected ? "bg-orange-50 dark:bg-orange-950/40" : ""
                }`}
              >
                <span aria-hidden="true">{emoji}</span>
                {count > 0 ? (
                  <span
                    aria-hidden="true"
                    className="absolute -bottom-0.5 -right-0.5 grid h-4 min-w-4 place-items-center rounded-full bg-surface-muted px-1 text-[9px] font-bold leading-none text-muted"
                  >
                    {count > 9 ? "9+" : count}
                  </span>
                ) : null}
              </button>
            );
          })}
        </div>
      ) : null}

      <button
        type="button"
        onClick={handleClick}
        onPointerDown={handlePointerDown}
        onPointerUp={clearPressTimer}
        onPointerCancel={clearPressTimer}
        onPointerLeave={clearPressTimer}
        onContextMenu={(event) => event.preventDefault()}
        onKeyDown={(event) => {
          if (event.key === "ArrowUp" || event.key === "ArrowDown") {
            event.preventDefault();
            openPicker();
          }
        }}
        disabled={pending}
        aria-pressed={mine === "like"}
        aria-haspopup="menu"
        aria-expanded={pickerOpen}
        aria-label={
          current
            ? `${current.label} reaction${total > 0 ? `, ${total} total` : ""}`
            : "Like"
        }
        title="Click to like. Hover or hold for more reactions."
        className={`flex touch-manipulation select-none items-center gap-1 rounded-full border px-1.5 py-0.5 text-[11px] font-semibold transition-colors disabled:cursor-wait disabled:opacity-70 ${
          current
            ? "border-orange-700 bg-orange-50 text-orange-800 dark:border-orange-500 dark:bg-orange-950/40 dark:text-orange-300"
            : "border-line text-muted hover:bg-surface-muted hover:text-ink"
        }`}
      >
        <span aria-hidden="true" className="text-sm leading-none">
          {current?.emoji ?? "👍"}
        </span>
        <span>{current?.label ?? "Like"}</span>
        {total > 0 ? <span>{total}</span> : null}
      </button>
    </div>
  );
}
