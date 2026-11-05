"use client";

import { UserPlus } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useRef, useState, type FormEvent } from "react";

import { AuthMessage } from "@/components/auth-message";
import {
  TurnstileField,
  type TurnstileFieldHandle,
} from "@/components/turnstile-field";
import { normaliseUsername, usernameProblem } from "@/lib/auth/validation";

import { signUpWithUsername } from "./actions";

export function SignupForm() {
  const router = useRouter();
  const captchaRef = useRef<TurnstileFieldHandle>(null);

  const [username, setUsername] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [captchaToken, setCaptchaToken] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [sentTo, setSentTo] = useState<string | null>(null);
  const [createdUsername, setCreatedUsername] = useState<string | null>(null);
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

    if (!captchaToken) {
      setError("Complete the CAPTCHA before signing up.");
      return;
    }

    setSubmitting(true);

    try {
      const result = await signUpWithUsername({
        username: cleanUsername,
        email: email.trim(),
        password,
        captchaToken,
      });

      if (!result.ok) {
        setError(result.error);
        captchaRef.current?.reset();
        return;
      }

      if (!result.needsEmailConfirmation) {
        router.push("/profile");
        router.refresh();
        return;
      }

      setCreatedUsername(result.username);
      setSentTo(email.trim());
    } catch {
      setError(
        "Could not reach the server. Check your connection and try again.",
      );
      captchaRef.current?.reset();
    } finally {
      setSubmitting(false);
    }
  };

  if (sentTo) {
    return (
      <div className="space-y-4">
        <AuthMessage tone="success">
          Check your inbox. We sent a confirmation link to{" "}
          <strong className="font-semibold">{sentTo}</strong>.
        </AuthMessage>

        {createdUsername ? (
          <p className="text-sm text-muted">
            Your username is{" "}
            <strong className="font-semibold text-ink">
              @{createdUsername}
            </strong>
            . Use it with your password to log in after you confirm your email.
          </p>
        ) : null}

        <p className="text-sm text-muted">
          Click the link to verify your email, then log in. If it does not
          arrive in a few minutes, check your spam folder.
        </p>

        <Link
          className="flex w-full items-center justify-center rounded-full bg-orange-700 px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-orange-800"
          href="/login"
        >
          Back to log in
        </Link>
      </div>
    );
  }

  return (
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
          htmlFor="signup-email"
        >
          Email
        </label>
        <input
          autoComplete="email"
          className="w-full rounded-lg border border-line bg-surface px-3 py-2.5 text-sm text-ink placeholder:text-faint focus:outline-none focus:ring-2 focus:ring-orange-700"
          id="signup-email"
          inputMode="email"
          onChange={(event) => setEmail(event.target.value)}
          placeholder="you@example.com"
          required
          type="email"
          value={email}
        />
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
  );
}
