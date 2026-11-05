"use client";

import { KeyRound } from "lucide-react";
import Link from "next/link";
import { useEffect, useState, type FormEvent } from "react";

import { AuthMessage } from "@/components/auth-message";
import { authErrorMessage } from "@/lib/auth/errors";
import { createClient } from "@/lib/supabase/client";

type ResetState = "checking" | "ready" | "invalid" | "done";

export function ResetPasswordForm() {
  const [state, setState] = useState<ResetState>("checking");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    let active = true;

    const checkSession = async () => {
      try {
        const supabase = createClient();
        const { data, error: userError } = await supabase.auth.getUser();

        if (!active) {
          return;
        }

        setState(data.user && !userError ? "ready" : "invalid");
      } catch {
        if (active) {
          setState("invalid");
        }
      }
    };

    checkSession();

    return () => {
      active = false;
    };
  }, []);

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError(null);

    if (password.length < 8) {
      setError("Use at least 8 characters for your new password.");
      return;
    }

    if (password !== confirmPassword) {
      setError("The passwords do not match.");
      return;
    }

    setSubmitting(true);

    try {
      const supabase = createClient();
      const { error: updateError } = await supabase.auth.updateUser({
        password,
      });

      if (updateError) {
        setError(authErrorMessage(updateError));
        return;
      }

      setState("done");
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "Could not reach Supabase. Check your configuration.",
      );
    } finally {
      setSubmitting(false);
    }
  };

  if (state === "checking") {
    return <p className="text-sm text-muted">Checking your reset link...</p>;
  }

  if (state === "invalid") {
    return (
      <div className="space-y-4">
        <AuthMessage tone="error">
          This reset link is invalid or has expired.
        </AuthMessage>

        <p className="text-sm text-muted">
          Request a new link and open it in the same browser you use to log in.
        </p>

        <Link
          className="flex w-full items-center justify-center rounded-full bg-orange-700 px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-orange-800"
          href="/forgot-password"
        >
          Request a new link
        </Link>
      </div>
    );
  }

  if (state === "done") {
    return (
      <div className="space-y-4">
        <AuthMessage tone="success">
          Your password has been updated.
        </AuthMessage>

        <p className="text-sm text-muted">
          You can keep using this session, or log in again with your new
          password.
        </p>

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
    <form className="space-y-4" onSubmit={handleSubmit}>
      {error ? <AuthMessage tone="error">{error}</AuthMessage> : null}

      <div>
        <label
          className="mb-1 block text-xs font-medium text-muted"
          htmlFor="reset-password"
        >
          New password
        </label>
        <input
          autoComplete="new-password"
          className="w-full rounded-lg border border-line bg-surface px-3 py-2.5 text-sm text-ink placeholder:text-faint focus:outline-none focus:ring-2 focus:ring-orange-700"
          id="reset-password"
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
          htmlFor="reset-confirm-password"
        >
          Confirm new password
        </label>
        <input
          autoComplete="new-password"
          className="w-full rounded-lg border border-line bg-surface px-3 py-2.5 text-sm text-ink placeholder:text-faint focus:outline-none focus:ring-2 focus:ring-orange-700"
          id="reset-confirm-password"
          minLength={8}
          onChange={(event) => setConfirmPassword(event.target.value)}
          placeholder="Repeat your new password"
          required
          type="password"
          value={confirmPassword}
        />
      </div>

      <button
        className="flex w-full items-center justify-center gap-1.5 rounded-full bg-orange-700 px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-orange-800 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-orange-600 disabled:cursor-not-allowed disabled:opacity-60"
        disabled={submitting}
        type="submit"
      >
        <KeyRound className="size-4" />
        {submitting ? "Updating..." : "Update password"}
      </button>
    </form>
  );
}
