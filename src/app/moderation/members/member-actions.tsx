"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";

import {
  banUser,
  setMemberRole,
  unbanUser,
  warnUser,
} from "@/lib/moderation/actions";

type MemberRole = "member" | "moderator" | "admin";

export function MemberActions({
  targetId,
  username,
  role,
  isBanned,
  viewerId,
  viewerIsAdmin,
}: {
  targetId: string;
  username: string;
  role: MemberRole;
  isBanned: boolean;
  viewerId: string;
  viewerIsAdmin: boolean;
}) {
  const router = useRouter();
  const [roleValue, setRoleValue] = useState<MemberRole>(role);
  const [roleReason, setRoleReason] = useState("");
  const [banReason, setBanReason] = useState("");
  const [banUntil, setBanUntil] = useState("");
  const [unbanReason, setUnbanReason] = useState("");
  const [warnReason, setWarnReason] = useState("");
  const [pending, setPending] = useState<string | null>(null);

  const isSelf = targetId === viewerId;
  const canBan =
    !isSelf &&
    role !== "admin" &&
    (role !== "moderator" || viewerIsAdmin);
  const canWarn =
    !isSelf && (role !== "moderator" && role !== "admin" || viewerIsAdmin);

  const run = async (
    key: string,
    action: () => Promise<{ ok: true; changed: boolean } | { ok: false; error: string }>,
    success: string,
  ) => {
    if (pending) {
      return;
    }

    setPending(key);

    try {
      const result = await action();

      if (!result.ok) {
        toast.error(success, { description: result.error });
        return;
      }

      toast.success(result.changed ? success : "No change needed");
      router.refresh();
    } catch {
      toast.error("Could not reach the server. Try again.");
    } finally {
      setPending(null);
    }
  };

  return (
    <div className="mt-4 grid gap-3">
      {viewerIsAdmin ? (
        <section className="rounded-xl border border-line bg-surface p-4">
          <h2 className="text-sm font-semibold text-ink">Role</h2>
          <p className="mt-1 text-xs text-muted">
            Role changes are admin-only and cannot remove the last admin.
          </p>
          <div className="mt-2 flex flex-wrap items-end gap-2">
            <label className="text-xs font-medium text-muted">
              New role
              <select
                value={roleValue}
                onChange={(event) =>
                  setRoleValue(event.target.value as MemberRole)
                }
                className="mt-1 block rounded-lg border border-line bg-surface px-2 py-1.5 text-xs text-ink"
              >
                <option value="member">Member</option>
                <option value="moderator">Moderator</option>
                <option value="admin">Admin</option>
              </select>
            </label>
            <label className="min-w-56 flex-1 text-xs font-medium text-muted">
              Reason
              <input
                value={roleReason}
                onChange={(event) => setRoleReason(event.target.value)}
                maxLength={1000}
                className="mt-1 block w-full rounded-lg border border-line bg-surface px-2 py-1.5 text-xs text-ink"
                placeholder="Why is the role changing?"
              />
            </label>
            <button
              type="button"
              disabled={pending !== null || roleReason.trim().length === 0}
              onClick={() =>
                void run(
                  "role",
                  () =>
                    setMemberRole({
                      targetId,
                      role: roleValue,
                      reason: roleReason,
                    }),
                  `Role updated for @${username}`,
                )
              }
              className="rounded-full bg-orange-700 px-3 py-2 text-xs font-semibold text-white hover:bg-orange-800 disabled:opacity-60"
            >
              {pending === "role" ? "Saving…" : "Apply role"}
            </button>
          </div>
        </section>
      ) : null}

      {canBan ? (
        <section className="rounded-xl border border-line bg-surface p-4">
          <h2 className="text-sm font-semibold text-ink">Ban</h2>
          <p className="mt-1 text-xs text-muted">
            Expiry is enforced against the current time. Leave it blank for a
            permanent ban.
          </p>
          <div className="mt-2 grid gap-2 sm:grid-cols-2">
            <label className="text-xs font-medium text-muted">
              Reason
              <input
                value={banReason}
                onChange={(event) => setBanReason(event.target.value)}
                maxLength={1000}
                className="mt-1 block w-full rounded-lg border border-line bg-surface px-2 py-1.5 text-xs text-ink"
                placeholder="Why is this ban needed?"
              />
            </label>
            <label className="text-xs font-medium text-muted">
              Expiry (optional)
              <input
                type="datetime-local"
                value={banUntil}
                onChange={(event) => setBanUntil(event.target.value)}
                className="mt-1 block w-full rounded-lg border border-line bg-surface px-2 py-1.5 text-xs text-ink"
              />
            </label>
          </div>
          <button
            type="button"
            disabled={pending !== null || banReason.trim().length === 0}
            onClick={() =>
              void run(
                "ban",
                () =>
                  banUser({
                    targetId,
                    reason: banReason,
                    until: banUntil ? new Date(banUntil).toISOString() : null,
                  }),
                `Ban saved for @${username}`,
              )
            }
            className="mt-2 rounded-full bg-red-700 px-3 py-2 text-xs font-semibold text-white hover:bg-red-800 disabled:opacity-60"
          >
            {pending === "ban" ? "Saving…" : "Ban member"}
          </button>
        </section>
      ) : null}

      {isBanned && canBan ? (
        <section className="rounded-xl border border-line bg-surface p-4">
          <h2 className="text-sm font-semibold text-ink">Unban</h2>
          <div className="mt-2 flex flex-wrap items-end gap-2">
            <label className="min-w-56 flex-1 text-xs font-medium text-muted">
              Reason
              <input
                value={unbanReason}
                onChange={(event) => setUnbanReason(event.target.value)}
                maxLength={1000}
                className="mt-1 block w-full rounded-lg border border-line bg-surface px-2 py-1.5 text-xs text-ink"
                placeholder="Why is the ban being lifted?"
              />
            </label>
            <button
              type="button"
              disabled={pending !== null || unbanReason.trim().length === 0}
              onClick={() =>
                void run(
                  "unban",
                  () =>
                    unbanUser({
                      targetId,
                      reason: unbanReason,
                    }),
                  `Ban lifted for @${username}`,
                )
              }
              className="rounded-full border border-line px-3 py-2 text-xs font-semibold text-muted hover:bg-surface-muted hover:text-ink disabled:opacity-60"
            >
              {pending === "unban" ? "Saving…" : "Lift ban"}
            </button>
          </div>
        </section>
      ) : null}

      {canWarn ? (
        <section className="rounded-xl border border-line bg-surface p-4">
          <h2 className="text-sm font-semibold text-ink">Warning</h2>
          <div className="mt-2 flex flex-wrap items-end gap-2">
            <label className="min-w-56 flex-1 text-xs font-medium text-muted">
              Reason
              <input
                value={warnReason}
                onChange={(event) => setWarnReason(event.target.value)}
                maxLength={1000}
                className="mt-1 block w-full rounded-lg border border-line bg-surface px-2 py-1.5 text-xs text-ink"
                placeholder="What should the member know?"
              />
            </label>
            <button
              type="button"
              disabled={pending !== null || warnReason.trim().length === 0}
              onClick={() =>
                void run(
                  "warn",
                  () =>
                    warnUser({
                      targetId,
                      reason: warnReason,
                    }),
                  `Warning saved for @${username}`,
                )
              }
              className="rounded-full bg-amber-700 px-3 py-2 text-xs font-semibold text-white hover:bg-amber-800 disabled:opacity-60"
            >
              {pending === "warn" ? "Saving…" : "Warn member"}
            </button>
          </div>
        </section>
      ) : null}
    </div>
  );
}
