import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { connection } from "next/server";
import { Suspense } from "react";

import { ForumShell } from "@/components/forum-shell";
import { normaliseUsername } from "@/lib/auth/validation";
import { createClient } from "@/lib/supabase/server";

import { ProfileActivity } from "../profile-activity";
import { ProfileHeader, type PublicProfile } from "../profile-header";

type ProfilePageProps = {
  params: Promise<{ username: string }>;
};

export async function generateMetadata({
  params,
}: ProfilePageProps): Promise<Metadata> {
  const { username } = await params;

  return {
    title: `${normaliseUsername(username)} · kaluwo`,
  };
}

/**
 * Public profile page. Anyone can read it; the owner additionally gets the
 * New post and Log out controls.
 */
export default function PublicProfilePage({ params }: ProfilePageProps) {
  return (
    <ForumShell activeBoard={undefined}>
      <div className="mx-auto w-full max-w-3xl">
        <Suspense fallback={<ProfileSkeleton />}>
          <PublicProfileContent params={params} />
        </Suspense>
      </div>
    </ForumShell>
  );
}

type ProfileRow = PublicProfile & {
  id: string;
  onboarding_completed: boolean;
};

async function PublicProfileContent({ params }: ProfilePageProps) {
  const { username } = await params;

  // The page reads request data and the session, so it cannot be prerendered.
  await connection();

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("profiles")
    .select(
      "id, username, avatar_url, role, is_banned, reaction_score, onboarding_completed, created_at",
    )
    .eq("username", normaliseUsername(username))
    .maybeSingle();

  if (error) {
    return (
      <div className="rounded-xl border border-amber-200 bg-amber-50 p-5 text-amber-900 dark:border-amber-800/70 dark:bg-amber-950/40 dark:text-amber-200">
        <p className="font-semibold">Could not load this profile.</p>
        <p className="mt-1 text-sm">Try again in a moment.</p>
      </div>
    );
  }

  if (!data) {
    notFound();
  }

  const profile = data as ProfileRow;
  const { data: claimsData } = await supabase.auth.getClaims();
  const viewerId = String(claimsData?.claims.sub ?? "");
  const isOwnProfile = viewerId !== "" && viewerId === profile.id;

  if (!isOwnProfile && !profile.onboarding_completed) {
    // Until onboarding finishes, the provisional username is derived from the
    // account email. Do not publish it.
    notFound();
  }

  if (isOwnProfile && !profile.onboarding_completed) {
    redirect("/onboarding");
  }

  return (
    <>
      <ProfileHeader profile={profile} isOwnProfile={isOwnProfile} />
      <ProfileActivity
        username={profile.username}
        isOwnProfile={isOwnProfile}
      />
    </>
  );
}

function ProfileSkeleton() {
  return (
    <div aria-busy="true" aria-label="Loading profile" className="space-y-4">
      <div className="h-64 animate-pulse rounded-2xl border border-line bg-surface" />
      <div className="h-44 animate-pulse rounded-xl border border-line bg-surface" />
    </div>
  );
}
