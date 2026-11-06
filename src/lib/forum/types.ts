import type { ReactionCounts, ReactionKind } from "@/lib/reactions";
import type { UserRole } from "@/lib/roles";

export type ThreadViewer = {
  id: string;
  username: string;
  role: UserRole;
  isBanned: boolean;
};

export type ThreadView = {
  id: number;
  boardId: string;
  boardName: string;
  title: string;
  authorId: string | null;
  author: string;
  authorInitial: string;
  createdAt: string;
  isLocked: boolean;
  isPinned: boolean;
  isDeleted: boolean;
  deletedReason: string | null;
  deletedBy: string | null;
};

export type OpeningPostView = {
  id: number;
  authorId: string | null;
  author: string;
  authorInitial: string;
  body: string;
  createdAt: string;
  isDeleted: boolean;
  deletedReason: string | null;
  deletedBy: string | null;
};

export type ThreadComment = {
  id: number;
  authorId: string | null;
  author: string;
  authorInitial: string;
  body: string;
  createdAt: string;
  replyToId: number | null;
  replyToAuthor: string | null;
  isDeleted: boolean;
  deletedReason: string | null;
  deletedBy: string | null;
};

export type ThreadReactions = Record<
  number,
  { counts: ReactionCounts; mine: ReactionKind | null }
>;
