"use server";

import { authErrorMessage } from "@/lib/auth/errors";
import { internalEmailForUsername } from "@/lib/auth/internal-email";
import { verifyTurnstile } from "@/lib/auth/turnstile";
import { normaliseUsername, usernameProblem } from "@/lib/auth/validation";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

export type SignUpResult =
  | { ok: true; signedIn: boolean }
  | { ok: false; error: string };

const INVITE_CODE_PATTERN = /^[a-z0-9]{16,64}$/;

/**
 * Invite-only username + password sign-up.
 *
 * There is no email verification. Supabase Auth still needs an email-shaped
 * identifier, so username accounts get a reserved, non-deliverable address.
 * Google sign-up is the verified path and uses /onboarding after OAuth.
 */
export async function signUpWithInvite(input: {
  username: string;
  password: string;
  inviteCode: string;
  captchaToken: string;
}): Promise<SignUpResult> {
  const username = normaliseUsername(input.username ?? "");
  const password = input.password ?? "";
  const inviteCode = (input.inviteCode ?? "").trim().toLowerCase();
  const captchaToken = input.captchaToken ?? "";

  const usernameError = usernameProblem(username);

  if (usernameError) {
    return { ok: false, error: usernameError };
  }

  if (password.length < 8) {
    return { ok: false, error: "Use at least 8 characters for your password." };
  }

  if (!INVITE_CODE_PATTERN.test(inviteCode)) {
    return { ok: false, error: "Enter a valid invite code." };
  }

  if (!captchaToken) {
    return { ok: false, error: "Complete the CAPTCHA before signing up." };
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
        "Sign-up is not configured. Add SUPABASE_SERVICE_ROLE_KEY to .env.local.",
    };
  }

  // Fast, friendly checks before creating an auth user. The atomic claim below
  // is still the real gate for usernames and invite codes.
  const [
    { data: existingProfile, error: usernameLookupError },
    { data: invite, error: inviteLookupError },
  ] = await Promise.all([
    admin
      .from("profiles")
      .select("id")
      .eq("username", username)
      .maybeSingle(),
    admin
      .from("invite_codes")
      .select("code")
      .eq("code", inviteCode)
      .is("used_at", null)
      .maybeSingle(),
  ]);

  if (usernameLookupError || inviteLookupError) {
    console.error(
      "sign-up lookup failed:",
      usernameLookupError?.message ?? inviteLookupError?.message,
    );

    return {
      ok: false,
      error:
        "The database is not set up yet. Apply the migrations in supabase/migrations/ first.",
    };
  }

  if (existingProfile) {
    return { ok: false, error: "That username is taken. Try another one." };
  }

  if (!invite) {
    return {
      ok: false,
      error: "That invite code is not valid or was already used.",
    };
  }

  const email = internalEmailForUsername(username);

  const releaseInvite = async () => {
    const { error: releaseError } = await admin
      .from("invite_codes")
      .update({ used_at: null })
      .eq("code", inviteCode)
      .is("used_by", null);

    if (releaseError) {
      console.error("release invite failed:", releaseError.message);
    }
  };

  // Claim the code before creating the account. If anything fails afterwards,
  // the claim is released so the same code can be retried.
  const { data: consumed, error: consumeError } = await admin.rpc(
    "consume_invite_code",
    { p_code: inviteCode },
  );

  if (consumeError || !consumed) {
    if (consumeError) {
      console.error("consume_invite_code failed:", consumeError.message);
    }

    return {
      ok: false,
      error: "That invite code is not valid or was already used.",
    };
  }

  const { data: created, error: createError } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    app_metadata: {
      // Trusted marker read by the profile trigger. app_metadata is only
      // writable by the service role, unlike user_metadata.
      kaluwo_invite: true,
    },
    user_metadata: { username },
  });

  if (createError || !created.user) {
    await releaseInvite();

    if (createError?.code === "email_exists") {
      return { ok: false, error: "That username is taken. Try another one." };
    }

    return {
      ok: false,
      error: createError
        ? authErrorMessage(createError)
        : "Could not create the account. Please try again.",
    };
  }

  const userId = created.user.id;

  const { data: profile, error: profileError } = await admin
    .from("profiles")
    .select("username")
    .eq("id", userId)
    .maybeSingle();

  // The trigger adds a numeric suffix on a race. Do not silently rename the
  // account the member just chose.
  if (profileError || !profile || profile.username !== username) {
    await admin.auth.admin.deleteUser(userId);
    await releaseInvite();

    if (profileError) {
      console.error("profile lookup failed:", profileError.message);
    }

    return { ok: false, error: "That username is taken. Try another one." };
  }

  // Attribute the code to the new account. A failure here does not open the
  // gate again: the code is already consumed.
  const { error: attributeError } = await admin
    .from("invite_codes")
    .update({ used_by: userId })
    .eq("code", inviteCode);

  if (attributeError) {
    console.error("could not attribute invite code:", attributeError.message);
  }

  // Create the cookie session so the member lands on their profile straight
  // away. If sign-in fails the account still works; the form offers a login
  // link instead of pretending the session exists.
  const supabase = await createClient();
  const { error: signInError } = await supabase.auth.signInWithPassword({
    email,
    password,
  });

  return { ok: true, signedIn: !signInError };
}
