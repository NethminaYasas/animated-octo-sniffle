"use server";

import { authErrorMessage } from "@/lib/auth/errors";
import { verifyTurnstile } from "@/lib/auth/turnstile";
import { normaliseUsername, usernameProblem } from "@/lib/auth/validation";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

export type LoginResult = { ok: true } | { ok: false; error: string };

/**
 * Supabase Auth signs in with an email, but kaluwo members log in with a
 * username. This server action resolves the username to the account email
 * with the service-role client, then creates the normal cookie-based session.
 */
export async function loginWithUsername(input: {
  username: string;
  password: string;
  captchaToken: string;
}): Promise<LoginResult> {
  const username = normaliseUsername(input.username ?? "");
  const password = input.password ?? "";
  const captchaToken = input.captchaToken ?? "";

  const usernameError = usernameProblem(username);

  if (usernameError) {
    return { ok: false, error: usernameError };
  }

  if (!password) {
    return { ok: false, error: "Enter your password." };
  }

  if (!captchaToken) {
    return { ok: false, error: "Complete the CAPTCHA before logging in." };
  }

  const captcha = await verifyTurnstile(captchaToken);

  if (!captcha.ok) {
    return { ok: false, error: captcha.error };
  }

  const admin = createAdminClient();

  if (!admin) {
    return {
      ok: false,
      error:
        "Username login is not configured. Add SUPABASE_SERVICE_ROLE_KEY to .env.local.",
    };
  }

  const { data: resolvedEmail, error: lookupError } = await admin.rpc(
    "resolve_login_email",
    { lookup_username: username },
  );

  if (lookupError) {
    console.error("resolve_login_email failed:", lookupError.message);

    return {
      ok: false,
      error:
        "Username login is not set up. Apply the latest database migration.",
    };
  }

  // Use a dummy address when the username is unknown, so the failure path and
  // the response look the same whether or not the account exists.
  const email =
    resolvedEmail ?? `missing-${crypto.randomUUID()}@example.com`;

  const supabase = await createClient();
  const { error: signInError } = await supabase.auth.signInWithPassword({
    email,
    password,
  });

  if (signInError) {
    return { ok: false, error: authErrorMessage(signInError) };
  }

  return { ok: true };
}
