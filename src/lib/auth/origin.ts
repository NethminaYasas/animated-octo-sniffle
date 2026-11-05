import "server-only";

import { headers } from "next/headers";

/**
 * Builds the public origin used in Supabase email redirect links. Prefers the
 * Origin header sent with the server action, then the forwarded host.
 */
export async function getRequestOrigin(): Promise<string> {
  const requestHeaders = await headers();
  const origin = requestHeaders.get("origin");

  if (origin) {
    return origin;
  }

  const host = requestHeaders.get("host");

  if (host) {
    const protocol =
      requestHeaders.get("x-forwarded-proto") ??
      (host.startsWith("localhost") ? "http" : "https");

    return `${protocol}://${host}`;
  }

  return process.env.NEXT_PUBLIC_SITE_URL?.trim() || "http://localhost:3000";
}
