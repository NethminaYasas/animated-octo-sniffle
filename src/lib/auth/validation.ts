export const USERNAME_PATTERN = /^[a-z0-9_]{3,20}$/;

export function normaliseUsername(value: string): string {
  return value.trim().toLowerCase();
}

export function usernameProblem(value: string): string | null {
  const username = normaliseUsername(value);

  if (username.length < 3) {
    return "Use at least 3 characters for your username.";
  }

  if (username.length > 20) {
    return "Use at most 20 characters for your username.";
  }

  if (!USERNAME_PATTERN.test(username)) {
    return "Use only letters, numbers and underscores in your username.";
  }

  return null;
}
