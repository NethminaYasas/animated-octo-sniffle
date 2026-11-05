"use server";

import { authErrorMessage } from "@/lib/auth/errors";
import { normaliseUsername, usernameProblem } from "@/lib/auth/validation";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

export type OnboardingResult = { ok: true } | { ok: false; error: string };

/**
 * Finishes a Google account: the member picks a username and a password, so
 * the same account can sign in with Google or with username + password.
 *
 * The password is written with the service role because a fresh OAuth user has
 * no email identity yet; this avoids Supabase sending an email-confirmation
 * message, and the Google address is already verified by Google.
 */
export async function completeOnboarding(input: {
  username: string;
  password: string;
}): Promise<OnboardingResult> {
  const username = normaliseUsername(input.username ?? "");
  const password = input.password ?? "";

  const usernameError = usernameProblem(username);

  if (usernameError) {
    return { ok: false, error: usernameError };
  }

  if (password.length < 8) {
    return { ok: false, error: "Use at least 8 characters for your password." };
  }

  const supabase = await createClient();
  const { data: userData, error: userError } = await supabase.auth.getUser();

  if (userError || !userData.user) {
    return {
      ok: false,
      error: "Your session has expired. Log in with Google again.",
    };
  }

  const admin = createAdminClient();

  if (!admin) {
    return {
      ok: false,
      error:
        "Account setup is not configured. Add SUPABASE_SERVICE_ROLE_KEY to .env.local.",
    };
  }

  const { data: existing, error: lookupError } = await admin
    .from("profiles")
    .select("id")
    .eq("username", username)
    .maybeSingle();

  if (lookupError) {
    console.error("username lookup failed:", lookupError.message);

    return {
      ok: false,
      error:
        "The database is not set up yet. Apply the migrations in supabase/migrations/ first.",
    };
  }

  if (existing && existing.id !== userData.user.id) {
    return { ok: false, error: "That username is taken. Try another one." };
  }

  const { error: passwordError } = await admin.auth.admin.updateUserById(
    userData.user.id,
    { password },
  );

  if (passwordError) {
    return { ok: false, error: authErrorMessage(passwordError) };
  }

  const { error: profileError } = await admin
    .from("profiles")
    .update({ username, onboarding_completed: true })
    .eq("id", userData.user.id);

  if (profileError) {
    if (profileError.code === "23505") {
      return { ok: false, error: "That username is taken. Try another one." };
    }

    console.error("profile update failed:", profileError.message);

    return {
      ok: false,
      error:
        "Could not save your profile. Apply the latest database migration and try again.",
    };
  }

  return { ok: true };
}
