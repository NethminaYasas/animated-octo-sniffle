import type { Database } from "@/lib/supabase/types";

export type UserRole = Database["public"]["Enums"]["user_role"];

const ROLE_LABELS: Record<UserRole, string> = {
  new_member: "New Member",
  member: "Member",
  senior_member: "Senior Member",
  moderator: "Moderator",
  admin: "Admin",
};

export function formatRole(role: UserRole): string {
  return ROLE_LABELS[role] ?? role;
}
