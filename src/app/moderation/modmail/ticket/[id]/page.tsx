import { notFound } from "next/navigation";

import { getServerSession } from "@/lib/auth/server-user";

import { getStaffTicketDetail } from "@/lib/modmail/staff-ticket";
import { MessageThread } from "@/components/modmail/MessageThread";
import { ReplyForm } from "@/components/modmail/ReplyForm";
import { InternalNoteForm } from "@/components/modmail/InternalNoteForm";
import { StatusForm } from "@/components/modmail/StatusForm";
import { PriorityForm } from "@/components/modmail/PriorityForm";
import { AssignmentForm } from "@/components/modmail/AssignmentForm";

export const instant = false;

export default async function ModmailStaffTicketPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { user } = await getServerSession();

  if (
    !user ||
    user.isBanned ||
    (user.role !== "moderator" && user.role !== "admin")
  ) {
    return notFound();
  }

  const { id: rawId } = await params;
  const { ticket, error } = await getStaffTicketDetail(rawId);

  if (error || !ticket) {
    return notFound();
  }

  return (
    <div className="mx-auto w-full max-w-5xl px-3 py-6 sm:px-4">
      <div className="flex items-start justify-between gap-4 mb-6">
        <div>
          <h1 className="text-lg font-semibold tracking-tight text-ink">
            {ticket.subject}
          </h1>
          <p className="mt-1 text-sm text-muted">
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
          {ticket.admin_only && (
            <span className="rounded-full px-2 py-0.5 text-[10px] font-semibold text-red-700 bg-red-50">
              Admin only
            </span>
          )}
        </div>
      </div>

      <div className="mt-4">
        <MessageThread
          messages={ticket.messages.map((m) => ({
            id: m.id,
            ticket_id: ticket.id,
            author_id: m.author_id,
            sender_kind: m.author_id === ticket.member_id ? "member" : "staff",
            body: m.body,
            created_at: m.created_at,
          }))}
        />
      </div>

      <div className="mt-6 space-y-4">
        <ReplyForm ticketId={ticket.id} />
        <InternalNoteForm ticketId={ticket.id} />
      </div>

      <div className="mt-6 grid grid-cols-1 md:grid-cols-3 gap-4">
        <StatusForm
          ticketId={ticket.id}
          currentStatus={ticket.status}
        />
        <PriorityForm
          ticketId={ticket.id}
          currentPriority={ticket.priority}
        />
        <AssignmentForm
          ticketId={ticket.id}
          currentAssigneeId={ticket.assignee_id}
        />
      </div>
    </div>
  );
}
