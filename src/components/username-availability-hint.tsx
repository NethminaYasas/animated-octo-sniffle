import type { UsernameAvailabilityStatus } from "@/lib/auth/use-username-availability";

/**
 * Inline feedback for the username fields. The database constraint still
 * decides; this only tells the member early.
 */
export function UsernameAvailabilityHint({
  status,
}: {
  status: UsernameAvailabilityStatus;
}) {
  if (status === "idle" || status === "unknown") {
    return null;
  }

  if (status === "checking") {
    return (
      <p
        aria-live="polite"
        className="mt-1 text-[11px] text-faint"
      >
        Checking availability…
      </p>
    );
  }

  if (status === "available") {
    return (
      <p
        aria-live="polite"
        className="mt-1 text-[11px] font-medium text-emerald-700 dark:text-emerald-400"
      >
        That username is available.
      </p>
    );
  }

  return (
    <p
      aria-live="polite"
      className="mt-1 text-[11px] font-medium text-red-600 dark:text-red-400"
    >
      That username is taken. Try another one.
    </p>
  );
}
