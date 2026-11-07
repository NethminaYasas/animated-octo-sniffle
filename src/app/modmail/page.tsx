import { notFound } from "next/navigation";

import { getServerSession } from "@/lib/auth/server-user";

import { TicketList } from "@/components/modmail/TicketList";
import { OpenTicketForm } from "@/components/modmail/OpenTicketForm";
import type { ModmailTicketListItem } from "@/lib/modmail/types";

export const instant = false;

export default async function ModmailPage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const { supabase, user } = await getServerSession();
  void searchParams;

  if (!user) {
    return notFound();
  }

  const { data: tickets, error } = await supabase.rpc("my_tickets");

  if (error) {
    console.error("my_tickets failed:", error.message);
    return (
      <div className="mx-auto w-full max-w-4xl px-3 py-6 sm:px-4">
        <div className="rounded-xl border border-amber-200 bg-amber-50 p-5 text-amber-900 dark:border-amber-800/70 dark:bg-amber-950/40 dark:text-amber-200">
          Could not load your tickets. Try again shortly.
        </div>
      </div>
    );
  }

  const typedTickets: ModmailTicketListItem[] = (tickets ?? []).map((t) => ({
    id: t.id,
    subject: t.subject,
    category: t.category as ModmailTicketListItem["category"],
    status: t.status as ModmailTicketListItem["status"],
    admin_only: t.admin_only,
    last_message_at: t.last_message_at,
    created_at: t.created_at,
  }));

  return (
    <div className="mx-auto w-full max-w-4xl px-3 py-6 sm:px-4">
      <h1 className="text-lg font-semibold tracking-tight text-ink">
        Modmail
      </h1>
      <p className="mt-1 text-sm text-muted">
        Messages with the moderation team. Staff replies appear as
        &ldquo;Moderation team&rdquo;.
      </p>

      <div className="mt-6 space-y-3">
        <TicketList tickets={typedTickets} />
      </div>

      <div className="mt-8">
        <OpenTicketForm />
      </div>
    </div>
  );
}
