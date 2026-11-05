export type SupabaseConfig = {
  url: string;
  anonKey: string;
};

/**
 * Reads the public Supabase settings from the environment.
 * Returns null when either value is missing so the UI can show a friendly
 * setup message instead of crashing.
 */
export function getSupabaseConfig(): SupabaseConfig | null {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim();

  if (!url || !anonKey) {
    return null;
  }

  return {
    url: url.replace(/\/+$/, ""),
    anonKey,
  };
}
