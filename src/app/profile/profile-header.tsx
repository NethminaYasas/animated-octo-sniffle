import { CalendarDays, Plus, Shield, Sparkles, UserRound } from "lucide-react";
import Link from "next/link";

import { LogoutButton } from "@/components/logout-button";
import { formatRole, type UserRole } from "@/lib/roles";

export type PublicProfile = {
  username: string;
  avatar_url: string | null;
  role: UserRole;
  is_banned: boolean;
  reaction_score: number;
  created_at: string;
};

/**
 * The public part of a profile. It never shows an email address or a Google
 * photo; only the username and the avatar stored on the profile row are used.
 */
export function ProfileHeader({
  profile,
  isOwnProfile,
}: {
  profile: PublicProfile;
  isOwnProfile: boolean;
}) {
  const joined = new Date(profile.created_at).toLocaleDateString("en-GB", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });
  const reactionScore =
    profile.reaction_score > 0
      ? `+${profile.reaction_score}`
      : String(profile.reaction_score);

  return (
    <section className="overflow-hidden rounded-2xl border border-line bg-surface">
      <div
        aria-hidden="true"
        className="relative h-24 bg-[linear-gradient(135deg,#9a3412_0%,#c2410c_45%,#ea580c_100%)] sm:h-32 dark:bg-[linear-gradient(135deg,#7c2d12_0%,#9a3412_45%,#c2410c_100%)]"
      >
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_18%_130%,rgba(255,255,255,0.28),transparent_45%),radial-gradient(circle_at_82%_-30%,rgba(255,255,255,0.2),transparent_42%)]" />
      </div>

      <div className="px-4 pb-4 sm:px-6 sm:pb-5">
        <div className="flex items-end justify-between gap-3">
          <div className="relative z-10 -mt-10 sm:-mt-12">
            {profile.avatar_url ? (
              // eslint-disable-next-line @next/next/no-img-element -- avatar URLs are user-provided
              <img
                src={profile.avatar_url}
                alt=""
                className="size-20 shrink-0 rounded-full border-4 border-surface bg-surface object-cover shadow-sm sm:size-24"
              />
            ) : (
              <span className="grid size-20 shrink-0 place-items-center rounded-full border-4 border-surface bg-orange-700 text-3xl font-bold text-white shadow-sm sm:size-24">
                {profile.username.slice(0, 1).toUpperCase()}
              </span>
            )}
          </div>

          {isOwnProfile ? (
            <div className="flex items-center gap-2 pb-1">
              <Link
                href="/create"
                className="inline-flex items-center gap-1.5 rounded-full bg-orange-700 px-3.5 py-1.5 text-xs font-semibold text-white transition-colors hover:bg-orange-800 dark:bg-orange-600 dark:hover:bg-orange-500"
              >
                <Plus className="size-3.5" aria-hidden="true" />
                New post
              </Link>
              <LogoutButton />
            </div>
          ) : null}
        </div>

        <div className="mt-3">
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1.5">
            <h1 className="text-2xl font-bold tracking-tight text-ink">
              {profile.username}
            </h1>

            <span className="inline-flex items-center gap-1 rounded-full bg-surface-muted px-2 py-0.5 text-[11px] font-semibold text-muted">
              <Shield className="size-3" aria-hidden="true" />
              {formatRole(profile.role)}
            </span>

            {profile.is_banned ? (
              <span className="inline-flex items-center gap-1 rounded-full bg-red-100 px-2 py-0.5 text-[11px] font-semibold text-red-700 dark:bg-red-950/50 dark:text-red-300">
                <UserRound className="size-3" aria-hidden="true" />
                Banned
              </span>
            ) : null}
          </div>

          <dl className="mt-3 flex flex-wrap items-center gap-x-5 gap-y-2 text-sm">
            <div className="flex items-center gap-1.5">
              <Sparkles className="size-4 text-muted" aria-hidden="true" />
              <dt className="sr-only">Reaction score</dt>
              <dd>
                <span className="font-semibold text-ink">{reactionScore}</span>{" "}
                <span className="text-muted">reaction score</span>
              </dd>
            </div>

            <div className="flex items-center gap-1.5">
              <CalendarDays className="size-4 text-muted" aria-hidden="true" />
              <dt className="sr-only">Joined</dt>
              <dd>
                <span className="text-muted">Joined</span>{" "}
                <span className="text-ink">{joined}</span>
              </dd>
            </div>

            <div className="flex items-center gap-1.5">
              <span
                aria-hidden="true"
                className={`size-2 rounded-full ${
                  profile.is_banned ? "bg-red-500" : "bg-emerald-500"
                }`}
              />
              <dt className="sr-only">Status</dt>
              <dd className="text-muted">
                {profile.is_banned ? "Banned" : "Active"}
              </dd>
            </div>
          </dl>
        </div>
      </div>
    </section>
  );
}
