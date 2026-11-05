import type { Metadata } from "next";
import Link from "next/link";

import { AuthShell } from "@/components/auth-shell";

export const metadata: Metadata = {
  title: "Authentication error · kaluwo",
};

export default function AuthCodeErrorPage() {
  return (
    <AuthShell
      title="That link did not work"
      subtitle="The confirmation or reset link is invalid, expired, or was opened in a different browser."
    >
      <div className="space-y-4 text-sm text-muted">
        <p>Try one of these:</p>

        <ul className="list-disc space-y-1 pl-5">
          <li>Open the link from the same browser you used to sign up.</li>
          <li>Request a new password reset email.</li>
          <li>Log in if your email is already confirmed.</li>
        </ul>

        <div className="flex flex-wrap gap-2 pt-1">
          <Link
            className="rounded-full bg-orange-700 px-4 py-2 text-xs font-semibold text-white transition-colors hover:bg-orange-800"
            href="/login"
          >
            Log in
          </Link>
          <Link
            className="rounded-full border border-line px-4 py-2 text-xs font-semibold text-muted transition-colors hover:bg-surface-muted hover:text-ink"
            href="/forgot-password"
          >
            Reset password
          </Link>
        </div>
      </div>
    </AuthShell>
  );
}
