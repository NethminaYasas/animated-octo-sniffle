import { Shield, Sparkles, UserRound } from "lucide-react";
import { redirect } from "next/navigation";

import { LogoutButton } from "@/components/logout-button";
import { createClient } from "@/lib/supabase/server";

type ProfileRow = {
  username: string;
  avatar_url: string | null;
  role: "member" | "moderator" | "admin";
  is_banned: boolean;
  reaction_score: number;
  created_at: string;
};

export async function ProfileContent() {
  const supabase = await createClient();
  const { data: claimsData, error: claimsError } =
    await supabase.auth.getClaims();

  if (claimsError || !claimsData) {
    redirect("/login?next=/profile");
  }

  const userId = String(claimsData.claims.sub ?? "");
  const email =
    typeof claimsData.claims.email === "string"
      ? claimsData.claims.email
      : "";

  if (!userId) {
    redirect("/login?next=/profile");
  }

  const { data, error: profileError } = await supabase
    .from("profiles")
    .select("username, avatar_url, role, is_banned, reaction_score, created_at")
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

  const profile = data as ProfileRow | null;

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

  const joined = new Date(profile.created_at).toLocaleDateString("en-GB", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });

  return (
    <section className="rounded-xl border border-line bg-surface p-5 sm:p-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex items-center gap-3">
          <span className="grid size-12 shrink-0 place-items-center rounded-full bg-orange-700 text-lg font-bold text-white">
            {profile.username.slice(0, 1).toUpperCase()}
          </span>
          <div className="min-w-0">
            <h1 className="truncate text-xl font-bold tracking-tight text-ink">
              @{profile.username}
            </h1>
            {email ? (
              <p className="truncate text-sm text-muted">{email}</p>
            ) : null}
          </div>
        </div>

        <LogoutButton />
      </div>

      <dl className="mt-6 grid gap-4 border-t border-line pt-5 sm:grid-cols-2">
        <div>
          <dt className="text-xs font-medium text-faint">Role</dt>
          <dd className="mt-1 flex items-center gap-1.5 text-sm text-ink">
            <Shield className="size-4 text-muted" />
            <span className="capitalize">{profile.role}</span>
          </dd>
        </div>

        <div>
          <dt className="text-xs font-medium text-faint">Reaction score</dt>
          <dd className="mt-1 flex items-center gap-1.5 text-sm text-ink">
            <Sparkles className="size-4 text-muted" />
            {profile.reaction_score > 0
              ? `+${profile.reaction_score}`
              : profile.reaction_score}
          </dd>
        </div>

        <div>
          <dt className="text-xs font-medium text-faint">Status</dt>
          <dd className="mt-1 flex items-center gap-1.5 text-sm text-ink">
            <UserRound className="size-4 text-muted" />
            {profile.is_banned ? "Banned" : "Active"}
          </dd>
        </div>

        <div>
          <dt className="text-xs font-medium text-faint">Joined</dt>
          <dd className="mt-1 text-sm text-ink">{joined}</dd>
        </div>

        <div>
          <dt className="text-xs font-medium text-faint">Login</dt>
          <dd className="mt-1 text-sm text-ink">
            Username and password
          </dd>
        </div>
      </dl>

      <p className="mt-6 text-xs text-faint">
        Reaction score is positive reactions minus negative reactions on your
        comments. Profile editing, avatars and posting history arrive in later
        steps.
      </p>
    </section>
  );
}
