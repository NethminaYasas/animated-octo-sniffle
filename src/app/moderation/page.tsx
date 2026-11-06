import { ClipboardList, ScrollText, ShieldAlert, Users } from "lucide-react";
import Link from "next/link";

import { getServerSession } from "@/lib/auth/server-user";

export const instant = false;

export default async function ModerationOverviewPage() {
  const { user } = await getServerSession();
  const isAdmin = user?.role === "admin";

  const cards = [
    {
      href: "/moderation/reports",
      title: "Reports",
      description: "Open, resolved and dismissed reports.",
      Icon: ShieldAlert,
    },
    {
      href: "/moderation/log",
      title: "Mod log",
      description: "Append-only record of every staff action.",
      Icon: ScrollText,
    },
    {
      href: "/moderation/members",
      title: "Members",
      description: "Warnings, bans and role changes.",
      Icon: Users,
    },
    ...(isAdmin
      ? [
          {
            href: "/moderation/invites",
            title: "Invite codes",
            description: "Create and revoke single-use sign-up codes.",
            Icon: ClipboardList,
          },
        ]
      : []),
  ];

  return (
    <div className="grid gap-3 sm:grid-cols-2">
      {cards.map(({ href, title, description, Icon }) => (
        <Link
          key={href}
          href={href}
          className="rounded-xl border border-line bg-surface p-4 transition-colors hover:border-orange-700/40 hover:bg-surface-muted dark:hover:border-orange-500/40"
        >
          <Icon className="size-5 text-orange-700 dark:text-orange-400" />
          <h2 className="mt-2 text-sm font-semibold text-ink">{title}</h2>
          <p className="mt-1 text-xs leading-5 text-muted">{description}</p>
        </Link>
      ))}
    </div>
  );
}
