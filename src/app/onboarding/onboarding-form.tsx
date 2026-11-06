"use client";

import { CheckCircle2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";

import { AuthMessage } from "@/components/auth-message";
import { UsernameAvailabilityHint } from "@/components/username-availability-hint";
import { useUsernameAvailability } from "@/lib/auth/use-username-availability";
import { normaliseUsername, usernameProblem } from "@/lib/auth/validation";

import { completeOnboarding } from "./actions";

export function OnboardingForm({
  initialUsername,
  userId,
}: {
  initialUsername: string;
  userId: string;
}) {
  const router = useRouter();

  const [username, setUsername] = useState(initialUsername);
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const usernameAvailability = useUsernameAvailability(username, userId);

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError(null);

    const cleanUsername = normaliseUsername(username);
    const usernameError = usernameProblem(cleanUsername);

    if (usernameError) {
      setError(usernameError);
      return;
    }

    if (usernameAvailability === "taken") {
      setError("That username is taken. Try another one.");
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

    setSubmitting(true);

    try {
      const result = await completeOnboarding({
        username: cleanUsername,
        password,
      });

      if (!result.ok) {
        setError(result.error);
        return;
      }

      router.push("/profile");
      router.refresh();
    } catch {
      setError(
        "Could not reach the server. Check your connection and try again.",
      );
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <form className="space-y-4" onSubmit={handleSubmit}>
      {error ? <AuthMessage tone="error">{error}</AuthMessage> : null}

      <div>
        <label
          className="mb-1 block text-xs font-medium text-muted"
          htmlFor="onboarding-username"
        >
          Username
        </label>
        <input
          autoComplete="username"
          className="w-full rounded-lg border border-line bg-surface px-3 py-2.5 text-sm text-ink placeholder:text-faint focus:outline-none focus:ring-2 focus:ring-orange-700"
          id="onboarding-username"
          maxLength={20}
          onChange={(event) => setUsername(event.target.value)}
          placeholder="your_name"
          required
          type="text"
          value={username}
        />
        <p className="mt-1 text-[11px] text-faint">
          3-20 characters. English, Sinhala or Tamil letters, numbers and
          underscores; shown in lowercase.
        </p>
        <UsernameAvailabilityHint status={usernameAvailability} />
      </div>

      <div>
        <label
          className="mb-1 block text-xs font-medium text-muted"
          htmlFor="onboarding-password"
        >
          Password
        </label>
        <input
          autoComplete="new-password"
          className="w-full rounded-lg border border-line bg-surface px-3 py-2.5 text-sm text-ink placeholder:text-faint focus:outline-none focus:ring-2 focus:ring-orange-700"
          id="onboarding-password"
          minLength={8}
          onChange={(event) => setPassword(event.target.value)}
          placeholder="At least 8 characters"
          required
          type="password"
          value={password}
        />
        <p className="mt-1 text-[11px] text-faint">
          You can use this with your username to log in, or keep using Google.
        </p>
      </div>

      <div>
        <label
          className="mb-1 block text-xs font-medium text-muted"
          htmlFor="onboarding-confirm-password"
        >
          Confirm password
        </label>
        <input
          autoComplete="new-password"
          className="w-full rounded-lg border border-line bg-surface px-3 py-2.5 text-sm text-ink placeholder:text-faint focus:outline-none focus:ring-2 focus:ring-orange-700"
          id="onboarding-confirm-password"
          minLength={8}
          onChange={(event) => setConfirmPassword(event.target.value)}
          placeholder="Repeat your password"
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
        <CheckCircle2 className="size-4" />
        {submitting ? "Saving..." : "Finish account setup"}
      </button>
    </form>
  );
}
