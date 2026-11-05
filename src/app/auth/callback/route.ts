import { NextResponse, type NextRequest } from "next/server";

import { safeRedirectPath } from "@/lib/auth/redirect";
import { createClient } from "@/lib/supabase/server";

/**
 * Handles the code that Supabase puts on the redirect URL after an email
 * confirmation or password-recovery link. The session cookies are written by
 * the server client before we redirect.
 */
export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");
  const next = safeRedirectPath(searchParams.get("next"), origin, "/profile");

  if (code) {
    const supabase = await createClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);

    if (!error) {
      return NextResponse.redirect(new URL(next, origin));
    }
  }

  return NextResponse.redirect(new URL("/auth/auth-code-error", origin));
}
