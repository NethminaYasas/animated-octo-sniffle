import "server-only";

import { headers } from "next/headers";
import { isIP } from "node:net";

import { createAdminClient } from "@/lib/supabase/admin";

export const SECURITY_EVENTS = [
  "login.succeeded",
  "login.failed",
  "signup.succeeded",
  "signup.failed",
  "password_reset.requested",
  "oauth.succeeded",
  "oauth.failed",
] as const;

export type SecurityEventName = (typeof SECURITY_EVENTS)[number];

/** Only plain, non-secret values belong here. Never pass passwords/tokens. */
export type SecurityEventMetadata = Record<
  string,
  string | number | boolean | null
>;

const MAX_USER_AGENT_LENGTH = 512;

type RequestHeaders = { get(name: string): string | null };

/**
 * Returns the client address, or null when there is none we can trust.
 *
 * Order matters: Cloudflare overwrites `cf-connecting-ip`, and a reverse proxy
 * we control sets `x-real-ip`. `x-forwarded-for` is only a fallback because a
 * client can send that header itself when the app is exposed directly. Do not
 * use any of these for authorisation decisions.
 */
export function getClientIp(requestHeaders: RequestHeaders): string | null {
  const cloudflareIp = requestHeaders.get("cf-connecting-ip");
  if (cloudflareIp) {
    return normaliseIp(cloudflareIp);
  }

  const realIp = requestHeaders.get("x-real-ip");
  if (realIp) {
    return normaliseIp(realIp);
  }

  const forwardedFor = requestHeaders.get("x-forwarded-for");
  if (forwardedFor) {
    for (const candidate of forwardedFor.split(",")) {
      const ip = normaliseIp(candidate);
      if (ip) {
        return ip;
      }
    }
  }

  return null;
}

/**
 * Records one security event. Audit failures are logged and swallowed: a
 * database problem must never turn a successful login into an error, and the
 * caller should not reveal logging state to the browser.
 */
export async function recordSecurityEvent(input: {
  event: SecurityEventName;
  userId?: string | null;
  metadata?: SecurityEventMetadata;
}): Promise<void> {
  try {
    const admin = createAdminClient();

    if (!admin) {
      return;
    }

    const requestHeaders = await headers();
    const userAgent = cleanUserAgent(requestHeaders.get("user-agent"));

    const { error } = await admin.from("security_events").insert({
      event: input.event,
      user_id: input.userId ?? null,
      ip: getClientIp(requestHeaders),
      user_agent: userAgent,
      metadata: input.metadata ?? {},
    });

    if (error) {
      console.error("security_events insert failed:", error.message);
    }
  } catch (error) {
    console.error(
      "security_events insert failed:",
      error instanceof Error ? error.message : "unknown error",
    );
  }
}

function normaliseIp(raw: string): string | null {
  let value = raw.trim();

  if (!value) {
    return null;
  }

  // IPv6 in brackets, optionally with a port: [2001:db8::1]:443
  if (value.startsWith("[")) {
    const closingBracket = value.indexOf("]");
    if (closingBracket > 0) {
      value = value.slice(1, closingBracket);
    }
  } else if (value.includes(".") && value.includes(":")) {
    // IPv4 with a port: 203.0.113.7:443
    value = value.slice(0, value.lastIndexOf(":"));
  }

  return isIP(value) ? value : null;
}

function cleanUserAgent(raw: string | null): string | null {
  if (!raw) {
    return null;
  }

  // Strip control characters so the value stays a single readable line.
  const cleaned = raw.replace(/[\u0000-\u001f\u007f]/g, " ").trim();

  return cleaned ? cleaned.slice(0, MAX_USER_AGENT_LENGTH) : null;
}
