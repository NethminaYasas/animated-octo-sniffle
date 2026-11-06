import { AlertTriangle, Ban } from "lucide-react";

import { AcknowledgeWarningButton } from "@/components/acknowledge-warning-button";

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

function formatDate(value: string): string {
  return new Date(value).toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  });
}

export function ProfileModerationPanel({
  warnings,
  bans,
  isOwnProfile,
  isStaff,
}: {
  warnings: WarningRow[];
  bans: BanRow[];
  isOwnProfile: boolean;
  isStaff: boolean;
}) {
  if (!isOwnProfile && !isStaff) {
    return null;
  }

  if (warnings.length === 0 && bans.length === 0) {
    return null;
  }

  return (
    <section className="mt-4 space-y-3" aria-label="Moderation record">
      {warnings.length > 0 ? (
        <div className="rounded-xl border border-amber-300 bg-amber-50 p-4 dark:border-amber-800/70 dark:bg-amber-950/30">
          <h2 className="flex items-center gap-1.5 text-sm font-semibold text-amber-900 dark:text-amber-200">
            <AlertTriangle className="size-4" aria-hidden="true" />
            Warnings
          </h2>
          <ul className="mt-2 space-y-2">
            {warnings.map((warning) => (
              <li
                key={warning.id}
                className="rounded-lg border border-amber-200/80 bg-surface/70 px-3 py-2 text-xs text-amber-950 dark:border-amber-900/60 dark:bg-amber-950/20 dark:text-amber-100"
              >
                <p className="leading-5">{warning.reason}</p>
                <p className="mt-1 text-[11px] opacity-80">
                  {formatDate(warning.created_at)}
                  {isStaff && warning.moderator_username
                    ? ` · by @${warning.moderator_username}`
                    : ""}
                  {warning.acknowledged_at ? " · acknowledged" : " · unacknowledged"}
                </p>
                {isOwnProfile && !warning.acknowledged_at ? (
                  <div className="mt-2">
                    <AcknowledgeWarningButton warningId={warning.id} />
                  </div>
                ) : null}
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {bans.length > 0 ? (
        <div className="rounded-xl border border-red-300 bg-red-50 p-4 dark:border-red-800/70 dark:bg-red-950/30">
          <h2 className="flex items-center gap-1.5 text-sm font-semibold text-red-900 dark:text-red-200">
            <Ban className="size-4" aria-hidden="true" />
            Ban history
          </h2>
          <ul className="mt-2 space-y-2">
            {bans.map((ban) => (
              <li
                key={ban.id}
                className="rounded-lg border border-red-200/80 bg-surface/70 px-3 py-2 text-xs text-red-950 dark:border-red-900/60 dark:bg-red-950/20 dark:text-red-100"
              >
                <p className="leading-5">{ban.reason}</p>
                <p className="mt-1 text-[11px] opacity-80">
                  Issued {formatDate(ban.created_at)}
                  {ban.expires_at ? ` · ${formatDate(ban.expires_at)}` : " · no expiry"}
                  {ban.lifted_at ? " · lifted" : ""}
                  {isStaff && ban.banned_by_username
                    ? ` · by @${ban.banned_by_username}`
                    : ""}
                </p>
                {ban.lift_reason ? (
                  <p className="mt-1 text-[11px] opacity-80">
                    Lift reason: {ban.lift_reason}
                  </p>
                ) : null}
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </section>
  );
}
