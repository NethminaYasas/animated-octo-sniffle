"use client";

import {
  useCallback,
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { CalendarDays, Shield, Sparkles } from "lucide-react";

import { normaliseUsername } from "@/lib/auth/validation";
import { createClient } from "@/lib/supabase/client";

type UserProfile = {
  username: string;
  avatar_url: string | null;
  role: "member" | "moderator" | "admin";
  reaction_score: number;
  created_at: string;
};

const CARD_WIDTH = 300;
const OPEN_DELAY_MS = 120;
const CLOSE_DELAY_MS = 180;
const VIEWPORT_MARGIN = 8;

/**
 * Profile lookups are public (see the profiles RLS policy), so the card can
 * fetch them straight from the browser. Cache the promise per username so
 * re-hovering never repeats a request.
 */
const profileCache = new Map<string, Promise<UserProfile | null>>();

function loadProfile(username: string): Promise<UserProfile | null> {
  const key = normaliseUsername(username);
  const cached = profileCache.get(key);

  if (cached) {
    return cached;
  }

  const request = (async () => {
    try {
      const supabase = createClient();
      const { data, error } = await supabase
        .from("profiles")
        .select("username, avatar_url, role, reaction_score, created_at")
        .eq("username", key)
        .maybeSingle();

      return error ? null : data;
    } catch {
      return null;
    }
  })();

  profileCache.set(key, request);
  return request;
}

function formatJoined(createdAt: string): string {
  const date = new Date(createdAt);

  if (Number.isNaN(date.getTime())) {
    return "—";
  }

  return date.toLocaleDateString("en-GB", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });
}

function formatScore(score: number): string {
  return score > 0 ? `+${score}` : String(score);
}

/**
 * Shows a small profile card when the wrapped username or avatar is hovered,
 * focused or tapped. The trigger content is passed as children; when omitted
 * the username itself is rendered.
 */
