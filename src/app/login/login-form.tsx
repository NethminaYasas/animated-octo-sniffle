"use client";

import { LogIn } from "lucide-react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useRef, useState, type FormEvent } from "react";

import { AuthMessage } from "@/components/auth-message";
import { GoogleAuthButton } from "@/components/google-auth-button";
import {
  TurnstileField,
  type TurnstileFieldHandle,
} from "@/components/turnstile-field";
import { safeRedirectPath } from "@/lib/auth/redirect";
import { normaliseUsername } from "@/lib/auth/validation";

import { loginWithUsername } from "./actions";

export function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const captchaRef = useRef<TurnstileFieldHandle>(null);

  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [captchaToken, setCaptchaToken] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  // Relative paths only; the OAuth callback re-checks this value on the server.
  const next = safeRedirectPath(
    searchParams.get("next"),
    "http://localhost",
    "/",
  );

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError(null);

    if (!captchaToken) {
      setError("Complete the CAPTCHA before logging in.");
      return;
    }

    setSubmitting(true);

    try {
      const result = await loginWithUsername({
        username: normaliseUsername(username),
        password,
        captchaToken,
      });

      if (!result.ok) {
        setError(result.error);
        captchaRef.current?.reset();
        return;
      }

      const next = safeRedirectPath(
        searchParams.get("next"),
        window.location.origin,
      );

      router.push(next);
      router.refresh();
    } catch {
      setError("Could not reach the server. Check your connection and try again.");
      captchaRef.current?.reset();
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="space-y-4">
      <GoogleAuthButton next={next} />

      <div className="flex items-center gap-3" aria-hidden="true">
        <span className="h-px flex-1 bg-line" />
        <span className="text-[11px] font-medium uppercase tracking-wide text-faint">
          or use a username
        </span>
        <span className="h-px flex-1 bg-line" />
      </div>

      <form className="space-y-4" onSubmit={handleSubmit}>
        {error ? <AuthMessage tone="error">{error}</AuthMessage> : null}

      <div>
        <label
          className="mb-1 block text-xs font-medium text-muted"
          htmlFor="login-username"
        >
          Username
        </label>
        <input
          autoComplete="username"
          className="w-full rounded-lg border border-line bg-surface px-3 py-2.5 text-sm text-ink placeholder:text-faint focus:outline-none focus:ring-2 focus:ring-orange-700"
          id="login-username"
          maxLength={20}
          onChange={(event) => setUsername(event.target.value)}
          pattern="[A-Za-z0-9_\u0B80-\u0BFF\u0D80-\u0DFF\u200C\u200D]{3,20}"
          placeholder="your_name"
          required
          title="3-20 English, Sinhala or Tamil letters, numbers or underscores"
          type="text"
          value={username}
        />
      </div>

      <div>
        <div className="mb-1 flex items-center justify-between gap-3">
          <label
            className="block text-xs font-medium text-muted"
            htmlFor="login-password"
          >
            Password
          </label>
          <Link
            className="text-xs font-medium text-orange-700 hover:underline dark:text-orange-400"
            href="/forgot-password"
          >
            Forgot password?
          </Link>
        </div>
        <input
          autoComplete="current-password"
          className="w-full rounded-lg border border-line bg-surface px-3 py-2.5 text-sm text-ink placeholder:text-faint focus:outline-none focus:ring-2 focus:ring-orange-700"
          id="login-password"
          onChange={(event) => setPassword(event.target.value)}
          placeholder="Your password"
          required
          type="password"
          value={password}
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
        <LogIn className="size-4" />
        {submitting ? "Logging in..." : "Log in"}
      </button>

      <p className="text-center text-sm text-muted">
        New here?{" "}
        <Link
          className="font-medium text-orange-700 hover:underline dark:text-orange-400"
          href="/signup"
        >
          Create an account
        </Link>
      </p>
      </form>
    </div>
  );
}
