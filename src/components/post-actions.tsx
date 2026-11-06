"use client";

import { useEffect, useState } from "react";
import { Share2, Bookmark } from "lucide-react";
import { toast } from "sonner";

import { loadSavedIds, setSavedId } from "@/lib/bookmarks";

export function PostActions({
  postId,
  title,
  body,
}: {
  postId: number;
  title: string;
  body: string;
}) {
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- hydrate saved state after mount
    setSaved(loadSavedIds().includes(postId));
  }, [postId]);

  const handleShare = async () => {
    const url = `${window.location.origin}/t/${postId}`;
    const shareData = { title, text: body, url };

    if (navigator.share) {
      try {
        await navigator.share(shareData);
      } catch (error) {
        if ((error as DOMException)?.name !== "AbortError") {
          toast.error("Couldn't share this post");
        }
      }
      return;
    }

    try {
      await navigator.clipboard.writeText(url);
      toast.success("Link copied to clipboard", {
        description: "Share it with others.",
      });
    } catch {
      toast.error("Couldn't copy link");
    }
  };

  const handleSave = () => {
    const next = !saved;
    setSaved(next);

    if (!setSavedId(postId, next)) {
      setSaved(saved);
      toast.error("Couldn't update saved posts", {
        description: "Browser storage is unavailable or full.",
      });
      return;
    }

    toast.success(next ? "Saved on this device" : "Removed from saved");
  };

  return (
    <>
      <button
        type="button"
        aria-label="Share post"
        title="Share"
        onClick={handleShare}
        className="flex items-center gap-1 transition-colors hover:text-ink dark:hover:text-ink"
      >
        <Share2 className="size-3.5" />
        Share
      </button>
      <button
        type="button"
        aria-label={saved ? "Remove from saved" : "Save post"}
        aria-pressed={saved}
        title={saved ? "Remove from saved" : "Save on this device"}
        onClick={handleSave}
        className={`flex items-center gap-1 transition-colors ${
          saved
            ? "text-orange-700 dark:text-orange-400"
            : "hover:text-ink dark:hover:text-ink"
        }`}
      >
        <Bookmark
          className={`size-3.5 ${
            saved
              ? "fill-orange-700 text-orange-700 dark:fill-orange-400 dark:text-orange-400"
              : ""
          }`}
        />
        {saved ? "Saved" : "Save"}
      </button>
    </>
  );
}
