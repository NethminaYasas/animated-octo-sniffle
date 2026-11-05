"use client";

import { Bell, LogIn, Search, UserPlus, UserRound } from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";

import { LogoutButton } from "@/components/logout-button";
import { NotificationPanel } from "@/components/notification-panel";
import { ThemeToggle } from "@/components/theme-toggle";
import {
  markAllNotificationsRead,
  markNotificationRead,
  useNotifications,
} from "@/lib/notifications";
import { createClient } from "@/lib/supabase/client";

type SessionUser = {
  id: string;
  email?: string | null;
  user_metadata?: Record<string, unknown>;
};

type HeaderUser = {
  id: string;
  name: string;
};

export function SiteHeader() {
  const [user, setUser] = useState<HeaderUser | null>(null);
  const [loading, setLoading] = useState(true);
  const [notificationsOpen, setNotificationsOpen] = useState(false);
  const notificationsButtonRef = useRef<HTMLButtonElement>(null);
  const notifications = useNotifications(user?.name ?? null);
  const unread = notifications.reduce(
    (count, notification) => count + (notification.read ? 0 : 1),
    0,
  );
  const closeNotifications = useCallback(() => {
    setNotificationsOpen(false);
  }, []);
  const handleMarkAllRead = () => {
    if (user?.name) {
      markAllNotificationsRead(user.name);
    }
  };
  const handleOpenNotification = (id: string) => {
    markNotificationRead(id);
  };

  useEffect(() => {
    let active = true;
    let unsubscribe: (() => void) | undefined;

    try {
      const supabase = createClient();

      const applyUser = (authUser: SessionUser | null) => {
        if (!active) {
          return;
        }

        if (!authUser) {
          setUser(null);
          setNotificationsOpen(false);
          setLoading(false);
          return;
        }

        const metadataName =
          typeof authUser.user_metadata?.username === "string"
            ? authUser.user_metadata.username
            : null;
        const fallbackName = authUser.email?.split("@")[0] ?? "member";

        // Keep the existing name when the same member re-emits an auth event
        // (Supabase refreshes the token when the browser tab regains focus).
        // Re-seeding from metadata would briefly swap the displayed username
        // and make the header flicker.
        setUser((current) =>
          current && current.id === authUser.id
            ? current
            : { id: authUser.id, name: metadataName ?? fallbackName },
        );
        setLoading(false);

        // The trigger may have appended a suffix to the requested username.
        // Read the canonical value from profiles when it is available.
        supabase
          .from("profiles")
          .select("username")
          .eq("id", authUser.id)
          .maybeSingle()
          .then(({ data }) => {
            if (!active || !data?.username) {
              return;
            }

            setUser((current) => {
              if (!current || current.name === data.username) {
                return current;
              }

              return { id: authUser.id, name: data.username };
            });
          });
      };

      // getSession reads the cookie the proxy refreshed for this request.
      // getUser() would make a network call on every mount and can briefly
      // report a logged-out user while a token refresh is in flight.
      supabase.auth
        .getSession()
        .then(({ data }) => applyUser(data.session?.user ?? null));

      const { data: subscription } = supabase.auth.onAuthStateChange(
        (_event, session) => {
          applyUser(session?.user ?? null);
        },
      );

      unsubscribe = () => subscription.subscription.unsubscribe();
    } catch {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- auth is unavailable, so stop the skeleton
      setLoading(false);
    }

    return () => {
      active = false;
      unsubscribe?.();
    };
  }, []);

  return (
    <header className="sticky top-0 z-30 shrink-0 border-b border-line bg-surface">
      <div className="mx-auto flex h-14 max-w-5xl items-center gap-3 px-3 sm:px-4">
        <Link
          aria-label="kaluwo home"
          className="flex shrink-0 items-center gap-2"
          href="/"
        >
          <span className="grid size-8 place-items-center rounded-full bg-orange-700 text-sm font-bold text-white">
            k
          </span>
          <span className="text-xl font-bold tracking-tight text-ink">
            kaluwo
          </span>
        </Link>

        <div className="ml-auto hidden min-w-0 flex-1 justify-center px-4 md:flex">
          <div className="flex h-9 w-full max-w-lg items-center gap-2 rounded-full border border-line bg-surface-muted px-3 text-sm text-muted">
            <Search className="size-4 shrink-0" />
            <span className="truncate">Search kaluwo</span>
            <span className="ml-auto shrink-0 text-[0.65rem] font-semibold uppercase tracking-wide text-faint">
              Soon
            </span>
          </div>
        </div>

        <div className="ml-auto flex shrink-0 items-center gap-2">
          <ThemeToggle />

          {loading ? (
            <span
              aria-hidden="true"
              className="h-8 w-24 animate-pulse rounded-full bg-surface-muted"
            />
          ) : user ? (
            <>
              <div className="relative">
                <button
                  ref={notificationsButtonRef}
                  type="button"
                  onClick={() => setNotificationsOpen((open) => !open)}
                  aria-expanded={notificationsOpen}
                  aria-controls="notification-panel"
                  aria-label={
                    unread > 0
                      ? `Notifications, ${unread} unread`
                      : "Notifications"
                  }
                  title="Notifications"
                  className="relative grid size-8 place-items-center rounded-full border border-line text-muted transition-colors hover:bg-surface-muted hover:text-ink"
                >
                  <Bell className="size-4" />
                  {unread > 0 ? (
                    <span
                      aria-hidden="true"
                      className="absolute -right-1 -top-1 grid h-4 min-w-4 place-items-center rounded-full bg-orange-700 px-1 text-[9px] font-bold leading-none text-white"
                    >
                      {unread > 9 ? "9+" : unread}
                    </span>
                  ) : null}
                </button>

                {notificationsOpen ? (
                  <NotificationPanel
                    notifications={notifications}
                    onClose={closeNotifications}
                    onMarkAllRead={handleMarkAllRead}
                    onOpen={handleOpenNotification}
                    triggerRef={notificationsButtonRef}
                  />
                ) : null}
              </div>
              <Link
                className="flex items-center gap-1.5 rounded-full border border-line px-3 py-1.5 text-xs font-semibold text-ink transition-colors hover:bg-surface-muted"
                href="/profile"
                title={`@${user.name}`}
              >
                <UserRound className="size-3.5" />
                <span className="hidden max-w-24 truncate sm:inline">
                  @{user.name}
                </span>
              </Link>
              <LogoutButton compact />
            </>
          ) : (
            <>
              <Link
                className="hidden items-center gap-1.5 rounded-full border border-orange-700 px-3 py-1.5 text-xs font-semibold text-orange-700 hover:bg-orange-50 sm:flex dark:border-orange-500 dark:text-orange-400 dark:hover:bg-orange-950/30"
                href="/login"
              >
                <LogIn className="size-3.5" />
                Log in
              </Link>
              <Link
                className="flex items-center gap-1.5 rounded-full bg-orange-700 px-3 py-1.5 text-xs font-semibold text-white hover:bg-orange-800"
                href="/signup"
              >
                <UserPlus className="size-3.5" />
                Sign up
              </Link>
            </>
          )}
        </div>
      </div>
    </header>
  );
}