export function UserHoverCard({
  username,
  initial,
  className = "font-semibold text-ink underline-offset-2 hover:underline",
  children,
}: {
  username: string;
  initial?: string;
  className?: string;
  children?: ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const [profile, setProfile] = useState<UserProfile | null | undefined>(
    undefined,
  );
  const triggerRef = useRef<HTMLButtonElement>(null);
  const cardRef = useRef<HTMLDivElement>(null);
  const openTimerRef = useRef<number | null>(null);
  const closeTimerRef = useRef<number | null>(null);
  const cardId = useId();

  const clearOpenTimer = useCallback(() => {
    if (openTimerRef.current !== null) {
      window.clearTimeout(openTimerRef.current);
      openTimerRef.current = null;
    }
  }, []);

  const clearCloseTimer = useCallback(() => {
    if (closeTimerRef.current !== null) {
      window.clearTimeout(closeTimerRef.current);
      closeTimerRef.current = null;
    }
  }, []);

  const scheduleOpen = useCallback(() => {
    clearCloseTimer();

    if (open || openTimerRef.current !== null) {
      return;
    }

    openTimerRef.current = window.setTimeout(() => {
      openTimerRef.current = null;
      setOpen(true);
    }, OPEN_DELAY_MS);
  }, [clearCloseTimer, open]);

  const scheduleClose = useCallback(() => {
    clearOpenTimer();

    if (!open) {
      return;
    }

    clearCloseTimer();
    closeTimerRef.current = window.setTimeout(() => {
      closeTimerRef.current = null;
      setOpen(false);
    }, CLOSE_DELAY_MS);
  }, [clearCloseTimer, clearOpenTimer, open]);

  useEffect(() => {
    return () => {
      clearOpenTimer();
      clearCloseTimer();
    };
  }, [clearCloseTimer, clearOpenTimer]);

  useEffect(() => {
    if (!open) {
      return;
    }

    let active = true;

    loadProfile(username).then((result) => {
      if (active) {
        setProfile(result);
      }
    });

    return () => {
      active = false;
    };
  }, [open, username]);

  /**
   * Keep the card fixed to the viewport so it is never clipped by a scrolling
   * comment list. The card opens to the left of the trigger, aligned with its
   * top edge, and flips to the right only when the viewport has no room left.
   * Position through the DOM so measuring does not force an extra render.
   */
  const reposition = useCallback(() => {
    const trigger = triggerRef.current;
    const card = cardRef.current;

    if (!trigger || !card) {
      return;
    }

    const rect = trigger.getBoundingClientRect();
    const width = card.offsetWidth || CARD_WIDTH;
    const height = card.offsetHeight;
    const maxTop = Math.max(
      VIEWPORT_MARGIN,
      window.innerHeight - height - VIEWPORT_MARGIN,
    );
    const top = Math.min(Math.max(VIEWPORT_MARGIN, rect.top), maxTop);
    const maxRight = window.innerWidth - width - VIEWPORT_MARGIN;

    let left = rect.left - width - VIEWPORT_MARGIN;

    if (left < VIEWPORT_MARGIN) {
      const right = rect.right + VIEWPORT_MARGIN;
      left = right <= maxRight ? right : Math.max(VIEWPORT_MARGIN, maxRight);
    }

    card.style.left = `${left}px`;
    card.style.top = `${top}px`;
    card.style.visibility = "visible";
  }, []);

  useLayoutEffect(() => {
    if (open) {
      reposition();
    }
  }, [open, reposition]);

  useEffect(() => {
    if (!open) {
      return;
    }

    const handleViewportChange = () => reposition();
    const handlePointerDown = (event: PointerEvent) => {
      const target = event.target as Node;

      if (
        triggerRef.current?.contains(target) ||
        cardRef.current?.contains(target)
      ) {
        return;
      }

      setOpen(false);
    };
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setOpen(false);
      }
    };

    window.addEventListener("scroll", handleViewportChange, true);
    window.addEventListener("resize", handleViewportChange);
    document.addEventListener("pointerdown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);

    return () => {
      window.removeEventListener("scroll", handleViewportChange, true);
      window.removeEventListener("resize", handleViewportChange);
      document.removeEventListener("pointerdown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [open, reposition]);

  const displayName = username.trim();
  const fallbackInitial = (initial ?? displayName.slice(0, 1)).toUpperCase();
  const loading = profile === undefined;
  const role = profile?.role ?? "member";

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        aria-describedby={open ? cardId : undefined}
        onPointerEnter={(event) => {
          if (event.pointerType === "mouse") {
            scheduleOpen();
          }
        }}
        onPointerLeave={(event) => {
          if (event.pointerType === "mouse") {
            scheduleClose();
          }
        }}
        onFocus={scheduleOpen}
        onBlur={scheduleClose}
        onClick={() => {
          clearOpenTimer();
          setOpen((current) => !current);
        }}
        className={className}
      >
        {children ?? displayName}
      </button>

      {open ? (
        <div
          ref={cardRef}
          id={cardId}
          role="tooltip"
          onPointerEnter={(event) => {
            if (event.pointerType === "mouse") {
              clearCloseTimer();
            }
          }}
          onPointerLeave={(event) => {
            if (event.pointerType === "mouse") {
              scheduleClose();
            }
          }}
          className="fixed z-50 w-[300px] max-w-[calc(100vw-1rem)] rounded-xl border border-line bg-surface p-4 text-left shadow-xl"
          style={{ top: 0, left: 0, visibility: "hidden" }}
        >
          <div className="flex items-center gap-3">
            {profile?.avatar_url ? (
              // eslint-disable-next-line @next/next/no-img-element -- avatar URLs are user-provided
              <img
                src={profile.avatar_url}
                alt=""
                className="size-12 shrink-0 rounded-full object-cover"
              />
            ) : (
              <span
                aria-hidden="true"
                className="grid size-12 shrink-0 place-items-center rounded-full bg-orange-700 text-lg font-bold uppercase text-white"
              >
                {fallbackInitial}
              </span>
            )}

            <div className="min-w-0">
              <p className="truncate text-base font-bold text-ink">
                @{displayName}
              </p>
              {loading ? (
                <span className="mt-1 block h-3 w-14 animate-pulse rounded bg-surface-muted" />
              ) : (
                <span className="mt-1 inline-flex items-center gap-1 rounded-full bg-surface-muted px-2 py-0.5 text-[0.65rem] font-semibold capitalize text-muted">
                  <Shield className="size-3" aria-hidden="true" />
                  {role}
                </span>
              )}
            </div>
          </div>

          <div className="mt-3 grid grid-cols-2 gap-3 border-t border-line pt-3">
            <div>
              <p className="text-[0.65rem] font-semibold uppercase tracking-wide text-faint">
                Reaction score
              </p>
              <p className="mt-1 flex items-center gap-1 text-sm font-semibold text-ink">
                <Sparkles className="size-3.5 text-muted" aria-hidden="true" />
                {loading ? (
                  <span className="h-3 w-8 animate-pulse rounded bg-surface-muted" />
                ) : profile ? (
                  formatScore(profile.reaction_score)
                ) : (
                  "—"
                )}
              </p>
            </div>

            <div>
              <p className="text-[0.65rem] font-semibold uppercase tracking-wide text-faint">
                Joined
              </p>
              <p className="mt-1 flex items-center gap-1 text-sm text-ink">
                <CalendarDays className="size-3.5 text-muted" aria-hidden="true" />
                {loading ? (
                  <span className="h-3 w-16 animate-pulse rounded bg-surface-muted" />
                ) : profile ? (
                  formatJoined(profile.created_at)
                ) : (
                  "—"
                )}
              </p>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
