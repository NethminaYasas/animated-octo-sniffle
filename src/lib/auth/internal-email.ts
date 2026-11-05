/**
 * Username + password accounts are created without a real email address.
 * Supabase Auth still needs an email-shaped identifier, so we use a reserved
 * `.invalid` address (RFC 2606) that can never receive mail. Google accounts
 * keep their real Google address.
 */
export const INTERNAL_EMAIL_DOMAIN = "login.kaluwo.invalid";

export function internalEmailForUsername(username: string): string {
  return `${username}@${INTERNAL_EMAIL_DOMAIN}`;
}

export function isInternalEmail(email: string | null | undefined): boolean {
  return Boolean(
    email && email.toLowerCase().endsWith(`@${INTERNAL_EMAIL_DOMAIN}`),
  );
}
