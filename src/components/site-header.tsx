"use client";

import { LogIn, Search, UserPlus, UserRound } from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";

import { LogoutButton } from "@/components/logout-button";
import { ThemeToggle } from "@/components/theme-toggle";
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
          setLoading(false);
          return;
        }

        const metadataName =
          typeof authUser.user_metadata?.username === "string"
            ? authUser.user_metadata.username
            : null;
        const fallbackName = authUser.email?.split("@")[0] ?? "member";

        setUser({ id: authUser.id, name: metadataName ?? fallbackName });
        setLoading(false);

        // The trigger may have appended a suffix to the requested username.
        // Read the canonical value from profiles when it is available.
        supabase
          .from("profiles")
          .select("username")
          .eq("id", authUser.id)
          .maybeSingle()
          .then(({ data }) => {
            if (active && data?.username) {
              setUser({ id: authUser.id, name: data.username });
            }
          });
      };

      supabase.auth.getUser().then(({ data }) => applyUser(data.user));

      const { data: subscription } = supabase.auth.onAuthStateChange(
        (_event, session) => {
          applyUser(session?.user ?? null);
        },
      );

      unsubscribe = () => subscription.subscription.unsubscribe();
    } catch {
      setLoading(false);
    }

    return () => {
      active = false;
      unsubscribe?.();
    };
  }, []);

  return (
    <header className="sticky top-0 z-30 border-b border-line bg-surface">
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
            <span className="ml-auto shrink-0 text-[10px] font-semibold uppercase tracking-wide text-faint">
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
              <Link
                className="flex items-center gap-1.5 rounded-full border border-line px-3 py-1.5 text-xs font-semibold text-ink transition-colors hover:bg-surface-muted"
                href="/profile"
                title={`@${user.name}`}
              >
                <UserRound className="size-3.5" />
                <span className="max-w-24 truncate">@{user.name}</span>
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
