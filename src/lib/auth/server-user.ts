import "server-only";

import { isBanActive } from "@/lib/ban";
import { createClient } from "@/lib/supabase/server";
import type { UserRole } from "@/lib/roles";

export type ServerUser = {
  id: string;
  username: string;
  role: UserRole;
  isBanned: boolean;
  bannedUntil: string | null;
};

export type ServerSession = {
  supabase: Awaited<ReturnType<typeof createClient>>;
  user: ServerUser | null;
};

/**
 * Reads the current Supabase session and the member's authoritative profile.
 * Every server action re-checks these values; a client-supplied role or ban
 * flag is never trusted.
 */
export async function getServerSession(): Promise<ServerSession> {
  const supabase = await createClient();
  const { data: claimsData, error: claimsError } =
    await supabase.auth.getClaims();
  const id = String(claimsData?.claims.sub ?? "");

  if (claimsError || !id) {
    return { supabase, user: null };
  }

  const { data: profile, error: profileError } = await supabase
    .from("profiles")
    .select("username, role, is_banned, banned_until")
    .eq("id", id)
    .maybeSingle();

  if (profileError || !profile) {
    return { supabase, user: null };
  }

  return {
    supabase,
    user: {
      id,
      username: profile.username,
      role: profile.role,
      isBanned: isBanActive(profile.is_banned, profile.banned_until),
      bannedUntil: profile.banned_until,
    },
  };
}
