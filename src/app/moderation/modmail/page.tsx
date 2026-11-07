import { getServerSession } from "@/lib/auth/server-user";
import { notFound } from "next/navigation";

import { getStaffTickets } from "@/lib/modmail/staff-actions";
import { TicketList } from "@/components/modmail/TicketList";
import { TicketFilters } from "@/components/modmail/TicketFilters";
import { ModmailInboxBadge } from "@/components/modmail/ModmailInboxBadge";
import { StaffOpenTicketForm } from "@/components/modmail/StaffOpenTicketForm";
import type { ModmailTicketListItem, ModmailTicketFilter } from "@/lib/modmail/types";

export const instant = false;

export default async function ModmailStaffPage({
  searchParams,
}: {
  searchParams: Promise<{ filter?: string }>;
}) {
  const { user } = await getServerSession();

  if (
    !user ||
    user.isBanned ||
    (user.role !== "moderator" && user.role !== "admin")
  ) {
    return notFound();
  }

  const params = await searchParams;
  const ALLOWED_FILTERS = [
    "open",
    "pending",
    "resolved",
    "closed",
    "mine",
    "unassigned",
    "all",
  ] as const;
  const filter =
    (ALLOWED_FILTERS as readonly string[]).includes(params.filter ?? "")
      ? (params.filter as ModmailTicketFilter)
      : "open";

  const { tickets, error } = await getStaffTickets(filter);

  if (error) {
    return (
      <div className="mx-auto w-full max-w-5xl px-3 py-6 sm:px-4">
        <div className="rounded-xl border border-amber-200 bg-amber-50 p-5 text-amber-900 dark:border-amber-800/70 dark:bg-amber-950/40 dark:text-amber-200">
          Could not load tickets. Try again shortly.
        </div>
      </div>
    );
  }

  const displayTickets: ModmailTicketListItem[] = tickets.map((t) => ({
    id: t.id,
    subject: t.subject,
    category: t.category as ModmailTicketListItem["category"],
    status: t.status as ModmailTicketListItem["status"],
    priority: (t.priority as ModmailTicketListItem["priority"]) || "normal",
    admin_only: t.admin_only,
    last_message_at: t.last_message_at,
    created_at: t.created_at,
  }));

  return (
    <div className="mx-auto w-full max-w-5xl px-3 py-6 sm:px-4">
      <div className="flex items-start justify-between gap-4 mb-6">
        <div>
          <h1 className="text-lg font-semibold tracking-tight text-ink">
            Modmail
          </h1>
          <p className="mt-1 text-sm text-muted">
            Staff inbox. Staff replies appear as &ldquo;Moderation team&rdquo;.
          </p>
        </div>
        <div className="flex items-end gap-2">
          <ModmailInboxBadge />
        </div>
      </div>

      <TicketFilters currentFilter={filter} />

      <div className="mt-6 space-y-3">
        <TicketList tickets={displayTickets} hrefBase="/moderation/modmail/ticket" />
      </div>

      <div className="mt-8">
        <StaffOpenTicketForm />
      </div>
    </div>
  );
}
