"use server";

import { createAdminClient } from "@/lib/supabase/admin";
import { getServerSession } from "@/lib/auth/server-user";

export type StaffTicketListItem = {
  id: string;
  member_id: string;
  subject: string;
  category: string;
  status: string;
  priority: string;
  admin_only: boolean;
  assignee_id: string | null;
  opened_by: string | null;
  last_message_at: string;
  created_at: string;
};

export type StaffTicketsResult = {
  tickets: StaffTicketListItem[];
  error: string | null;
};

export async function getStaffTickets(filter: string): Promise<StaffTicketsResult> {
  const { user } = await getServerSession();

  if (
    !user ||
    user.isBanned ||
    (user.role !== "moderator" && user.role !== "admin")
  ) {
    return { tickets: [], error: "Unauthorized" };
  }

  const ALLOWED_FILTERS = [
    "open",
    "pending",
    "resolved",
    "closed",
    "mine",
    "unassigned",
    "all",
  ] as const;

  if (!(ALLOWED_FILTERS as readonly string[]).includes(filter)) {
    console.error(`getStaffTickets: invalid filter '${filter}'`);
    return { tickets: [], error: "Invalid filter" };
  }

  const admin = createAdminClient()!;

  let query = admin
    .from("modmail_tickets")
    .select(
      "id, member_id, subject_user_id, subject, category, status, priority, admin_only, assignee_id, opened_by, last_message_at, created_at"
    )
    .neq("member_id", user.id)
    .or(`subject_user_id.is.null,subject_user_id.neq.${user.id}`);

  if (user.role !== "admin") {
    query = query.eq("admin_only", false);
  }

  if (filter === "mine") {
    query = query.eq("assignee_id", user.id);
  } else if (filter === "unassigned") {
    query = query.is("assignee_id", null);
  } else if (filter !== "all") {
    query = query.eq("status", filter);
  }

  const { data, error } = await query.order("last_message_at", { ascending: false });

  if (error) {
    return { tickets: [], error: error.message };
  }

  // Filter out tickets where the staff member is the member or subject_user_id
  const staffId = user.id;
  const tickets = (data || []).filter((ticket: Record<string, unknown>) => {
    if (ticket.member_id === staffId) return false;
    if (ticket.subject_user_id === staffId) return false;
    if (ticket.admin_only && user.role !== "admin") return false;
    return true;
  });

  return { tickets, error: null };
}

export async function getUnreadTicketCount(): Promise<number> {
  const { user } = await getServerSession();

  if (
    !user ||
    user.isBanned ||
    (user.role !== "moderator" && user.role !== "admin")
  ) {
    return 0;
  }

  const admin = createAdminClient()!;

  let query = admin
    .from("modmail_tickets")
    .select("id", { count: "exact" })
    .eq("status", "open")
    .is("assignee_id", null)
    .neq("member_id", user.id)
    .or(`subject_user_id.is.null,subject_user_id.neq.${user.id}`);

  if (user.role !== "admin") {
    query = query.eq("admin_only", false);
  }

  const { data, error } = await query;

  if (error || !data) {
    return 0;
  }

  return data.length;
}
