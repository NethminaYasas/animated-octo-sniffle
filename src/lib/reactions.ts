"use client";

import { useMemo, useSyncExternalStore } from "react";

export const REACTION_KINDS = [
  "like",
  "laugh",
  "wow",
  "anger",
  "dislike",
] as const;

export type ReactionKind = (typeof REACTION_KINDS)[number];
export type ReactionTargetType = "post" | "comment";

export type ReactionMap = Record<string, ReactionKind>;

type ReactionStore = Record<string, ReactionMap>;

const REACTIONS_KEY = "kaluwo:reactions";
const REACTIONS_EVENT = "kaluwo:reactions-changed";

export function reactionTargetKey(
  targetType: ReactionTargetType,
  targetId: number,
): string {
  return `${targetType}:${targetId}`;
}

function readRaw(): string {
  try {
    if (typeof window === "undefined") {
      return "";
    }

    return window.localStorage.getItem(REACTIONS_KEY) ?? "";
  } catch {
    return "";
  }
}

function isReactionKind(value: unknown): value is ReactionKind {
  return (
    typeof value === "string" &&
    (REACTION_KINDS as readonly string[]).includes(value)
  );
}

function parseStore(raw: string): ReactionStore {
  if (!raw) {
    return {};
  }

  try {
    const parsed = JSON.parse(raw) as unknown;

    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      return {};
    }

    const store: ReactionStore = {};

    for (const [target, value] of Object.entries(
      parsed as Record<string, unknown>,
    )) {
      if (!value || typeof value !== "object" || Array.isArray(value)) {
        continue;
      }

      const reactions: ReactionMap = {};

      for (const [user, kind] of Object.entries(
        value as Record<string, unknown>,
      )) {
        if (isReactionKind(kind)) {
          reactions[user] = kind;
        }
      }

      if (Object.keys(reactions).length > 0) {
        store[target] = reactions;
      }
    }

    return store;
  } catch {
    return {};
  }
}

function writeStore(store: ReactionStore): boolean {
  try {
    window.localStorage.setItem(REACTIONS_KEY, JSON.stringify(store));
    window.dispatchEvent(new Event(REACTIONS_EVENT));
    return true;
  } catch {
    return false;
  }
}

function subscribe(onChange: () => void): () => void {
  const handleStorage = (event: StorageEvent) => {
    if (event.key === REACTIONS_KEY) {
      onChange();
    }
  };

  window.addEventListener(REACTIONS_EVENT, onChange);
  window.addEventListener("storage", handleStorage);

  return () => {
    window.removeEventListener(REACTIONS_EVENT, onChange);
    window.removeEventListener("storage", handleStorage);
  };
}

export function useReactions(
  targetType: ReactionTargetType,
  targetId: number,
): ReactionMap {
  const raw = useSyncExternalStore(subscribe, readRaw, () => "");

  return useMemo(
    () => parseStore(raw)[reactionTargetKey(targetType, targetId)] ?? {},
    [raw, targetId, targetType],
  );
}

/**
 * Adds, changes or removes one member's reaction. Passing null removes it.
 * The username is the member's canonical profile username, lowercased.
 */
export function setReaction(
  targetType: ReactionTargetType,
  targetId: number,
  username: string,
  kind: ReactionKind | null,
): boolean {
  const store = parseStore(readRaw());
  const key = reactionTargetKey(targetType, targetId);
  const reactions: ReactionMap = { ...(store[key] ?? {}) };

  if (kind) {
    reactions[username] = kind;
  } else {
    delete reactions[username];
  }

  if (Object.keys(reactions).length > 0) {
    store[key] = reactions;
  } else {
    delete store[key];
  }

  return writeStore(store);
}
