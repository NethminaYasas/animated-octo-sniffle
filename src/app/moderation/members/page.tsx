import Link from "next/link";
import { connection } from "next/server";

import { getServerSession } from "@/lib/auth/server-user";
import { isBanActive } from "@/lib/ban";
import { usernameFromParam } from "@/lib/auth/validation";
import { createClient } from "@/lib/supabase/server";

import { ProfileModerationPanel } from "../../profile/profile-moderation-panel";
import { MemberActions } from "./member-actions";

export const instant = false;

type MemberRow = {
  id: string;
  username: string;
  role: "new_member" | "member" | "senior_member" | "moderator" | "admin";
  is_banned: boolean;
  banned_until: string | null;
  created_at: string;
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

export default async function ModerationMembersPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  await connection();

  const params = await searchParams;
  const rawUsername =
    typeof params.u === "string" ? params.u : "";
  const username = rawUsername ? usernameFromParam(rawUsername) : "";
  const { user } = await getServerSession();

  if (!user) {
    return null;
  }

  if (!username) {
    return (
      <div className="rounded-xl border border-line bg-surface p-5">
        <h2 className="text-sm font-semibold text-ink">Find a member</h2>
        <p className="mt-1 text-xs text-muted">
          Search by exact username to review warnings, bans and roles.
        </p>
        <form method="get" className="mt-3 flex gap-2">
          <input
            name="u"
            type="search"
            required
            placeholder="username"
            className="min-w-0 flex-1 rounded-lg border border-line bg-surface px-3 py-2 text-sm text-ink"
          />
          <button
            type="submit"
            className="rounded-full bg-orange-700 px-4 py-2 text-xs font-semibold text-white hover:bg-orange-800"
          >
            Find
          </button>
        </form>
      </div>
    );
  }

  const supabase = await createClient();
  const { data: memberData } = await supabase
    .from("profiles")
    .select("id, username, role, is_banned, banned_until, created_at")
    .eq("username", username)
    .maybeSingle();

  if (!memberData) {
    return (
      <div className="rounded-xl border border-line bg-surface p-5">
        <p className="text-sm font-semibold text-ink">Member not found</p>
        <Link
          href="/moderation/members"
          className="mt-2 inline-block text-xs font-semibold text-orange-700 hover:underline dark:text-orange-400"
        >
          Try another username
        </Link>
      </div>
    );
  }

  const member = memberData as MemberRow;
  const isBanned = isBanActive(member.is_banned, member.banned_until);

  const [warningResponse, banResponse] = await Promise.all([
    supabase
      .from("member_warnings")
      .select(
        "id, reason, created_at, acknowledged_at, moderator:profiles!member_warnings_moderator_id_fkey(username)",
      )
      .eq("user_id", member.id)
      .order("created_at", { ascending: false })
      .limit(20),
    supabase
      .from("member_bans")
      .select(
        "id, reason, expires_at, created_at, lifted_at, lift_reason, banned_by:profiles!member_bans_banned_by_fkey(username)",
      )
      .eq("user_id", member.id)
      .order("created_at", { ascending: false })
      .limit(20),
  ]);

  const warnings = (
    (warningResponse.data ?? []) as unknown as Array<
      WarningRow & { moderator: { username: string } | null }
    >
  ).map((row) => ({
    ...row,
    moderator_username: row.moderator?.username ?? null,
  }));

  const bans = (
    (banResponse.data ?? []) as unknown as Array<
      BanRow & { banned_by: { username: string } | null }
    >
  ).map((row) => ({
    ...row,
    banned_by_username: row.banned_by?.username ?? null,
  }));

  return (
    <div>
      <Link
        href="/moderation/members"
        className="text-xs font-semibold text-orange-700 hover:underline dark:text-orange-400"
      >
        ← Search another member
      </Link>

      <div className="mt-3 rounded-xl border border-line bg-surface p-4">
        <h2 className="text-lg font-semibold text-ink">{member.username}</h2>
        <p className="mt-1 text-xs text-muted">
          {member.role} · {isBanned ? "banned" : "active"}
          {member.banned_until
            ? ` · until ${new Date(member.banned_until).toLocaleString("en-GB")}`
            : ""}
          {" · joined "}
          {new Date(member.created_at).toLocaleDateString("en-GB")}
        </p>
      </div>

      <ProfileModerationPanel
        warnings={warnings}
        bans={bans}
        isOwnProfile={false}
        isStaff
      />

      <MemberActions
        targetId={member.id}
        username={member.username}
        role={member.role === "new_member" || member.role === "senior_member" ? "member" : member.role}
        isBanned={isBanned}
        viewerId={user.id}
        viewerIsAdmin={user.role === "admin"}
      />
    </div>
  );
}
