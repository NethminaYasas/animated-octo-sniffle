export type ModmailTicketCategory =
  | "question"
  | "report_followup"
  | "ban_appeal"
  | "other";

export type ModmailTicketStatus =
  | "open"
  | "pending"
  | "resolved"
  | "closed";

export type ModmailTicketPriority =
  | "low"
  | "normal"
  | "high"
  | "urgent";

export type ModmailMessageSenderKind = "member" | "staff";

export type ModmailTicketFilter =
  | "open"
  | "pending"
  | "resolved"
  | "closed"
  | "mine"
  | "unassigned"
  | "all";

export type ModmailTicketListItem = {
  id: string;
  subject: string;
  category: ModmailTicketCategory;
  status: ModmailTicketStatus;
  priority?: ModmailTicketPriority;
  admin_only: boolean;
  last_message_at: string;
  created_at: string;
};

export type ModmailTicketDetail = ModmailTicketListItem & {
  member_id: string;
  subject_user_id: string | null;
  assignee_id: string | null;
  opened_by: string | null;
  closed_by: string | null;
  closed_at: string | null;
  resolved_at: string | null;
  status_changed_at: string;
  reopened_at: string | null;
  reopen_count: number;
};

export type ModmailMessage = {
  id: number;
  ticket_id: string;
  author_id: string;
  sender_kind: ModmailMessageSenderKind;
  body: string;
  created_at: string;
};

export const CATEGORY_LABELS: Record<ModmailTicketCategory, string> = {
  question: "Question",
  report_followup: "Report follow-up",
  ban_appeal: "Ban appeal",
  other: "Other",
};

export const STATUS_LABELS: Record<ModmailTicketStatus, string> = {
  open: "Open",
  pending: "Pending",
  resolved: "Resolved",
  closed: "Closed",
};

export const PRIORITY_LABELS: Record<ModmailTicketPriority, string> = {
  low: "Low",
  normal: "Normal",
  high: "High",
  urgent: "Urgent",
};

const MAX_OPEN_TICKETS = 5;
const MAX_OPEN_BAN_APPEALS = 1;
const REOPEN_WINDOW_DAYS = 7;
const RETENTION_DAYS = 90;
const BAN_APPEAL_RETENTION_DAYS = 365;
const MAX_TICKET_MESSAGES = 200;

export {
  MAX_OPEN_TICKETS,
  MAX_OPEN_BAN_APPEALS,
  REOPEN_WINDOW_DAYS,
  RETENTION_DAYS,
  BAN_APPEAL_RETENTION_DAYS,
  MAX_TICKET_MESSAGES,
};
