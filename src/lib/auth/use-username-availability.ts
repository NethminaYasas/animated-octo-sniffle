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

const CHECK_DELAY_MS = 400;

/**
 * Debounced availability check for the username fields. Invalid names are left
 * to the format validation so the two messages do not compete.
 */
export function useUsernameAvailability(
  username: string,
  currentUserId?: string | null,
): UsernameAvailabilityStatus {
  const [status, setStatus] = useState<UsernameAvailabilityStatus>("idle");

  useEffect(() => {
    const clean = normaliseUsername(username);

    if (usernameProblem(clean)) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- an invalid value has nothing to check
      setStatus("idle");
      return;
    }

    setStatus("checking");

    let active = true;
    const timer = window.setTimeout(async () => {
      const available = await isUsernameAvailable(clean, currentUserId);

      if (!active) {
        return;
      }

      if (available === null) {
        setStatus("unknown");
      } else {
        setStatus(available ? "available" : "taken");
      }
    }, CHECK_DELAY_MS);

    return () => {
      active = false;
      window.clearTimeout(timer);
    };
  }, [username, currentUserId]);

  return status;
}
