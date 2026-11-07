import { notFound } from "next/navigation";

import { getServerSession } from "@/lib/auth/server-user";

import { MessageThread } from "@/components/modmail/MessageThread";
import { ReplyForm } from "@/components/modmail/ReplyForm";

export const instant = false;

export default async function ModmailTicketPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { supabase, user } = await getServerSession();

  if (!user) {
    return notFound();
  }

  const { id: rawId } = await params;

  const { data: ticket, error } = await supabase
    .from("modmail_tickets")
    .select(
      "id, subject, category, status, priority, admin_only, last_message_at, created_at"
    )
    .eq("id", rawId)
    .eq("member_id", user.id)
    .maybeSingle();

  if (error || !ticket) {
    return notFound();
  }

  const { data: messages } = await supabase
    .from("modmail_messages")
    .select("id, author_id, body, created_at")
    .eq("ticket_id", ticket.id)
    .order("created_at", { ascending: true });

  const formattedMessages: { id: number; ticket_id: string; author_id: string; sender_kind: "member" | "staff"; body: string; created_at: string }[] = (messages ?? []).map((m) => ({
    id: m.id as number,
    ticket_id: ticket.id,
    author_id: m.author_id as string,
    sender_kind: (m.author_id as string) === user.id ? "member" : "staff",
    body: m.body as string,
    created_at: m.created_at as string,
  }));

  return (
    <div className="mx-auto w-full max-w-4xl px-3 py-6 sm:px-4">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-lg font-semibold tracking-tight text-ink">
            {ticket.subject}
          </h1>
          <p className="mt-1 text-xs text-muted">
            {ticket.category} &middot; {ticket.status}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <span className="rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-muted">
            {ticket.status}
          </span>
          <span className="rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-muted">
            {ticket.priority}
          </span>
        </div>
      </div>

      <div className="mt-4">
        <MessageThread messages={formattedMessages} />
      </div>

      <div className="mt-6">
        <ReplyForm ticketId={ticket.id} />
      </div>
    </div>
  );
}
