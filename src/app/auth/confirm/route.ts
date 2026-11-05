import type { EmailOtpType } from "@supabase/supabase-js";
import { NextResponse, type NextRequest } from "next/server";

import { safeRedirectPath } from "@/lib/auth/redirect";
import { createClient } from "@/lib/supabase/server";

/**
 * Alternative email-confirmation handler for projects that use
 * {{ .TokenHash }} in their Supabase email templates. See supabase/README.md.
 */
export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url);
  const tokenHash = searchParams.get("token_hash");
  const type = searchParams.get("type") as EmailOtpType | null;
  const next = safeRedirectPath(searchParams.get("next"), origin, "/profile");

  if (tokenHash && type) {
    const supabase = await createClient();
    const { error } = await supabase.auth.verifyOtp({
      type,
      token_hash: tokenHash,
    });

    if (!error) {
      return NextResponse.redirect(new URL(next, origin));
    }
  }

  return NextResponse.redirect(new URL("/auth/auth-code-error", origin));
}
