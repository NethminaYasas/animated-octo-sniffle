import "server-only";

import { createClient } from "@supabase/supabase-js";

import { getSupabaseConfig } from "./config";
import type { Database } from "./types";

/**
 * Service-role client for server-only operations. It bypasses RLS, so never
 * import this module from a Client Component and never send the key to the
 * browser.
 */
export function createAdminClient() {
  const config = getSupabaseConfig();
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();

  if (!config || !serviceRoleKey) {
    return null;
  }

  return createClient<Database>(config.url, serviceRoleKey, {
    auth: {
      autoRefreshToken: false,
      detectSessionInUrl: false,
      persistSession: false,
    },
  });
}
