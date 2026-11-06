export const REACTION_KINDS = [
  "like",
  "laugh",
  "wow",
  "anger",
  "dislike",
] as const;

export type ReactionKind = (typeof REACTION_KINDS)[number];
export type ReactionTargetType = "post" | "comment";

export type ReactionCounts = Record<ReactionKind, number>;

export type ReactionSummary = {
  counts: ReactionCounts;
  mine: ReactionKind | null;
};

export function isReactionKind(value: unknown): value is ReactionKind {
  return (
    typeof value === "string" &&
    (REACTION_KINDS as readonly string[]).includes(value)
  );
}

export function emptyReactionCounts(): ReactionCounts {
  return {
    like: 0,
    laugh: 0,
    wow: 0,
    anger: 0,
    dislike: 0,
  };
}

export function summariseReactionRows(
  rows: Array<{ user_id: string; kind: ReactionKind }>,
  viewerId: string | null,
): ReactionSummary {
  const counts = emptyReactionCounts();
  let mine: ReactionKind | null = null;

  for (const row of rows) {
    counts[row.kind] += 1;

    if (viewerId && row.user_id === viewerId) {
      mine = row.kind;
    }
  }

  return { counts, mine };
}

export type ReactionSummaryRow = {
  kind: ReactionKind;
  total: number | string;
  mine: boolean | null;
};

/**
 * Converts the database-side aggregate from thread_reaction_summary() into the
 * shape the reaction bar uses.
 */
export function summariseReactionCounts(
  rows: ReactionSummaryRow[],
): ReactionSummary {
  const counts = emptyReactionCounts();
  let mine: ReactionKind | null = null;

  for (const row of rows) {
    counts[row.kind] = Number(row.total) || 0;

    if (row.mine) {
      mine = row.kind;
    }
  }

  return { counts, mine };
}

export function reactionTotal(counts: ReactionCounts): number {
  return REACTION_KINDS.reduce((total, kind) => total + counts[kind], 0);
}
