/**
 * Keeps `?next=` redirects on the same origin. This is used by the login form
 * and by the email-confirmation route handlers so a crafted link cannot send a
 * signed-in user to another site.
 */
export function safeRedirectPath(
  value: string | null | undefined,
  origin: string,
  fallback = "/",
): string {
  if (!value) {
    return fallback;
  }

  try {
    const target = new URL(value, origin);

    if (target.origin !== origin) {
      return fallback;
    }

    return `${target.pathname}${target.search}${target.hash}`;
  } catch {
    return fallback;
  }
}
