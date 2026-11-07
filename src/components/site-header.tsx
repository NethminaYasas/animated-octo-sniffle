"use client";

import {
  Bell,
  LifeBuoy,
  LogIn,
  Search,
  Shield,
  UserPlus,
  UserRound,
} from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type FormEvent,
} from "react";

import { NotificationPanel } from "@/components/notification-panel";
import { ThemeToggle } from "@/components/theme-toggle";
import { useNotifications } from "@/lib/notifications";
import type { UserRole } from "@/lib/roles";
import { createClient } from "@/lib/supabase/client";

type SessionUser = {
  id: string;
  user_metadata?: Record<string, unknown>;
};

type HeaderUser = {
  id: string;
  name: string;
  avatarUrl: string | null;
  role: UserRole | null;
};

const ROLES = new Set<UserRole>([
  "new_member",
  "member",
  "senior_member",
  "moderator",
  "admin",
]);

function cleanRole(value: unknown): UserRole | null {
  return typeof value === "string" && ROLES.has(value as UserRole)
    ? (value as UserRole)
    : null;
}

// The header renders on the server before the session cookie is read, so on
// every refresh it starts without a member. Caching the last resolved member
// lets the first client render show the real name instead of a skeleton that
// is replaced a moment later.
//
// The version suffix discards caches written when the header fell back to the
// Google profile photo. Only profiles.avatar_url is a valid avatar source.
const HEADER_USER_KEY = "kaluwo:header-user:v3";
const LEGACY_HEADER_USER_KEY = "kaluwo:header-user";
const LEGACY_HEADER_USER_KEY_V2 = "kaluwo:header-user:v2";

function cleanAvatarUrl(value: unknown): string | null {
  return typeof value === "string" && value.trim() !== ""
    ? value.trim()
    : null;
}

function readCachedHeaderUser(): HeaderUser | null {
  try {
    window.localStorage.removeItem(LEGACY_HEADER_USER_KEY);
    window.localStorage.removeItem(LEGACY_HEADER_USER_KEY_V2);
    const raw = window.localStorage.getItem(HEADER_USER_KEY);
    if (!raw) {
      return null;
    }

    const parsed: unknown = JSON.parse(raw);

    if (
      parsed &&
      typeof parsed === "object" &&
      typeof (parsed as HeaderUser).id === "string" &&
      typeof (parsed as HeaderUser).name === "string"
    ) {
      return {
        id: (parsed as HeaderUser).id,
        name: (parsed as HeaderUser).name,
        avatarUrl: cleanAvatarUrl(
          (parsed as { avatarUrl?: unknown }).avatarUrl,
        ),
        role: cleanRole((parsed as { role?: unknown }).role),
      };
    }
  } catch {
    // An unreadable cache is ignored; the session is still the source of truth.
  }

  return null;
}

function writeCachedHeaderUser(user: HeaderUser | null) {
  try {
    if (user) {
      window.localStorage.setItem(HEADER_USER_KEY, JSON.stringify(user));
    } else {
      window.localStorage.removeItem(HEADER_USER_KEY);
    }
  } catch {
    // Best effort only.
  }
}

