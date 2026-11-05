import { createBrowserClient } from "@supabase/ssr";

import { getSupabaseConfig } from "./config";
import type { Database } from "./types";

/**
 * Creates the Supabase client for Client Components.
 * createBrowserClient reuses a single instance in the browser.
 */
export function createClient() {
  const config = getSupabaseConfig();

  if (!config) {
    throw new Error(
      "Supabase is not configured. Add NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY to .env.local.",
    );
  }

  return createBrowserClient<Database>(config.url, config.anonKey);
}
