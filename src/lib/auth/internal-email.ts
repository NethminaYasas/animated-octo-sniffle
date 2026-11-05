/**
 * Username + password accounts are created without a real email address.
 * Supabase Auth still needs an email-shaped identifier, so we use a reserved
 * `.invalid` address (RFC 2606) that can never receive mail.
 *
 * The local part is random rather than the username, because usernames may be
 * in Sinhala or Tamil and those are not safe email local parts. Login resolves
 * the username to this address with resolve_login_email().
 */
export const INTERNAL_EMAIL_DOMAIN = "login.kaluwo.invalid";

export function createInternalEmail(): string {
  return `user-${crypto.randomUUID()}@${INTERNAL_EMAIL_DOMAIN}`;
}

export function isInternalEmail(email: string | null | undefined): boolean {
  return Boolean(
    email && email.toLowerCase().endsWith(`@${INTERNAL_EMAIL_DOMAIN}`),
  );
}
