"use client";

import { useState } from "react";

import { AuthMessage } from "@/components/auth-message";
import { createClient } from "@/lib/supabase/client";

function GoogleMark() {
  return (
    <svg aria-hidden="true" className="size-4" viewBox="0 0 24 24">
      <path
        d="M21.6 12.23c0-.71-.06-1.4-.18-2.07H12v3.92h5.38a4.6 4.6 0 0 1-2 3.02v2.51h3.24c1.9-1.75 2.98-4.33 2.98-7.38Z"
        fill="#4285F4"
      />
      <path
        d="M12 22c2.7 0 4.96-.9 6.62-2.39l-3.24-2.51c-.9.6-2.05.96-3.38.96-2.6 0-4.8-1.76-5.59-4.12H3.06v2.59A10 10 0 0 0 12 22Z"
        fill="#34A853"
      />
      <path
        d="M6.41 13.94A6 6 0 0 1 6.1 12c0-.67.11-1.33.31-1.94V7.47H3.06A10 10 0 0 0 2 12c0 1.61.39 3.14 1.06 4.53l3.35-2.59Z"
        fill="#FBBC05"
      />
      <path
        d="M12 5.94c1.47 0 2.79.5 3.82 1.49l2.87-2.87A9.6 9.6 0 0 0 12 2a10 10 0 0 0-8.94 5.47l3.35 2.59C7.2 7.7 9.4 5.94 12 5.94Z"
        fill="#EA4335"
      />
    </svg>
  );
}

export function GoogleAuthButton({
  label = "Continue with Google",
  next = "/profile",
}: {
  label?: string;
  next?: string;
}) {
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const handleClick = async () => {
    setError(null);
    setLoading(true);

    try {
      const supabase = createClient();
      const redirectTo = `${window.location.origin}/auth/callback?next=${encodeURIComponent(next)}`;

      const { error: oauthError } = await supabase.auth.signInWithOAuth({
        provider: "google",
        options: { redirectTo },
      });

      if (oauthError) {
        setError(oauthError.message);
        setLoading(false);
      }
    } catch {
      setError("Could not reach Supabase. Check your connection and try again.");
      setLoading(false);
    }
  };

  return (
    <div className="space-y-2">
      {error ? <AuthMessage tone="error">{error}</AuthMessage> : null}

      <button
        className="flex w-full items-center justify-center gap-2 rounded-full border border-line bg-surface px-4 py-2.5 text-sm font-semibold text-ink transition-colors hover:bg-surface-muted focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-orange-600 disabled:cursor-not-allowed disabled:opacity-60"
        disabled={loading}
        onClick={handleClick}
        type="button"
      >
        <GoogleMark />
        {loading ? "Redirecting to Google..." : label}
      </button>
    </div>
  );
}
