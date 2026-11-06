"use client";

import { useEffect, useState } from "react";

import { isBanActive } from "@/lib/ban";
import { createClient } from "@/lib/supabase/client";
import type { UserRole } from "@/lib/roles";

export type { UserRole } from "@/lib/roles";

export type AuthUser = {
  id: string;
  email: string | null;
  username: string | null;
  role: UserRole;
  isBanned: boolean;
  bannedUntil: string | null;
};

/**
 * Client-side auth state for the local posting prototype. When posting moves
 * to Supabase, the insert policies still enforce auth.uid() on the server.
 */
export function useAuthUser() {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    let unsubscribe: (() => void) | undefined;

    try {
      const supabase = createClient();

      const applyUser = (
        authUser: { id: string; email?: string | null } | null,
      ) => {
        if (!active) {
          return;
        }

        if (!authUser) {
          setUser(null);
          setLoading(false);
          return;
        }

        setUser((current) =>
          current && current.id === authUser.id
            ? current
            : {
                id: authUser.id,
                email: authUser.email ?? null,
                username: null,
                role: "new_member",
                isBanned: false,
                bannedUntil: null,
              },
        );
        setLoading(false);

        supabase
          .from("profiles")
          .select("username, role, is_banned, banned_until")
          .eq("id", authUser.id)
          .maybeSingle()
          .then(({ data }) => {
            if (!active || !data) {
              return;
            }

            const isBanned = isBanActive(
              data.is_banned,
              data.banned_until,
            );

            setUser((current) => {
              if (!current || current.id !== authUser.id) {
                return current;
              }

              if (
                current.username === data.username &&
                current.role === data.role &&
                current.isBanned === isBanned &&
                current.bannedUntil === data.banned_until
              ) {
                return current;
              }

              return {
                ...current,
                username: data.username,
                role: data.role,
                isBanned,
                bannedUntil: data.banned_until,
              };
            });
          });
      };

      // The proxy refreshes the session before the page renders. Read the
      // resulting cookie instead of starting a second refresh from the client,
      // which can race with the proxy and sign the member out.
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
      queueMicrotask(() => {
        if (active) {
          setLoading(false);
        }
      });
    }

    return () => {
      active = false;
      unsubscribe?.();
    };
  }, []);

  return { user, loading };
}
