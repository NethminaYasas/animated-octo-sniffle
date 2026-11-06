import "server-only";

import { createClient } from "@supabase/supabase-js";

import { isBanActive } from "@/lib/ban";
import type { UserRole } from "@/lib/roles";
import { getSupabaseConfig } from "@/lib/supabase/config";
import type { Database } from "@/lib/supabase/types";

export type BearerUser = {
  id: string;
  username: string;
  role: UserRole;
  isBanned: boolean;
};

/**
 * Validates an `Authorization: Bearer <access_token>` header against Supabase.
 * Returns null when the token is absent or invalid. Used by the upload route
 * so automated tests and future API clients can authenticate without the
 * browser session cookie; the same ban and role rules apply.
 */
export async function getBearerUser(
  authorization: string | null,
): Promise<BearerUser | null> {
  if (!authorization?.startsWith("Bearer ")) {
    return null;
  }

  const token = authorization.slice("Bearer ".length).trim();
  const config = getSupabaseConfig();

  if (!token || !config) {
    return null;
  }

  const client = createClient<Database>(config.url, config.anonKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const { data, error } = await client.auth.getUser(token);

  if (error || !data.user) {
    return null;
  }

  const { data: profile } = await client
    .from("profiles")
    .select("username, role, is_banned, banned_until")
    .eq("id", data.user.id)
    .maybeSingle();

  if (!profile) {
    return null;
  }

  return {
    id: data.user.id,
    username: profile.username,
    role: profile.role,
    isBanned: isBanActive(profile.is_banned, profile.banned_until),
  };
}
