"use server";

import { createAdminClient } from "@/lib/supabase/admin";
import { getServerSession } from "@/lib/auth/server-user";

export type StaffTicketDetail = {
  id: string;
  member_id: string;
  subject_user_id: string | null;
  subject: string;
  category: string;
  status: string;
  priority: string;
  admin_only: boolean;
  assignee_id: string | null;
  opened_by: string | null;
  closed_by: string | null;
  closed_at: string | null;
  resolved_at: string | null;
  status_changed_at: string;
  reopened_at: string | null;
  reopen_count: number;
  last_message_at: string;
  created_at: string;
};

export async function getStaffTicketDetail(ticketId: string) {
  const { user } = await getServerSession();

  if (
    !user ||
    user.isBanned ||
    (user.role !== "moderator" && user.role !== "admin")
  ) {
    return { ticket: null, error: "Unauthorized" };
  }

  const admin = createAdminClient()!;

  const { data: ticket, error } = await admin
    .from("modmail_tickets")
    .select("*")
    .eq("id", ticketId)
    .maybeSingle();

  if (error || !ticket) {
    return { ticket: null, error: "Ticket not found" };
  }

  // Conflict checks
  if (ticket.member_id === user.id) {
    return { ticket: null, error: "Cannot access your own ticket" };
  }
  if (ticket.subject_user_id === user.id) {
    return { ticket: null, error: "Cannot access a ticket about yourself" };
  }
  if (ticket.admin_only && user.role !== "admin") {
    return { ticket: null, error: "Only admins can access this ticket" };
  }

  const { data: messages } = await admin
    .from("modmail_messages")
    .select("id, author_id, body, created_at")
    .eq("ticket_id", ticket.id)
    .order("created_at", { ascending: true });

  const { data: notes } = await admin
    .from("modmail_internal_notes")
    .select("id, author_id, body, created_at")
    .eq("ticket_id", ticket.id)
    .order("created_at", { ascending: true });

  return {
    ticket: {
      ...ticket,
      messages: messages ?? [],
      notes: notes ?? [],
    },
    error: null,
  };
}
