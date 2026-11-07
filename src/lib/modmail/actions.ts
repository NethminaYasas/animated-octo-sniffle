"use server";

import { revalidatePath } from "next/cache";

import { getServerSession } from "@/lib/auth/server-user";
import { moderationErrorMessage } from "@/lib/supabase-errors";

export type ModmailTicket = {
  id: string;
  member_id: string;
  subject_user_id: string | null;
  category: "question" | "report_followup" | "ban_appeal" | "other";
  subject: string;
  status: "open" | "pending" | "resolved" | "closed";
  priority: "low" | "normal" | "high" | "urgent";
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
  updated_at: string;
};

export type ModmailMessage = {
  id: number;
  ticket_id: string;
  author_id: string;
  body: string;
  created_at: string;
};

export type ModmailInternalNote = {
  id: number;
  ticket_id: string;
  author_id: string;
  body: string;
  created_at: string;
};

export type ModmailActionResult =
  | { ok: true; data?: unknown }
  | { ok: false; error: string };

const MAX_SUBJECT_LENGTH = 200;
const MAX_MESSAGE_LENGTH = 10000;

function validateSubject(subject: string): string | null {
  const trimmed = btrim(subject);
  if (trimmed.length < 1) return "A subject is required.";
  if (trimmed.length > MAX_SUBJECT_LENGTH) {
    return `The subject must be ${MAX_SUBJECT_LENGTH} characters or fewer.`;
  }
  return null;
}

function validateMessage(message: string): string | null {
  const trimmed = btrim(message);
  if (trimmed.length < 1) return "A message is required.";
  if (trimmed.length > MAX_MESSAGE_LENGTH) {
    return `The message must be ${MAX_MESSAGE_LENGTH} characters or fewer.`;
  }
  return null;
}

function btrim(value: string): string {
  return value.replace(/^\s+|\s+$/g, "");
}

export async function openTicket(input: {
  category?: unknown;
  subject?: unknown;
  message?: unknown;
  subjectUserId?: unknown;
}): Promise<ModmailActionResult & { ticketId?: string }> {
  const { supabase, user } = await getServerSession();

  if (!user) {
    return { ok: false, error: "Log in to open a ticket." };
  }

  const category =
    typeof input.category === "string" ? input.category : "question";
  const subject =
    typeof input.subject === "string" ? input.subject : "";
  const message =
    typeof input.message === "string" ? input.message : "";
  const subjectUserId =
    typeof input.subjectUserId === "string" ? input.subjectUserId : null;

  const subjectProblem = validateSubject(subject);
  if (subjectProblem) {
    return { ok: false, error: subjectProblem };
  }

  const messageProblem = validateMessage(message);
  if (messageProblem) {
    return { ok: false, error: messageProblem };
  }

  const { data, error } = await supabase.rpc("open_ticket", {
    p_category: category,
    p_subject: subject,
    p_message: message,
    p_subject_user_id: subjectUserId ?? undefined,
  });

  if (error) {
    return { ok: false, error: moderationErrorMessage(error) };
  }

  revalidatePath("/modmail");

  return { ok: true, ticketId: (data as { id: string }[])?.[0]?.id };
}

export async function staffOpenTicket(input: {
  targetId?: unknown;
  category?: unknown;
  subject?: unknown;
  message?: unknown;
}): Promise<ModmailActionResult> {
  const { supabase, user } = await getServerSession();

  if (!user) {
    return { ok: false, error: "Log in to open a ticket." };
  }

  const targetId =
    typeof input.targetId === "string" ? input.targetId : null;
  const category =
    typeof input.category === "string" ? input.category : "question";
  const subject =
    typeof input.subject === "string" ? input.subject : "";
  const message =
    typeof input.message === "string" ? input.message : "";

  if (!targetId) {
    return { ok: false, error: "Invalid member." };
  }

  const subjectProblem = validateSubject(subject);
  if (subjectProblem) {
    return { ok: false, error: subjectProblem };
  }

  const messageProblem = validateMessage(message);
  if (messageProblem) {
    return { ok: false, error: messageProblem };
  }

  const { error } = await supabase.rpc("staff_open_ticket", {
    p_target_id: targetId,
    p_category: category,
    p_subject: subject,
    p_message: message,
  });

  if (error) {
    return { ok: false, error: moderationErrorMessage(error) };
  }

  revalidatePath("/moderation/modmail");

  return { ok: true };
}

