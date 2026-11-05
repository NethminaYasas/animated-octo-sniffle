import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

import { getSupabaseConfig } from "./config";

/**
 * Refreshes the Supabase session on every request and passes the updated
 * cookies to both the Server Components and the browser.
 */
export async function updateSession(request: NextRequest) {
  const config = getSupabaseConfig();

  if (!config) {
    return NextResponse.next({ request });
  }

  let response = NextResponse.next({ request });

  const supabase = createServerClient(config.url, config.anonKey, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet) {
        cookiesToSet.forEach(({ name, value }) =>
          request.cookies.set(name, value),
        );

        response = NextResponse.next({ request });

        cookiesToSet.forEach(({ name, value, options }) =>
          response.cookies.set(name, value, options),
        );
      },
    },
  });

  // Do not add logic between creating the client and this call: it is what
  // refreshes an expired access token.
  await supabase.auth.getClaims();

  return response;
}
