"use client";

import Link from "next/link";
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
import { createClient } from "@/lib/supabase/client";

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

type Reactor = {
  userId: string;
  username: string;
  avatarUrl: string | null;
  kind: ReactionKind;
};

/**
 * Loads who reacted to a post. Reactions and profiles are public reads, so
 * the list comes straight from the browser like `loadProfile()`. Only safe
 * columns are requested (username/avatar).
 */
async function loadReactors(postId: number): Promise<Reactor[]> {
  try {
    const supabase = createClient();
    const { data, error } = await supabase
      .from("reactions")
      .select(
        "kind, user_id, created_at, profiles:profiles!reactions_user_id_fkey(username, avatar_url)",
      )
      .eq("post_id", postId)
      .order("created_at", { ascending: false })
      .limit(200);

    if (error || !data) {
      return [];
    }

    return (data as unknown as Array<{
      kind: ReactionKind;
      user_id: string;
      profiles?: { username?: string | null; avatar_url?: string | null } | null;
    }>)
      .filter((row) => row.profiles?.username)
      .map((row) => ({
        userId: row.user_id,
        username: row.profiles!.username as string,
        avatarUrl: row.profiles?.avatar_url ?? null,
        kind: row.kind,
      }));
  } catch {
    return [];
  }
}

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
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [detailsTab, setDetailsTab] = useState<ReactionKind | "all">("all");
  const [reactors, setReactors] = useState<Reactor[] | null>(null);
  const [loadingReactors, setLoadingReactors] = useState(false);

  const isOwn = currentUserId !== null && authorId === currentUserId;
  const canReact = Boolean(currentUserId && !isOwn);
  const total = reactionTotal(counts);
  const current = mine ? REACTION_META[mine] : null;

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

  if (!canReact && total === 0) {
    return null;
  }

  if (!canReact && total > 0) {
    return (
      <ReactionDetails
        postId={postId}
        counts={counts}
        open={detailsOpen}
        tab={detailsTab}
        reactors={reactors}
        loading={loadingReactors}
        onOpen={(tab) => {
          setDetailsTab(tab);
          setDetailsOpen(true);
          if (reactors === null) {
            setLoadingReactors(true);
            void loadReactors(postId).then((rows) => {
              setReactors(rows);
              setLoadingReactors(false);
            });
          }
        }}
        onTabChange={setDetailsTab}
        onClose={() => setDetailsOpen(false)}
      />
    );
  }

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

  const loadDetails = (tab: ReactionKind | "all") => {
    setDetailsTab(tab);
    setDetailsOpen(true);
    if (reactors === null) {
      setLoadingReactors(true);
      void loadReactors(postId).then((rows) => {
        setReactors(rows);
        setLoadingReactors(false);
      });
    }
  };

  return (
    <div ref={wrapperRef} className="relative flex flex-wrap items-center gap-1.5">
      <div
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
      </button>
      </div>
      <ReactionDetails
        postId={postId}
        counts={counts}
        open={detailsOpen}
        tab={detailsTab}
        reactors={reactors}
        loading={loadingReactors}
        onOpen={loadDetails}
        onTabChange={setDetailsTab}
        onClose={() => setDetailsOpen(false)}
      />
    </div>
  );
}

