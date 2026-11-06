export type SupabaseErrorShape =
  | {
      message?: string;
      details?: string | null;
      hint?: string | null;
      code?: string | null;
    }
  | null
  | undefined;

export function isRateLimitError(error: SupabaseErrorShape): boolean {
  return Boolean(
    error &&
      (error.hint === "kaluwo_rate_limited" ||
        error.message?.includes("Kaluwo rate limit exceeded")),
  );
}

export function rateLimitRetrySeconds(
  error: SupabaseErrorShape,
): number | null {
  if (!isRateLimitError(error)) {
    return null;
  }

  const parsed = Number(error?.details);

  return Number.isFinite(parsed) && parsed > 0 ? Math.ceil(parsed) : null;
}

export function rateLimitMessage(retrySeconds: number | null): string {
  return retrySeconds
    ? `You're posting too quickly. Try again in ${retrySeconds} seconds.`
    : "You're posting too quickly. Try again in a few minutes.";
}

export function moderationErrorMessage(error: SupabaseErrorShape): string {
  if (error?.code === "42501" || error?.code === "P0002") {
    return error.message ?? "You do not have permission to do that.";
  }

  if (error?.code === "22023") {
    return error.message ?? "Check the values and try again.";
  }

  return "Could not complete that moderation action.";
}
