import { NextResponse } from "next/server";

/**
 * Receives Content-Security-Policy violation reports while the CSP is in
 * report-only mode. Reports are logged with URLs truncated; they are never
 * stored, because a report can contain a full page URL.
 */
export async function POST(request: Request) {
  let payload: unknown = null;

  try {
    payload = await request.json();
  } catch {
    // Browsers sometimes send an empty body with a 204.
    return new NextResponse(null, { status: 204 });
  }

  const report =
    payload && typeof payload === "object"
      ? (payload as Record<string, unknown>)["csp-report"]
      : null;

  if (report && typeof report === "object") {
    const entry = report as Record<string, unknown>;
    // Reports carry full URLs, which can include auth codes in the query
    // string (for example /auth/callback?code=…). Keep origin and path only,
    // and bound both the number of keys and each value.
    const scrub = (value: unknown) => {
      if (typeof value !== "string") {
        return value;
      }

      try {
        const url = new URL(value);
        return `${url.origin}${url.pathname}`.slice(0, 300);
      } catch {
        return value.slice(0, 300);
      }
    };

    const clean = Object.fromEntries(
      Object.entries(entry)
        .slice(0, 20)
        .map(([key, value]) => [key, scrub(value)]),
    );

    console.warn("csp-report-only violation:", clean);
  }

  return new NextResponse(null, { status: 204 });
}
