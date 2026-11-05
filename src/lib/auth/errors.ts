type AuthErrorLike = {
  code?: string;
  message?: string;
  status?: number;
} | null;

/**
 * Turns a Supabase Auth error into a short message that is safe to show in the
 * UI. Supabase deliberately avoids revealing whether an email exists, so the
 * messages stay generic where that matters.
 */
export function authErrorMessage(error: AuthErrorLike): string {
  if (!error) {
    return "Something went wrong. Please try again.";
  }

  const code = error.code ?? "";
  const message = error.message ?? "";
  const lower = message.toLowerCase();

  if (
    code === "invalid_credentials" ||
    lower.includes("invalid login credentials")
  ) {
    return "Username or password is incorrect.";
  }

  if (
    code === "email_not_confirmed" ||
    lower.includes("email not confirmed")
  ) {
    return "This account is not ready yet. Log in with Google or ask an admin for help.";
  }

  if (code.includes("captcha") || lower.includes("captcha")) {
    return "CAPTCHA verification failed. Please try again.";
  }

  if (
    code === "user_already_exists" ||
    lower.includes("already registered")
  ) {
    return "That username is already in use. Try logging in instead.";
  }

  if (
    code === "weak_password" ||
    lower.includes("password should be at least")
  ) {
    return "Choose a stronger password, at least 8 characters.";
  }

  if (
    code === "over_email_send_rate_limit" ||
    lower.includes("once every")
  ) {
    return "Too many attempts. Wait a minute and try again.";
  }

  if (
    lower.includes("failed to fetch") ||
    lower.includes("network") ||
    lower.includes("load failed")
  ) {
    return "Could not reach Supabase. Check your connection and try again.";
  }

  return message || "Something went wrong. Please try again.";
}
