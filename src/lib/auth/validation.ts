// English, Sinhala and Tamil letters/marks, digits, underscore, and the
// zero-width joiner/non-joiner used by some conjunct sequences.
export const USERNAME_PATTERN =
  /^[a-z0-9_\u0B80-\u0BFF\u0D80-\u0DFF\u200C\u200D]+$/u;

/**
 * Usernames are stored lowercase and NFC-normalised so visually identical
 * Unicode sequences resolve to the same account.
 */
export function normaliseUsername(value: string): string {
  return value.trim().toLowerCase().normalize("NFC");
}

export function usernameProblem(value: string): string | null {
  const username = normaliseUsername(value);

  // Count code points, matching PostgreSQL's char_length().
  const length = [...username].length;

  if (length < 3) {
    return "Use at least 3 characters for your username.";
  }

  if (length > 20) {
    return "Use at most 20 characters for your username.";
  }

  if (!USERNAME_PATTERN.test(username)) {
    return "Use only English, Sinhala or Tamil letters, numbers and underscores in your username.";
  }

  return null;
}