export function SiteHeader() {
  const router = useRouter();
  const pathname = usePathname();
  const [user, setUser] = useState<HeaderUser | null>(null);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const cachedUserRef = useRef<HeaderUser | null>(null);
  const [notificationsOpen, setNotificationsOpen] = useState(false);
  const notificationsButtonRef = useRef<HTMLButtonElement>(null);
  const [profileMenuOpen, setProfileMenuOpen] = useState(false);
  const profileMenuButtonRef = useRef<HTMLButtonElement>(null);
  const profileMenuRef = useRef<HTMLDivElement>(null);
  const [failedAvatarUrl, setFailedAvatarUrl] = useState<string | null>(null);
  const { notifications, unread, markRead, markAllRead } = useNotifications(
    user?.id ?? null,
  );
  const closeNotifications = useCallback(() => {
    setNotificationsOpen(false);
  }, []);
  const handleMarkAllRead = () => {
    void markAllRead();
  };
  const handleOpenNotification = (id: number) => {
    void markRead(id);
  };

  useEffect(() => {
    if (!profileMenuOpen) {
      return;
    }

    const handlePointerDown = (event: MouseEvent) => {
      const target = event.target as Node;

      if (
        profileMenuRef.current?.contains(target) ||
        profileMenuButtonRef.current?.contains(target)
      ) {
        return;
      }

      setProfileMenuOpen(false);
    };

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setProfileMenuOpen(false);
        profileMenuButtonRef.current?.focus();
      }
    };

    document.addEventListener("mousedown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);

    return () => {
      document.removeEventListener("mousedown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [profileMenuOpen]);

  useEffect(() => {
    let active = true;
    let unsubscribe: (() => void) | undefined;

    // Show the last member this browser saw while the session loads. The
    // session still wins, so an expired cookie falls back to logged-out.
    const cachedUser = readCachedHeaderUser();
    if (cachedUser) {
      cachedUserRef.current = cachedUser;
      // eslint-disable-next-line react-hooks/set-state-in-effect -- avoid the skeleton flash on refresh
      setUser((current) => current ?? cachedUser);
    }

    try {
      const supabase = createClient();

      const applyUser = (authUser: SessionUser | null) => {
        if (!active) {
          return;
        }

        if (!authUser) {
          setUser(null);
          setNotificationsOpen(false);
          setProfileMenuOpen(false);
          setLoading(false);
          return;
        }

        const metadataName =
          typeof authUser.user_metadata?.username === "string"
            ? authUser.user_metadata.username
            : null;

        // Keep the existing name when the same member re-emits an auth event
        // (Supabase refreshes the token when the browser tab regains focus).
        // The cached name is preferred over metadata so a suffix the trigger
        // appended does not flash before the canonical value arrives.
        setUser((current) => {
          if (current && current.id === authUser.id) {
            return current;
          }

          const cached = cachedUserRef.current;

          if (cached && cached.id === authUser.id) {
            return cached;
          }

          return {
            id: authUser.id,
            name: metadataName ?? "member",
            avatarUrl: null,
            role: null,
          };
        });
        setLoading(false);

        // The trigger may have appended a suffix to the requested username.
        // Read the canonical username, profile avatar and live role. Google is
        // only used to verify the account, so its photo is never used here.
        supabase
          .from("profiles")
          .select("username, avatar_url, role")
          .eq("id", authUser.id)
          .maybeSingle()
          .then(({ data }) => {
            if (!active || !data?.username) {
              return;
            }

            setUser((current) => {
              if (!current || current.id !== authUser.id) {
                return current;
              }

              const avatarUrl = cleanAvatarUrl(data.avatar_url);

              if (
                current.name === data.username &&
                current.avatarUrl === avatarUrl &&
                current.role === data.role
              ) {
                return current;
              }

              return {
                ...current,
                name: data.username,
                avatarUrl,
                role: data.role,
              };
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
      // Auth is unavailable, so stop the skeleton.
      setLoading(false);
    }

    return () => {
      active = false;
      unsubscribe?.();
    };
  }, [pathname]);

  // Persist the resolved member so the next refresh can paint the real name
  // immediately. Logging out clears the entry.
  useEffect(() => {
    if (!loading) {
      writeCachedHeaderUser(user);
    }
  }, [loading, user]);

  const handleSearch = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const query = searchQuery.trim();
    router.push(query ? `/search?q=${encodeURIComponent(query)}` : "/search");
  };

  const avatarUrl =
    user?.avatarUrl && user.avatarUrl !== failedAvatarUrl
      ? user.avatarUrl
      : null;
  const avatarInitial = user?.name.slice(0, 1).toUpperCase() ?? "?";

  return (
    <header className="sticky top-0 z-30 shrink-0 border-b border-line bg-surface">
      <div className="relative mx-auto flex h-14 max-w-[90rem] items-center gap-3 px-3 sm:px-4">
        <Link
          aria-label="kaluwo home"
          className="flex shrink-0 items-center"
          href="/"
        >
          <Image
            src="/logo.png"
            alt="kaluwo"
            width={1084}
            height={238}
            loading="eager"
            className="h-7 w-auto invert dark:invert-0"
          />
        </Link>

        {/* Below xl the bar sits in the flex row (its left edge is pinned to
            the logo). From xl up it is centred against the header itself, so
            auth controls loading in never nudges it sideways. */}
        <div className="hidden min-w-0 flex-1 md:flex xl:pointer-events-none xl:absolute xl:left-1/2 xl:w-[32rem] xl:-translate-x-1/2">
          <form
            role="search"
            onSubmit={handleSearch}
            className="pointer-events-auto flex h-9 w-full max-w-lg items-center gap-2 rounded-full border border-line bg-surface-muted px-3 text-sm text-muted transition-colors focus-within:border-orange-700/40 focus-within:bg-surface focus-within:text-ink dark:focus-within:border-orange-500/40"
          >
            <Search className="size-4 shrink-0" aria-hidden="true" />
            <input
              type="search"
              value={searchQuery}
              onChange={(event) => setSearchQuery(event.target.value)}
              placeholder="Search kaluwo"
              aria-label="Search kaluwo"
              enterKeyHint="search"
              className="min-w-0 flex-1 bg-transparent text-sm text-ink placeholder:text-muted focus:outline-none"
            />
          </form>
        </div>

        <div className="ml-auto flex shrink-0 items-center justify-end gap-2 md:w-[15rem] xl:w-auto">
          <Link
            href="/search"
            aria-label="Search kaluwo"
            title="Search"
            className="grid size-8 place-items-center rounded-full border border-line text-muted transition-colors hover:bg-surface-muted hover:text-ink md:hidden"
          >
            <Search className="size-4" />
          </Link>
          <ThemeToggle />

          {loading && !user ? (
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
                  onClick={() => {
                    setNotificationsOpen((open) => !open);
                    setProfileMenuOpen(false);
                  }}
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
              <div className="relative">
                <button
                  ref={profileMenuButtonRef}
                  type="button"
                  onClick={() => {
                    setProfileMenuOpen((open) => !open);
                    setNotificationsOpen(false);
                  }}
                  aria-expanded={profileMenuOpen}
                  aria-controls="profile-menu"
                  aria-haspopup="menu"
                  aria-label={`Open account menu for @${user.name}`}
                  title={`@${user.name}`}
                  className="block size-8 shrink-0 overflow-hidden rounded-full border border-line transition-colors hover:border-orange-700/50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-orange-600 dark:hover:border-orange-500/50"
                >
                  {avatarUrl ? (
                    // Stored avatar URLs are user-provided and may be external.
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={avatarUrl}
                      alt=""
                      className="size-full object-cover"
                      onError={() => setFailedAvatarUrl(avatarUrl)}
                    />
                  ) : (
                    <span className="grid size-full place-items-center bg-orange-700 text-sm font-bold text-white">
                      {avatarInitial}
                    </span>
                  )}
                </button>

                {profileMenuOpen ? (
                  <div
                    ref={profileMenuRef}
                    id="profile-menu"
                    role="menu"
                    aria-label="Account menu"
                    className="absolute right-0 top-full z-50 mt-2 w-44 overflow-hidden rounded-xl border border-line bg-surface py-1 shadow-xl"
                  >
                    <Link
                      role="menuitem"
                      href="/profile"
                      onClick={() => setProfileMenuOpen(false)}
                      className="flex items-center gap-2 px-3 py-2 text-sm font-medium text-body transition-colors hover:bg-surface-muted hover:text-ink"
                    >
                      <UserRound className="size-4" />
                      Profile
                    </Link>
                    {user.role === "moderator" || user.role === "admin" ? (
                      <Link
                        role="menuitem"
                        href="/moderation"
                        onClick={() => setProfileMenuOpen(false)}
                        className="flex items-center gap-2 px-3 py-2 text-sm font-medium text-body transition-colors hover:bg-surface-muted hover:text-ink"
                      >
                        <Shield className="size-4" />
                        Moderation
                      </Link>
                    ) : null}
                    <Link
                      role="menuitem"
                      href="/support"
                      onClick={() => setProfileMenuOpen(false)}
                      className="flex items-center gap-2 px-3 py-2 text-sm font-medium text-body transition-colors hover:bg-surface-muted hover:text-ink"
                    >
                      <LifeBuoy className="size-4" />
                      Support
                    </Link>
                  </div>
                ) : null}
              </div>
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
