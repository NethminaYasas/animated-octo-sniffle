import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { connection } from "next/server";
import { Suspense } from "react";

import { AuthShell } from "@/components/auth-shell";
import { isInternalEmail } from "@/lib/auth/internal-email";
import { createClient } from "@/lib/supabase/server";

import { OnboardingForm } from "./onboarding-form";

export const metadata: Metadata = {
  title: "Finish your account · kaluwo",
};

export default function OnboardingPage() {
  return (
    <AuthShell
      title="Choose your username"
      subtitle="Google verified your identity. Pick a username and a password so you can sign in both ways."
    >
      <Suspense fallback={<p className="text-sm text-muted">Loading...</p>}>
        <OnboardingContent />
      </Suspense>
    </AuthShell>
  );
}

async function OnboardingContent() {
  // JWT validation reads the current time, so this must run at request time.
  await connection();

  const supabase = await createClient();
  const { data: claimsData, error: claimsError } =
    await supabase.auth.getClaims();

  if (claimsError || !claimsData) {
    redirect("/login?next=/onboarding");
  }

  const userId = String(claimsData.claims.sub ?? "");

  if (!userId) {
    redirect("/login?next=/onboarding");
  }

  const { data: profile, error: profileError } = await supabase
    .from("profiles")
    .select("username, onboarding_completed")
    .eq("id", userId)
    .maybeSingle();

  if (profileError) {
    return (
      <div className="rounded-xl border border-amber-200 bg-amber-50 p-5 text-amber-900 dark:border-amber-800/70 dark:bg-amber-950/40 dark:text-amber-200">
        <p className="font-semibold">Could not load your profile.</p>
        <p className="mt-1 text-sm">
          Make sure the database migrations in{" "}
          <code className="font-mono">supabase/migrations/</code> have been
          applied.
        </p>
      </div>
    );
  }

  if (!profile) {
    return (
      <div className="rounded-xl border border-amber-200 bg-amber-50 p-5 text-amber-900 dark:border-amber-800/70 dark:bg-amber-950/40 dark:text-amber-200">
        <p className="font-semibold">No profile row was found.</p>
        <p className="mt-1 text-sm">
          The auth trigger should create one. Apply the database migrations and
          try again.
        </p>
      </div>
    );
  }

  if (profile.onboarding_completed) {
    redirect("/profile");
  }

  const email =
    typeof claimsData.claims.email === "string" &&
    !isInternalEmail(claimsData.claims.email)
      ? claimsData.claims.email
      : null;

  return <OnboardingForm email={email} initialUsername={profile.username} />;
}
