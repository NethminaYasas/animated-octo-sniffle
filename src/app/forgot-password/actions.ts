"use server";

import { authErrorMessage } from "@/lib/auth/errors";
import { getRequestOrigin } from "@/lib/auth/origin";
import { verifyTurnstile } from "@/lib/auth/turnstile";
import { createClient } from "@/lib/supabase/server";

export type ForgotPasswordResult = { ok: true } | { ok: false; error: string };

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export async function requestPasswordReset(input: {
  email: string;
  captchaToken: string;
}): Promise<ForgotPasswordResult> {
  const email = (input.email ?? "").trim();
  const captchaToken = input.captchaToken ?? "";

  if (!EMAIL_PATTERN.test(email)) {
    return { ok: false, error: "Enter a valid email address." };
  }

  if (!captchaToken) {
    return {
      ok: false,
      error: "Complete the CAPTCHA before requesting a reset link.",
    };
  }

  const captcha = await verifyTurnstile(captchaToken);

  if (!captcha.ok) {
    return { ok: false, error: captcha.error };
  }

  const origin = await getRequestOrigin();
  const supabase = await createClient();
  const { error } = await supabase.auth.resetPasswordForEmail(email, {
    redirectTo: `${origin}/auth/callback?next=/reset-password`,
  });

  if (error) {
    return { ok: false, error: authErrorMessage(error) };
  }

  return { ok: true };
}
