"use client";

import { useEffect, useState } from "react";

import { isUsernameAvailable } from "./username-availability";
import { normaliseUsername, usernameProblem } from "./validation";

export type UsernameAvailabilityStatus =
  | "idle"
  | "checking"
  | "available"
  | "taken"
  | "unknown";

type CheckedStatus = Exclude<UsernameAvailabilityStatus, "idle" | "checking">;

const CHECK_DELAY_MS = 400;

/**
 * Debounced availability check for the username fields. Invalid names are left
 * to the format validation so the two messages do not compete.
 */
export function useUsernameAvailability(
  username: string,
  currentUserId?: string | null,
): UsernameAvailabilityStatus {
  const [checked, setChecked] = useState<{
    key: string;
    status: CheckedStatus;
  } | null>(null);

  const clean = normaliseUsername(username);
  const invalid = Boolean(usernameProblem(clean));
  const key = `${clean}:${currentUserId ?? ""}`;

  useEffect(() => {
    if (invalid) {
      return;
    }

    let active = true;
    const timer = window.setTimeout(async () => {
      const available = await isUsernameAvailable(clean, currentUserId);

      if (!active) {
        return;
      }

      setChecked({
        key,
        status:
          available === null ? "unknown" : available ? "available" : "taken",
      });
    }, CHECK_DELAY_MS);

    return () => {
      active = false;
      window.clearTimeout(timer);
    };
  }, [clean, currentUserId, invalid, key]);

  if (invalid) {
    return "idle";
  }

  return checked?.key === key ? checked.status : "checking";
}
