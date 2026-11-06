"use client";

/**
 * Saved-post bookmarks stay browser-local in Phase 1. They are not forum
 * content and do not need a database table yet.
 */
const SAVED_KEY = "kaluwo:saved";

function readSavedIds(): number[] {
  try {
    const raw = window.localStorage.getItem(SAVED_KEY);

    if (!raw) {
      return [];
    }

    const parsed: unknown = JSON.parse(raw);

    return Array.isArray(parsed)
      ? parsed.filter(
          (id): id is number => typeof id === "number" && Number.isFinite(id),
        )
      : [];
  } catch {
    return [];
  }
}

export function loadSavedIds(): number[] {
  return readSavedIds();
}

export function setSavedId(id: number, saved: boolean): boolean {
  try {
    const ids = new Set(readSavedIds());

    if (saved) {
      ids.add(id);
    } else {
      ids.delete(id);
    }

    window.localStorage.setItem(SAVED_KEY, JSON.stringify([...ids]));
    return true;
  } catch {
    return false;
  }
}
