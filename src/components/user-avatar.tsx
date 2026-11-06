"use client";

import { useEffect, useState } from "react";

import { loadProfile } from "@/lib/profiles";

/**
 * Shows a member's profile picture, falling back to their initial while the
 * profile loads (or when they have not uploaded one). Avatar URLs are
 * user-provided, so a plain img is used instead of next/image.
 */
export function UserAvatar({
  username,
  initial,
  className = "size-10",
}: {
  username: string;
  initial?: string;
  className?: string;
}) {
  const [loaded, setLoaded] = useState<{
    username: string;
    avatarUrl: string | null;
  } | null>(null);

  useEffect(() => {
    let active = true;

    loadProfile(username).then((profile) => {
      if (active) {
        setLoaded({ username, avatarUrl: profile?.avatar_url ?? null });
      }
    });

    return () => {
      active = false;
    };
  }, [username]);

  const avatarUrl = loaded?.username === username ? loaded.avatarUrl : null;
  const fallbackInitial =
    (initial ?? username.trim().slice(0, 1)).toUpperCase() || "?";

  if (avatarUrl) {
    return (
      // eslint-disable-next-line @next/next/no-img-element -- avatar URLs are user-provided
      <img
        src={avatarUrl}
        alt=""
        className={`${className} shrink-0 rounded-full border border-line bg-surface-muted object-cover`}
      />
    );
  }

  return (
    <span
      aria-hidden="true"
      className={`${className} grid shrink-0 place-items-center rounded-full bg-orange-700 font-bold uppercase text-white`}
    >
      {fallbackInitial}
    </span>
  );
}
