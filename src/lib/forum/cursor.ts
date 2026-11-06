import "server-only";

export type ThreadSort = "latest" | "new";

export type Cursor = {
  at: string;
  id: number;
};

export type ThreadCursor = Cursor;

export function normaliseThreadSort(value: string | undefined | null): ThreadSort {
  return value === "new" ? "new" : "latest";
}

export function encodeCursor(cursor: Cursor): string {
  return Buffer.from(JSON.stringify(cursor), "utf8").toString("base64url");
}

export function decodeCursor(value: string | undefined | null): Cursor | null {
  if (!value || value.length > 200) {
    return null;
  }

  try {
    const parsed: unknown = JSON.parse(
      Buffer.from(value, "base64url").toString("utf8"),
    );

    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      return null;
    }

    const candidate = parsed as { at?: unknown; id?: unknown };

    if (
      typeof candidate.at !== "string" ||
      candidate.at.length > 40 ||
      typeof candidate.id !== "number" ||
      !Number.isSafeInteger(candidate.id) ||
      candidate.id <= 0
    ) {
      return null;
    }

    const date = new Date(candidate.at);

    if (Number.isNaN(date.getTime())) {
      return null;
    }

    // Keep the original timestamp string. PostgreSQL stores microseconds, and
    // toISOString() would round to milliseconds and could skip rows.
    return { at: candidate.at, id: candidate.id };
  } catch {
    return null;
  }
}

export const encodeThreadCursor = encodeCursor;
export const decodeThreadCursor = decodeCursor;
export const encodeCommentCursor = encodeCursor;
export const decodeCommentCursor = decodeCursor;