export async function reopenMyTicket(pTicketId: unknown): Promise<ModmailActionResult> {
  const { supabase, user } = await getServerSession();

  if (!user) {
    return { ok: false, error: "Log in to reopen a ticket." };
  }

  const ticketId =
    typeof pTicketId === "string" ? pTicketId : null;

  if (!ticketId) {
    return { ok: false, error: "Invalid ticket." };
  }

  const { error } = await supabase.rpc("reopen_my_ticket", {
    p_ticket_id: ticketId,
  });

  if (error) {
    return { ok: false, error: moderationErrorMessage(error) };
  }

  revalidatePath("/modmail");
  revalidatePath(`/modmail/ticket/${ticketId}`);

  return { ok: true };
}

export async function replyToTicket(input: {
  ticketId?: unknown;
  message?: unknown;
}): Promise<ModmailActionResult> {
  const { supabase, user } = await getServerSession();

  if (!user) {
    return { ok: false, error: "Log in to reply." };
  }

  const ticketId =
    typeof input.ticketId === "string" ? input.ticketId : null;
  const message =
    typeof input.message === "string" ? input.message : "";

  if (!ticketId) {
    return { ok: false, error: "Invalid ticket." };
  }

  const messageProblem = validateMessage(message);
  if (messageProblem) {
    return { ok: false, error: messageProblem };
  }

  const { error } = await supabase.rpc("reply_to_ticket", {
    p_ticket_id: ticketId,
    p_message: message,
  });

  if (error) {
    return { ok: false, error: moderationErrorMessage(error) };
  }

  revalidatePath("/modmail");
  revalidatePath(`/modmail/ticket/${ticketId}`);

  return { ok: true };
}

export async function addInternalNote(input: {
  ticketId?: unknown;
  message?: unknown;
}): Promise<ModmailActionResult> {
  const { supabase, user } = await getServerSession();

  if (!user) {
    return { ok: false, error: "Log in to add a note." };
  }

  const ticketId =
    typeof input.ticketId === "string" ? input.ticketId : null;
  const message =
    typeof input.message === "string" ? input.message : "";

  if (!ticketId) {
    return { ok: false, error: "Invalid ticket." };
  }

  const messageProblem = validateMessage(message);
  if (messageProblem) {
    return { ok: false, error: messageProblem };
  }

  const { error } = await supabase.rpc("add_internal_note", {
    p_ticket_id: ticketId,
    p_message: message,
  });

  if (error) {
    return { ok: false, error: moderationErrorMessage(error) };
  }

  revalidatePath(`/modmail/ticket/${ticketId}`);

  return { ok: true };
}

export async function assignTicket(input: {
  ticketId?: unknown;
  assigneeId?: unknown;
}): Promise<ModmailActionResult> {
  const { supabase, user } = await getServerSession();

  if (!user) {
    return { ok: false, error: "Log in to assign a ticket." };
  }

  const ticketId =
    typeof input.ticketId === "string" ? input.ticketId : null;
  const assigneeId =
    typeof input.assigneeId === "string" ? input.assigneeId : null;

  if (!ticketId) {
    return { ok: false, error: "Invalid ticket." };
  }

  const { error } = await supabase.rpc("assign_ticket", {
    p_ticket_id: ticketId,
    p_assignee_id: assigneeId as string,
  });

  if (error) {
    return { ok: false, error: moderationErrorMessage(error) };
  }

  revalidatePath("/moderation/modmail");
  revalidatePath(`/moderation/modmail/ticket/${ticketId}`);

  return { ok: true };
}

export async function setTicketStatus(input: {
  ticketId?: unknown;
  status?: unknown;
}): Promise<ModmailActionResult> {
  const { supabase, user } = await getServerSession();

  if (!user) {
    return { ok: false, error: "Log in to change ticket status." };
  }

  const ticketId =
    typeof input.ticketId === "string" ? input.ticketId : null;
  const status =
    typeof input.status === "string" ? input.status : "";

  if (!ticketId) {
    return { ok: false, error: "Invalid ticket." };
  }

  if (status !== "open" && status !== "pending" && status !== "resolved" && status !== "closed") {
    return { ok: false, error: "Invalid status." };
  }

  const { error } = await supabase.rpc("set_ticket_status", {
    p_ticket_id: ticketId,
    p_status: status,
  });

  if (error) {
    return { ok: false, error: moderationErrorMessage(error) };
  }

  revalidatePath("/moderation/modmail");
  revalidatePath(`/moderation/modmail/ticket/${ticketId}`);

  return { ok: true };
}

