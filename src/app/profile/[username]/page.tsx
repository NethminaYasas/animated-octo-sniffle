import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { connection } from "next/server";
import { Suspense } from "react";

import { ForumShell } from "@/components/forum-shell";
import { isBanActive } from "@/lib/ban";
import { usernameFromParam } from "@/lib/auth/validation";
import type { UserRole } from "@/lib/roles";
import { createClient } from "@/lib/supabase/server";

import { ProfileActivity } from "../profile-activity";
import { ProfileHeader, type PublicProfile } from "../profile-header";
import { ProfileModerationPanel } from "../profile-moderation-panel";

type ProfilePageProps = {
  params: Promise<{ username: string }>;
};

export async function generateMetadata({
  params,
}: ProfilePageProps): Promise<Metadata> {
  const { username } = await params;

  return {
    title: `${usernameFromParam(username)} · kaluwo`,
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

type ViewerModeration = {
  role: UserRole;
  isBanned: boolean;
};

type WarningRow = {
  id: number;
  reason: string;
  created_at: string;
  acknowledged_at: string | null;
  moderator_username?: string | null;
};

type BanRow = {
  id: number;
  reason: string;
  expires_at: string | null;
  created_at: string;
  lifted_at: string | null;
  lift_reason: string | null;
  banned_by_username?: string | null;
};

async function PublicProfileContent({ params }: ProfilePageProps) {
  const { username } = await params;

  // The page reads request data and the session, so it cannot be prerendered.
  await connection();

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("profiles")
    .select(
      "id, username, avatar_url, role, is_banned, banned_until, reaction_score, onboarding_completed, created_at",
    )
    .eq("username", usernameFromParam(username))
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

  let viewerModeration: ViewerModeration | null = null;

  if (viewerId) {
    const { data: viewerProfile } = await supabase
      .from("profiles")
      .select("role, is_banned, banned_until")
      .eq("id", viewerId)
      .maybeSingle();

    if (viewerProfile) {
      viewerModeration = {
        role: viewerProfile.role,
        isBanned: isBanActive(
          viewerProfile.is_banned,
          viewerProfile.banned_until,
        ),
      };
    }
  }

  const viewerIsStaff = Boolean(
    viewerModeration &&
      !viewerModeration.isBanned &&
      (viewerModeration.role === "moderator" ||
        viewerModeration.role === "admin"),
  );

  let warnings: WarningRow[] = [];
  let bans: BanRow[] = [];

  if (isOwnProfile) {
    const [warningResponse, banResponse] = await Promise.all([
      supabase.rpc("my_warnings"),
      supabase.rpc("my_bans"),
    ]);

    warnings = (
      (warningResponse.data ?? []) as Array<{
        id: number;
        reason: string;
        created_at: string;
        acknowledged_at: string | null;
      }>
    )
      .slice(0, 20)
      .map((row) => ({
        id: row.id,
        reason: row.reason,
        created_at: row.created_at,
        acknowledged_at: row.acknowledged_at,
      }));

    bans = (
      (banResponse.data ?? []) as Array<{
        id: number;
        reason: string;
        expires_at: string | null;
        created_at: string;
        lifted_at: string | null;
        lift_reason: string | null;
      }>
    )
      .slice(0, 20)
      .map((row) => ({
        id: row.id,
        reason: row.reason,
        expires_at: row.expires_at,
        created_at: row.created_at,
        lifted_at: row.lifted_at,
        lift_reason: row.lift_reason,
      }));
  } else if (viewerIsStaff) {
    const [warningResponse, banResponse] = await Promise.all([
      supabase
        .from("member_warnings")
        .select(
          "id, reason, created_at, acknowledged_at, moderator:profiles!member_warnings_moderator_id_fkey(username)",
        )
        .eq("user_id", profile.id)
        .order("created_at", { ascending: false })
        .limit(20),
      supabase
        .from("member_bans")
        .select(
          "id, reason, expires_at, created_at, lifted_at, lift_reason, banned_by:profiles!member_bans_banned_by_fkey(username)",
        )
        .eq("user_id", profile.id)
        .order("created_at", { ascending: false })
        .limit(20),
    ]);

    warnings = (
      (warningResponse.data ?? []) as unknown as Array<
        WarningRow & { moderator: { username: string } | null }
      >
    ).map((row) => ({
      ...row,
      moderator_username: row.moderator?.username ?? null,
    }));

    bans = (
      (banResponse.data ?? []) as unknown as Array<
        BanRow & { banned_by: { username: string } | null }
      >
    ).map((row) => ({
      ...row,
      banned_by_username: row.banned_by?.username ?? null,
    }));
  }

  return (
    <>
      <ProfileHeader
        profile={profile}
        profileId={profile.id}
        viewerId={viewerId || null}
        isOwnProfile={isOwnProfile}
      />
      <ProfileModerationPanel
        warnings={warnings}
        bans={bans}
        isOwnProfile={isOwnProfile}
        isStaff={viewerIsStaff}
      />
      <ProfileActivity
        profileId={profile.id}
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
