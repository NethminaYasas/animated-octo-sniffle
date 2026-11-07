"use client";

import Link from "next/link";

import type { ModmailTicketListItem } from "@/lib/modmail/types";
import { CATEGORY_LABELS, STATUS_LABELS } from "@/lib/modmail/types";
import { StatusBadge } from "@/components/modmail/StatusBadge";
import { PriorityBadge } from "@/components/modmail/PriorityBadge";

export function TicketList({
  tickets,
  hrefBase = "/modmail/ticket",
}: {
  tickets: ModmailTicketListItem[];
  hrefBase?: string;
}) {
  const typedTickets = tickets as ModmailTicketListItem[];
  if (tickets.length === 0) {
    return (
      <div className="rounded-xl border border-dashed border-line bg-surface p-8 text-center text-sm text-muted">
        No tickets.
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {typedTickets.map((ticket) => (
        <TicketCard key={ticket.id} ticket={ticket} hrefBase={hrefBase} />
      ))}
    </div>
  );
}

function TicketCard({
  ticket,
  hrefBase,
}: {
  ticket: ModmailTicketListItem;
  hrefBase?: string;
}) {
  return (
    <Link
      href={`${hrefBase}/${ticket.id}`}
      className="block rounded-xl border border-line bg-surface p-4"
    >
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="flex-1">
          <h3 className="text-sm font-semibold text-ink truncate">
            {ticket.subject}
          </h3>
          <p className="mt-0.5 text-xs text-muted">
            {CATEGORY_LABELS[ticket.category]} &middot;{" "}
            {STATUS_LABELS[ticket.status]}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <StatusBadge status={ticket.status} />
          {ticket.priority && <PriorityBadge priority={ticket.priority} />}
        </div>
      </div>
      <p className="mt-2 text-xs text-muted">
        {new Date(ticket.last_message_at).toLocaleString(undefined, {
          dateStyle: "short",
          timeStyle: "short",
        })}
      </p>
    </Link>
  );
}
