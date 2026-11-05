"use server";

import { authErrorMessage } from "@/lib/auth/errors";
import { getRequestOrigin } from "@/lib/auth/origin";
import { verifyTurnstile } from "@/lib/auth/turnstile";
import { normaliseUsername, usernameProblem } from "@/lib/auth/validation";
import { createClient } from "@/lib/supabase/server";

export type SignUpResult =
  | {
      ok: true;
      needsEmailConfirmation: boolean;
      username: string | null;
    }
  | { ok: false; error: string };

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export async function signUpWithUsername(input: {
  username: string;
  email: string;
  password: string;
  captchaToken: string;
}): Promise<SignUpResult> {
  const username = normaliseUsername(input.username ?? "");
  const email = (input.email ?? "").trim();
  const password = input.password ?? "";
  const captchaToken = input.captchaToken ?? "";

  const usernameError = usernameProblem(username);

  if (usernameError) {
    return { ok: false, error: usernameError };
  }

  if (!EMAIL_PATTERN.test(email)) {
    return { ok: false, error: "Enter a valid email address." };
  }

  if (password.length < 8) {
    return { ok: false, error: "Use at least 8 characters for your password." };
  }

  if (!captchaToken) {
    return { ok: false, error: "Complete the CAPTCHA before signing up." };
  }

  const captcha = await verifyTurnstile(captchaToken);

  if (!captcha.ok) {
    return { ok: false, error: captcha.error };
  }

  const supabase = await createClient();

  const { data: existing, error: lookupError } = await supabase
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

  if (existing) {
    return { ok: false, error: "That username is taken. Try another one." };
  }

  const origin = await getRequestOrigin();

  const { data, error: signUpError } = await supabase.auth.signUp({
    email,
    password,
    options: {
      data: { username },
      emailRedirectTo: `${origin}/auth/callback?next=/profile`,
    },
  });

  if (signUpError) {
    return { ok: false, error: authErrorMessage(signUpError) };
  }

  // Read back the real username. The trigger may add a suffix if the name was
  // taken between the check above and the insert.
  let actualUsername: string | null = null;

  if (data.user?.identities?.length) {
    const { data: profile } = await supabase
      .from("profiles")
      .select("username")
      .eq("id", data.user.id)
      .maybeSingle();

    actualUsername = profile?.username ?? null;
  }

  return {
    ok: true,
    needsEmailConfirmation: !data.session,
    username: actualUsername,
  };
}
