import { getSupabaseConfig } from "./config";

export type SupabaseConnection =
  | { state: "connected" }
  | { state: "unconfigured" }
  | { state: "error"; message: string };

const CONNECTION_TIMEOUT_MS = 3_000;

/**
 * Makes a small, read-only request to the Supabase Auth settings endpoint.
 * It proves the project URL and public key are reachable without touching
 * application tables, which do not exist yet in step 1.
 */
export async function checkSupabaseConnection(): Promise<SupabaseConnection> {
  const config = getSupabaseConfig();

  if (!config) {
    return { state: "unconfigured" };
  }

  try {
    const response = await fetch(`${config.url}/auth/v1/settings`, {
      headers: {
        apikey: config.anonKey,
        Authorization: `Bearer ${config.anonKey}`,
      },
      cache: "no-store",
      signal: AbortSignal.timeout(CONNECTION_TIMEOUT_MS),
    });

    if (response.ok) {
      return { state: "connected" };
    }

    if (response.status === 401 || response.status === 403) {
      return {
        state: "error",
        message:
          "Supabase rejected the public key. Check NEXT_PUBLIC_SUPABASE_ANON_KEY in .env.local.",
      };
    }

    return {
      state: "error",
      message: `Supabase returned HTTP ${response.status}. Check NEXT_PUBLIC_SUPABASE_URL in .env.local.`,
    };
  } catch {
    return {
      state: "error",
      message:
        "Could not reach Supabase. Check your internet connection and the project URL.",
    };
  }
}
