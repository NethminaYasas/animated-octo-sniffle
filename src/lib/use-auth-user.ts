"use client";

import { useEffect, useState } from "react";

import { createClient } from "@/lib/supabase/client";

export type AuthUser = {
  id: string;
  email: string | null;
  username: string | null;
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
        });
        setLoading(false);

        supabase
          .from("profiles")
          .select("username")
          .eq("id", authUser.id)
          .maybeSingle()
          .then(({ data }) => {
            if (active && data?.username) {
              setUser({
                id: authUser.id,
                email: authUser.email ?? null,
                username: data.username,
              });
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
