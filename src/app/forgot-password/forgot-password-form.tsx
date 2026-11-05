"use client";

import { Mail } from "lucide-react";
import Link from "next/link";
import { useRef, useState, type FormEvent } from "react";

import { AuthMessage } from "@/components/auth-message";
import {
  TurnstileField,
  type TurnstileFieldHandle,
} from "@/components/turnstile-field";

import { requestPasswordReset } from "./actions";

export function ForgotPasswordForm() {
  const captchaRef = useRef<TurnstileFieldHandle>(null);

  const [email, setEmail] = useState("");
  const [captchaToken, setCaptchaToken] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [sentTo, setSentTo] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError(null);

    if (!captchaToken) {
      setError("Complete the CAPTCHA before requesting a reset link.");
      return;
    }

    setSubmitting(true);

    try {
      const result = await requestPasswordReset({
        email: email.trim(),
        captchaToken,
      });

      if (!result.ok) {
        setError(result.error);
        captchaRef.current?.reset();
        return;
      }

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
          If an account exists for{" "}
          <strong className="font-semibold">{sentTo}</strong>, a password reset
          link has been sent.
        </AuthMessage>

        <p className="text-sm text-muted">
          Check your inbox and spam folder. The link expires after a short
          time. You can request another one if it does not arrive.
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

      <p className="text-sm text-muted">
        Enter the email you used to sign up. We will send a link to choose a new
        password.
      </p>

      <div>
        <label
          className="mb-1 block text-xs font-medium text-muted"
          htmlFor="forgot-email"
        >
          Email
        </label>
        <input
          autoComplete="email"
          className="w-full rounded-lg border border-line bg-surface px-3 py-2.5 text-sm text-ink placeholder:text-faint focus:outline-none focus:ring-2 focus:ring-orange-700"
          id="forgot-email"
          inputMode="email"
          onChange={(event) => setEmail(event.target.value)}
          placeholder="you@example.com"
          required
          type="email"
          value={email}
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
        <Mail className="size-4" />
        {submitting ? "Sending link..." : "Send reset link"}
      </button>

      <p className="text-center text-sm text-muted">
        Remembered it?{" "}
        <Link
          className="font-medium text-orange-700 hover:underline dark:text-orange-400"
          href="/login"
        >
          Back to log in
        </Link>
      </p>
    </form>
  );
}