export async function setTicketPriority(input: {
  ticketId?: unknown;
  priority?: unknown;
}): Promise<ModmailActionResult> {
  const { supabase, user } = await getServerSession();

  if (!user) {
    return { ok: false, error: "Log in to change ticket priority." };
  }

  const ticketId =
    typeof input.ticketId === "string" ? input.ticketId : null;
  const priority =
    typeof input.priority === "string" ? input.priority : "";

  if (!ticketId) {
    return { ok: false, error: "Invalid ticket." };
  }

  if (priority !== "low" && priority !== "normal" && priority !== "high" && priority !== "urgent") {
    return { ok: false, error: "Invalid priority." };
  }

  const { error } = await supabase.rpc("set_ticket_priority", {
    p_ticket_id: ticketId,
    p_priority: priority,
  });

  if (error) {
    return { ok: false, error: moderationErrorMessage(error) };
  }

  revalidatePath("/moderation/modmail");
  revalidatePath(`/moderation/modmail/ticket/${ticketId}`);

  return { ok: true };
}

export async function escalateTicket(pTicketId: unknown): Promise<ModmailActionResult> {
  const { supabase, user } = await getServerSession();

  if (!user) {
    return { ok: false, error: "Log in to escalate a ticket." };
  }

  const ticketId =
    typeof pTicketId === "string" ? pTicketId : null;

  if (!ticketId) {
    return { ok: false, error: "Invalid ticket." };
  }

  const { error } = await supabase.rpc("escalate_ticket", {
    p_ticket_id: ticketId,
  });

  if (error) {
    return { ok: false, error: moderationErrorMessage(error) };
  }

  revalidatePath("/moderation/modmail");
  revalidatePath(`/moderation/modmail/ticket/${ticketId}`);

  return { ok: true };
}

export async function muteMember(input: {
  memberId?: unknown;
  reason?: unknown;
  expiresAt?: unknown;
  muteAppeals?: unknown;
}): Promise<ModmailActionResult> {
  const { supabase, user } = await getServerSession();

  if (!user) {
    return { ok: false, error: "Log in to mute a member." };
  }

  const memberId =
    typeof input.memberId === "string" ? input.memberId : null;
  const reason =
    typeof input.reason === "string" ? input.reason : "";
  const expiresAt =
    typeof input.expiresAt === "string" ? input.expiresAt : null;
  const muteAppeals =
    typeof input.muteAppeals === "boolean" ? input.muteAppeals : false;

  if (!memberId) {
    return { ok: false, error: "Invalid member." };
  }

  const reasonProblem = validateMessage(reason); // reuse length validation
  if (reasonProblem) {
    return { ok: false, error: reasonProblem };
  }

  const { error } = await supabase.rpc("mute_member", {
    p_member_id: memberId,
    p_reason: reason,
    p_expires_at: expiresAt ?? undefined,
    p_mute_appeals: muteAppeals,
  });

  if (error) {
    return { ok: false, error: moderationErrorMessage(error) };
  }

  revalidatePath("/moderation/modmail/muted");

  return { ok: true };
}

export async function unmuteMember(input: {
  memberId?: unknown;
  reason?: unknown;
}): Promise<ModmailActionResult> {
  const { supabase, user } = await getServerSession();

  if (!user) {
    return { ok: false, error: "Log in to unmute a member." };
  }

  const memberId =
    typeof input.memberId === "string" ? input.memberId : null;
  const reason =
    typeof input.reason === "string" ? input.reason : "";

  if (!memberId) {
    return { ok: false, error: "Invalid member." };
  }

  const reasonProblem = validateMessage(reason);
  if (reasonProblem) {
    return { ok: false, error: reasonProblem };
  }

  const { error } = await supabase.rpc("unmute_member", {
    p_member_id: memberId,
    p_reason: reason,
  });

  if (error) {
    return { ok: false, error: moderationErrorMessage(error) };
  }

  revalidatePath("/moderation/modmail/muted");

  return { ok: true };
}
