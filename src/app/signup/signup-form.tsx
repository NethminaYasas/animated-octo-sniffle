"use client";

import { Ticket, UserPlus } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useRef, useState, type FormEvent } from "react";

import { AuthMessage } from "@/components/auth-message";
import { GoogleAuthButton } from "@/components/google-auth-button";
import {
  TurnstileField,
  type TurnstileFieldHandle,
} from "@/components/turnstile-field";
import { normaliseUsername, usernameProblem } from "@/lib/auth/validation";

import { signUpWithInvite } from "./actions";

export function SignupForm() {
  const router = useRouter();
  const captchaRef = useRef<TurnstileFieldHandle>(null);

  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [inviteCode, setInviteCode] = useState("");
  const [captchaToken, setCaptchaToken] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [created, setCreated] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError(null);

    const cleanUsername = normaliseUsername(username);
    const usernameError = usernameProblem(cleanUsername);

    if (usernameError) {
      setError(usernameError);
      return;
    }

    if (password.length < 8) {
      setError("Use at least 8 characters for your password.");
      return;
    }

    if (password !== confirmPassword) {
      setError("The passwords do not match.");
      return;
    }

    if (!inviteCode.trim()) {
      setError("Enter your invite code.");
      return;
    }

    if (!captchaToken) {
      setError("Complete the CAPTCHA before signing up.");
      return;
    }

    setSubmitting(true);

    try {
      const result = await signUpWithInvite({
        username: cleanUsername,
        password,
        inviteCode: inviteCode.trim(),
        captchaToken,
      });

      if (!result.ok) {
        setError(result.error);
        captchaRef.current?.reset();
        return;
      }

      if (result.signedIn) {
        router.push("/profile");
        router.refresh();
        return;
      }

      setCreated(true);
    } catch {
      setError(
        "Could not reach the server. Check your connection and try again.",
      );
      captchaRef.current?.reset();
    } finally {
      setSubmitting(false);
    }
  };

  if (created) {
    return (
      <div className="space-y-4">
        <AuthMessage tone="success">
          Your account is ready. Log in with your username and password.
        </AuthMessage>

        <Link
          className="flex w-full items-center justify-center rounded-full bg-orange-700 px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-orange-800"
          href="/login"
        >
          Go to log in
        </Link>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <GoogleAuthButton label="Sign up with Google" next="/onboarding" />

      <div className="flex items-center gap-3" aria-hidden="true">
        <span className="h-px flex-1 bg-line" />
        <span className="text-[11px] font-medium uppercase tracking-wide text-faint">
          or use an invite code
        </span>
        <span className="h-px flex-1 bg-line" />
      </div>

      <form className="space-y-4" onSubmit={handleSubmit}>
        {error ? <AuthMessage tone="error">{error}</AuthMessage> : null}

        <div>
          <label
            className="mb-1 block text-xs font-medium text-muted"
            htmlFor="signup-username"
          >
            Username
          </label>
          <input
            autoComplete="username"
            className="w-full rounded-lg border border-line bg-surface px-3 py-2.5 text-sm text-ink placeholder:text-faint focus:outline-none focus:ring-2 focus:ring-orange-700"
            id="signup-username"
            maxLength={20}
            onChange={(event) => setUsername(event.target.value)}
            placeholder="your_name"
            required
            type="text"
            value={username}
          />
          <p className="mt-1 text-[11px] text-faint">
            3-20 characters. Letters, numbers and underscores; shown in
            lowercase.
          </p>
        </div>

        <div>
          <label
            className="mb-1 block text-xs font-medium text-muted"
            htmlFor="signup-password"
          >
            Password
          </label>
          <input
            autoComplete="new-password"
            className="w-full rounded-lg border border-line bg-surface px-3 py-2.5 text-sm text-ink placeholder:text-faint focus:outline-none focus:ring-2 focus:ring-orange-700"
            id="signup-password"
            minLength={8}
            onChange={(event) => setPassword(event.target.value)}
            placeholder="At least 8 characters"
            required
            type="password"
            value={password}
          />
        </div>

        <div>
          <label
            className="mb-1 block text-xs font-medium text-muted"
            htmlFor="signup-confirm-password"
          >
            Confirm password
          </label>
          <input
            autoComplete="new-password"
            className="w-full rounded-lg border border-line bg-surface px-3 py-2.5 text-sm text-ink placeholder:text-faint focus:outline-none focus:ring-2 focus:ring-orange-700"
            id="signup-confirm-password"
            minLength={8}
            onChange={(event) => setConfirmPassword(event.target.value)}
            placeholder="Repeat your password"
            required
            type="password"
            value={confirmPassword}
          />
        </div>

        <div>
          <label
            className="mb-1 block text-xs font-medium text-muted"
            htmlFor="signup-invite-code"
          >
            Invite code
          </label>
          <div className="relative">
            <Ticket className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-faint" />
            <input
              autoComplete="off"
              className="w-full rounded-lg border border-line bg-surface px-3 py-2.5 pl-9 font-mono text-sm text-ink placeholder:font-sans placeholder:text-faint focus:outline-none focus:ring-2 focus:ring-orange-700"
              id="signup-invite-code"
              onChange={(event) => setInviteCode(event.target.value)}
              placeholder="Paste your single-use code"
              required
              spellCheck={false}
              type="text"
              value={inviteCode}
            />
          </div>
          <p className="mt-1 text-[11px] text-faint">
            Username sign-up is invite-only. Ask an admin for a code.
          </p>
        </div>

        <TurnstileField
          ref={captchaRef}
          onError={setError}
          onTokenChange={setCaptchaToken}
        />

        <button
          className="flex w-full items-center justify-center gap-1.5 rounded-full bg-orange-700 px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-orange-800 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-orange-600 disabled:cursor-not-allowed disabled:opacity-60"
          disabled={submitting || !captchaToken}
          type="submit"
        >
          <UserPlus className="size-4" />
          {submitting ? "Creating account..." : "Create account"}
        </button>

        <p className="text-center text-sm text-muted">
          Already have an account?{" "}
          <Link
            className="font-medium text-orange-700 hover:underline dark:text-orange-400"
            href="/login"
          >
            Log in
          </Link>
        </p>
      </form>
    </div>
  );
}
