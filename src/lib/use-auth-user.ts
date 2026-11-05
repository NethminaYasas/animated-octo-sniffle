"use client";

import { useEffect, useState } from "react";

import { createClient } from "@/lib/supabase/client";

export type UserRole = "member" | "moderator" | "admin";

export type AuthUser = {
  id: string;
  email: string | null;
  username: string | null;
  role: UserRole;
  isBanned: boolean;
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

        setUser({
          id: authUser.id,
          email: authUser.email ?? null,
          username: null,
          role: "member",
          isBanned: false,
        });
        setLoading(false);

        supabase
          .from("profiles")
          .select("username, role, is_banned")
          .eq("id", authUser.id)
          .maybeSingle()
          .then(({ data }) => {
            if (active && data) {
              setUser({
                id: authUser.id,
                email: authUser.email ?? null,
                username: data.username,
                role: data.role,
                isBanned: data.is_banned,
              });
            }
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
