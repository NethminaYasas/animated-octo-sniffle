import type { SavedPost } from "@/lib/feed-store";

export const SEED_POSTS: SavedPost[] = [
  {
    id: 1,
    boardId: "announcements",
    boardName: "Announcements",
    boardInitial: "A",
    author: "kaluwo",
    authorInitial: "k",
    title: "Welcome to kaluwo",
    content:
      "A Sri Lankan discussion forum for boards, threads and replies. This is a preview of how posts will appear — real posting and comments come in later steps.",
    createdAt: "2026-11-01T00:00:00.000Z",
    commentCount: 0,
    isPreview: true,
  },
];