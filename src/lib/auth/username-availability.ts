import { createClient } from "@/lib/supabase/client";

import { normaliseUsername } from "./validation";

/**
 * Checks the public profiles table for a username. The database's UNIQUE
 * constraint remains the final gate; this only powers form feedback.
 *
 * Returns null when the check cannot run (Supabase not configured, offline),
 * so callers can fall back to letting the server action decide.
 */
export async function isUsernameAvailable(
  username: string,
  currentUserId?: string | null,
): Promise<boolean | null> {
  try {
    const supabase = createClient();
    const clean = normaliseUsername(username);

    const { data, error } = currentUserId
      ? await supabase
          .from("profiles")
          .select("id")
          .eq("username", clean)
          .neq("id", currentUserId)
          .limit(1)
      : await supabase
          .from("profiles")
          .select("id")
          .eq("username", clean)
          .limit(1);

    if (error) {
      return null;
    }

    return data.length === 0;
  } catch {
    return null;
  }
}
