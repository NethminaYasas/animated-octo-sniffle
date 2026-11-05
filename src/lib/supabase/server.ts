import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

import { getSupabaseConfig } from "./config";
import type { Database } from "./types";

/**
 * Creates a Supabase client for Server Components, Server Actions and Route
 * Handlers. A new client is created for every request so it reads that
 * request's auth cookies.
 */
export async function createClient() {
  const config = getSupabaseConfig();

  if (!config) {
    throw new Error(
      "Supabase is not configured. Add NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY to .env.local.",
    );
  }

  const cookieStore = await cookies();

  return createServerClient<Database>(config.url, config.anonKey, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        try {
          cookiesToSet.forEach(({ name, value, options }) => {
            cookieStore.set(name, value, options);
          });
        } catch {
          // Server Components cannot write cookies. The root proxy refreshes
          // the session before the request reaches them.
        }
      },
    },
  });
}