function ReactionDetails({
  counts,
  open,
  tab,
  reactors,
  loading,
  onOpen,
  onTabChange,
  onClose,
}: {
  postId: number;
  counts: ReactionCounts;
  open: boolean;
  tab: ReactionKind | "all";
  reactors: Reactor[] | null;
  loading: boolean;
  onOpen: (tab: ReactionKind | "all") => void;
  onTabChange: (tab: ReactionKind | "all") => void;
  onClose: () => void;
}) {
  const total = reactionTotal(counts);
  const activeKinds = REACTION_KINDS.filter((kind) => counts[kind] > 0);

  useEffect(() => {
    if (!open) {
      return;
    }
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        onClose();
      }
    };
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [open, onClose]);

  if (total === 0) {
    return null;
  }

  const visible =
    reactors === null
      ? []
      : tab === "all"
        ? reactors
        : reactors.filter((reactor) => reactor.kind === tab);

  return (
    <>
      <div className="flex flex-wrap items-center gap-1">
        {activeKinds.map((kind) => {
          const meta = REACTION_META[kind];
          return (
            <button
              key={kind}
              type="button"
              onClick={() => onOpen(kind)}
              aria-label={`Show who reacted with ${meta.label.toLowerCase()} (${counts[kind]})`}
              title={`${meta.label} · ${counts[kind]}`}
              className="flex items-center gap-1 rounded-full border border-line bg-surface px-2 py-0.5 text-[11px] font-semibold text-body transition-colors hover:bg-surface-muted hover:text-ink"
            >
              <span aria-hidden="true" className="text-sm leading-none">
                {meta.emoji}
              </span>
              <span>{counts[kind]}</span>
            </button>
          );
        })}
      </div>

      {open ? (
        <div
          className="fixed inset-0 z-50 grid place-items-center bg-black/40 p-4"
          role="presentation"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) {
              onClose();
            }
          }}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-label="Who reacted"
            className="flex max-h-[80vh] w-full max-w-md flex-col overflow-hidden rounded-xl border border-line bg-surface shadow-xl"
          >
            <div
              role="tablist"
              aria-label="Reactions"
              className="flex items-center gap-1 overflow-x-auto border-b border-line bg-surface-muted px-2 py-1.5"
            >
              <button
                type="button"
                role="tab"
                aria-selected={tab === "all"}
                onClick={() => onTabChange("all")}
                className={`shrink-0 rounded-full px-3 py-1.5 text-xs font-semibold transition-colors ${
                  tab === "all"
                    ? "bg-surface text-ink shadow-sm"
                    : "text-muted hover:text-ink"
                }`}
              >
                All {total}
              </button>
              {activeKinds.map((kind) => {
                const meta = REACTION_META[kind];
                return (
                  <button
                    key={kind}
                    type="button"
                    role="tab"
                    aria-selected={tab === kind}
                    onClick={() => onTabChange(kind)}
                    aria-label={`${meta.label}, ${counts[kind]}`}
                    className={`flex shrink-0 items-center gap-1 rounded-full px-3 py-1.5 text-xs font-semibold transition-colors ${
                      tab === kind
                        ? "bg-surface text-ink shadow-sm"
                        : "text-muted hover:text-ink"
                    }`}
                  >
                    <span aria-hidden="true">{meta.emoji}</span>
                    {counts[kind]}
                  </button>
                );
              })}
              <button
                type="button"
                onClick={onClose}
                aria-label="Close"
                className="ml-auto grid size-7 shrink-0 place-items-center rounded-full text-muted hover:bg-surface hover:text-ink"
              >
                ×
              </button>
            </div>

            <div role="tabpanel" className="min-h-0 overflow-y-auto p-2">
              {loading || reactors === null ? (
                <p className="px-2 py-8 text-center text-sm text-muted">
                  Loading…
                </p>
              ) : visible.length === 0 ? (
                <p className="px-2 py-8 text-center text-sm text-muted">
                  No one has reacted yet.
                </p>
              ) : (
                <ul className="divide-y divide-line">
                  {visible.map((reactor) => {
                    const meta = REACTION_META[reactor.kind];
                    return (
                      <li key={reactor.userId}>
                        <Link
                          href={`/profile/${encodeURIComponent(reactor.username)}`}
                          onClick={onClose}
                          className="flex items-center gap-2.5 px-2 py-2 transition-colors hover:bg-surface-muted"
                        >
                          {reactor.avatarUrl ? (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img
                              src={reactor.avatarUrl}
                              alt=""
                              className="size-8 shrink-0 rounded-full object-cover"
                            />
                          ) : (
                            <span className="grid size-8 shrink-0 place-items-center rounded-full bg-orange-700 text-xs font-bold text-white">
                              {reactor.username.slice(0, 1).toUpperCase()}
                            </span>
                          )}
                          <span className="min-w-0 flex-1 truncate text-sm font-semibold text-ink">
                            @{reactor.username}
                          </span>
                          <span aria-hidden="true" title={meta.label}>
                            {meta.emoji}
                          </span>
                        </Link>
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
