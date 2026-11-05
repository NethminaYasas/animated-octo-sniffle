import "server-only";

import { headers } from "next/headers";

export type TurnstileResult = { ok: true } | { ok: false; error: string };

type SiteVerifyResponse = {
  success?: boolean;
  "error-codes"?: string[];
};

const SITEVERIFY_URL =
  "https://challenges.cloudflare.com/turnstile/v0/siteverify";

/**
 * Verifies a Cloudflare Turnstile token on the server. The secret lives in
 * TURNSTILE_SECRET_KEY and never reaches the browser.
 *
 * Supabase's built-in CAPTCHA is intentionally left off: username login goes
 * through a server action, and a server-side verification avoids Cloudflare
 * rejecting the token because the request IP changed.
 */
export async function verifyTurnstile(
  token: string,
): Promise<TurnstileResult> {
  const secret = process.env.TURNSTILE_SECRET_KEY?.trim();

  if (!secret) {
    return {
      ok: false,
      error:
        "CAPTCHA is not configured on the server. Add TURNSTILE_SECRET_KEY to .env.local.",
    };
  }

  if (!token) {
    return { ok: false, error: "Complete the CAPTCHA first." };
  }

  try {
    const requestHeaders = await headers();
    const forwardedFor = requestHeaders.get("x-forwarded-for");
    const remoteIp =
      forwardedFor?.split(",")[0]?.trim() ||
      requestHeaders.get("x-real-ip") ||
      undefined;

    const body = new URLSearchParams({
      secret,
      response: token,
    });

    if (remoteIp) {
      body.set("remoteip", remoteIp);
    }

    const response = await fetch(SITEVERIFY_URL, {
      method: "POST",
      body,
      cache: "no-store",
      signal: AbortSignal.timeout(5_000),
    });

    if (!response.ok) {
      return {
        ok: false,
        error: "CAPTCHA verification failed. Please try again.",
      };
    }

    const result = (await response.json()) as SiteVerifyResponse;

    if (!result.success) {
      return {
        ok: false,
        error: "CAPTCHA verification failed. Please try again.",
      };
    }

    return { ok: true };
  } catch {
    return {
      ok: false,
      error: "CAPTCHA verification failed. Check your connection and try again.",
    };
  }
}
