import { normaliseUsername } from "@/lib/auth/validation";
import { createClient } from "@/lib/supabase/client";
import type { UserRole } from "@/lib/roles";

export type UserProfile = {
  username: string;
  avatar_url: string | null;
  role: UserRole;
  reaction_score: number;
  created_at: string;
};

/**
 * Profile lookups are public (see the profiles RLS policy), so the UI can
 * fetch them straight from the browser. Cache the promise per username so
 * repeated renders and hover cards never repeat a request.
 */
const profileCache = new Map<string, Promise<UserProfile | null>>();

export function loadProfile(username: string): Promise<UserProfile | null> {
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
  void request.then((result) => {
    if (result === null) {
      profileCache.delete(key);
    }
  });

  return request;
}
