/**
 * Effective ban is the flag plus an optional expiry. The database uses the same
 * rule in is_banned(); this helper keeps server-rendered and client-rendered
 * labels consistent with it.
 */
export function isBanActive(
  isBanned: boolean,
  bannedUntil: string | null,
  nowMs: number = Date.now(),
): boolean {
  if (!isBanned) {
    return false;
  }

  if (bannedUntil === null) {
    return true;
  }

  const until = new Date(bannedUntil).getTime();

  return Number.isFinite(until) && until > nowMs;
}
