/**
 * Local persistence for the preview feed, used until the database tables are
 * added (step 2 of the roadmap). Everything is best-effort so the app keeps
 * working when storage is unavailable (private mode, quota exceeded).
 */

import { normaliseUsername } from "@/lib/auth/validation";

export type SavedPost = {
  id: number;
  boardId: string;
  boardName: string;
  boardInitial: string;
  author: string;
  authorInitial: string;
  title: string;
  content: string;
  createdAt: string;
  commentCount: number;
  isPreview: boolean;
};

export type SavedComment = {
  id: number;
  postId: number;
  author: string;
  authorInitial: string;
  body: string;
  createdAt: string;
  /** Set when the comment was written with Reply on another comment. */
  replyToId?: number | null;
  replyToAuthor?: string | null;
};

const POSTS_KEY = "kaluwo:posts";
const COMMENTS_KEY = "kaluwo:comments";
const SAVED_KEY = "kaluwo:saved";
const SAVED_BY_KEY = "kaluwo:saved-by";
const DELETED_POSTS_KEY = "kaluwo:deleted-posts";
const DELETED_COMMENTS_KEY = "kaluwo:deleted-comments";

export const FEED_CHANGED_EVENT = "kaluwo:feed-changed";

function readJson<T>(key: string, fallback: T): T {
  try {
    if (typeof window === "undefined") return fallback;
    const raw = window.localStorage.getItem(key);
    if (!raw) return fallback;
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

function writeJson(key: string, value: unknown): boolean {
  try {
    if (typeof window === "undefined") return false;
    window.localStorage.setItem(key, JSON.stringify(value));
    return true;
  } catch {
    return false;
  }
}

export function loadPosts(): SavedPost[] {
  const posts = readJson<SavedPost[]>(POSTS_KEY, []);
  return Array.isArray(posts) ? posts : [];
}

export function savePost(post: SavedPost): boolean {
  const posts = loadPosts();
  return writeJson(POSTS_KEY, [...posts, post]);
}

export function loadComments(postId: number): SavedComment[] {
  const all = readJson<Record<string, SavedComment[]>>(COMMENTS_KEY, {});
  const list = all?.[String(postId)];

  if (!Array.isArray(list)) {
    return [];
  }

  const deleted = new Set(loadDeletedCommentIds());

  return list.filter((comment) => !deleted.has(comment.id));
}

export function saveComment(comment: SavedComment): boolean {
  const all = readJson<Record<string, SavedComment[]>>(COMMENTS_KEY, {});
  const list = Array.isArray(all?.[String(comment.postId)])
    ? all[String(comment.postId)]
    : [];
  const saved = writeJson(COMMENTS_KEY, {
    ...all,
    [String(comment.postId)]: [...list, comment],
  });

  if (saved) {
    // Lets the feed re-rank threads by their latest reply.
    window.dispatchEvent(new Event(FEED_CHANGED_EVENT));
  }

  return saved;
}

/** Every visible comment on this device, across all threads. */
export function loadAllComments(): SavedComment[] {
  const all = readJson<Record<string, SavedComment[]>>(COMMENTS_KEY, {});

  if (!all || typeof all !== "object" || Array.isArray(all)) {
    return [];
  }

  const deleted = new Set(loadDeletedCommentIds());
  const comments: SavedComment[] = [];

  for (const list of Object.values(all)) {
    if (!Array.isArray(list)) {
      continue;
    }

    for (const comment of list) {
      if (!deleted.has(comment.id)) {
        comments.push(comment);
      }
    }
  }

  return comments;
}

export function loadSavedIds(): number[] {
  const ids = readJson<number[]>(SAVED_KEY, []);
  return Array.isArray(ids) ? ids : [];
}

/**
 * Post id → usernames that saved it on this device. Saved posts themselves
 * stay in one list (so the button state is shared), but this records who
 * pressed Save so new comments can notify them.
 */
function readSavedBy(): Record<string, string[]> {
  const raw = readJson<unknown>(SAVED_BY_KEY, {});

  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    return {};
  }

  const byPost: Record<string, string[]> = {};

  for (const [postId, savers] of Object.entries(raw as Record<string, unknown>)) {
    if (!Array.isArray(savers)) {
      continue;
    }

    const names = savers.filter(
      (name): name is string => typeof name === "string" && name !== "",
    );

    if (names.length > 0) {
      byPost[postId] = names;
    }
  }

  return byPost;
}

/** Members who saved this post on this device. */
export function loadPostSavers(postId: number): string[] {
  return readSavedBy()[String(postId)] ?? [];
}

export function setSavedId(
  id: number,
  saved: boolean,
  username?: string | null,
): boolean {
  const ids = new Set(loadSavedIds());
  if (saved) {
    ids.add(id);
  } else {
    ids.delete(id);
  }

  if (!writeJson(SAVED_KEY, [...ids])) {
    return false;
  }

  const member = username ? normaliseUsername(username) : "";

  if (member || !saved) {
    const byPost = readSavedBy();
    const key = String(id);

    if (saved && member) {
      byPost[key] = [...new Set([...(byPost[key] ?? []), member])];
    } else {
      // The saved list is shared per device, so unsaving clears the post for
      // everyone — and nobody should keep receiving "saved post" alerts.
      delete byPost[key];
    }

    writeJson(SAVED_BY_KEY, byPost);
  }

  return true;
}

function loadDeletedIds(key: string): number[] {
  const ids = readJson<unknown>(key, []);

  return Array.isArray(ids)
    ? ids.filter((id): id is number => typeof id === "number" && Number.isFinite(id))
    : [];
}

function addDeletedId(key: string, id: number): boolean {
  const ids = new Set(loadDeletedIds(key));
  ids.add(id);

  if (!writeJson(key, [...ids])) {
    return false;
  }

  window.dispatchEvent(new Event(FEED_CHANGED_EVENT));
  return true;
}

export function loadDeletedPostIds(): number[] {
  return loadDeletedIds(DELETED_POSTS_KEY);
}

export function loadDeletedCommentIds(): number[] {
  return loadDeletedIds(DELETED_COMMENTS_KEY);
}

export function isPostDeleted(id: number): boolean {
  return loadDeletedPostIds().includes(id);
}

export function isCommentDeleted(id: number): boolean {
  return loadDeletedCommentIds().includes(id);
}

/**
 * Soft-deletes a post for this browser. Only the moderator/admin UI calls
 * this; the database RLS policy is the real server-side check once posting
 * moves off local storage.
 */
export function deletePost(id: number): boolean {
  return addDeletedId(DELETED_POSTS_KEY, id);
}

export function deleteComment(id: number): boolean {
  return addDeletedId(DELETED_COMMENTS_KEY, id);
}