"use client";

import { useState } from "react";

import { setPostReaction } from "@/lib/forum/actions";
import type {
  ReactionCounts,
  ReactionKind,
} from "@/lib/reactions";

export function useReactions(
  postId: number,
  initialCounts: ReactionCounts,
  initialMine: ReactionKind | null,
) {
  const [counts, setCounts] = useState<ReactionCounts>(initialCounts);
  const [mine, setMine] = useState<ReactionKind | null>(initialMine);
  const [pending, setPending] = useState(false);

  const save = async (kind: ReactionKind | null): Promise<string | null> => {
    if (pending) {
      return null;
    }

    const previousMine = mine;
    const previousCounts = counts;
    const nextCounts = { ...counts };

    if (previousMine) {
      nextCounts[previousMine] = Math.max(0, nextCounts[previousMine] - 1);
    }

    if (kind) {
      nextCounts[kind] += 1;
    }

    setMine(kind);
    setCounts(nextCounts);
    setPending(true);

    try {
      const result = await setPostReaction({ postId, kind });

      if (!result.ok) {
        setMine(previousMine);
        setCounts(previousCounts);
        return result.error;
      }

      return null;
    } catch {
      setMine(previousMine);
      setCounts(previousCounts);
      return "Could not reach the server. Try again.";
    } finally {
      setPending(false);
    }
  };

  return { counts, mine, pending, save };
}
