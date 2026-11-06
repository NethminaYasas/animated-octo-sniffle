import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { connection } from "next/server";
import { Suspense } from "react";

import { ForumShell } from "@/components/forum-shell";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = {
  title: "Your profile · kaluwo",
};

/**
 * Shortcut for the signed-in member. The actual profile lives at the public
 * /profile/[username] route so it can be shared and read by anyone.
 */
export default function ProfilePage() {
  return (
    <ForumShell activeBoard={undefined}>
      <div className="mx-auto w-full max-w-3xl">
        <Suspense fallback={<ProfileSkeleton />}>
          <ProfileRedirect />
        </Suspense>
      </div>
    </ForumShell>
  );
}

async function ProfileRedirect() {
  // JWT validation reads the current time, so this must run at request time.
  await connection();

  const supabase = await createClient();
  const { data: claimsData, error: claimsError } =
    await supabase.auth.getClaims();

  if (claimsError || !claimsData) {
    redirect("/login?next=/profile");
  }

  const userId = String(claimsData.claims.sub ?? "");

  if (!userId) {
    redirect("/login?next=/profile");
  }

  const { data: profile, error: profileError } = await supabase
    .from("profiles")
    .select("username, onboarding_completed")
    .eq("id", userId)
    .maybeSingle();

  if (profileError || !profile) {
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

  if (!profile.onboarding_completed) {
    redirect("/onboarding");
  }

  redirect(`/profile/${encodeURIComponent(profile.username)}`);
}

function ProfileSkeleton() {
  return (
    <div className="space-y-4" aria-busy="true" aria-label="Loading profile">
      <div className="h-64 animate-pulse rounded-2xl border border-line bg-surface" />
      <div className="h-44 animate-pulse rounded-xl border border-line bg-surface" />
    </div>
  );
}
