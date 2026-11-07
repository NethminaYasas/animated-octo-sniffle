"use client";

import { useEffect, useState } from "react";

import { getUnreadTicketCount } from "@/lib/modmail/staff-actions";

export function ModmailInboxBadge() {
  const [unreadCount, setUnreadCount] = useState(0);

  useEffect(() => {
    let mounted = true;

    const fetchUnreadCount = async () => {
      try {
        const count = await getUnreadTicketCount();
        if (mounted) {
          setUnreadCount(count);
        }
      } catch {
        // Silently fail
      }
    };

    fetchUnreadCount();

    return () => {
      mounted = false;
    };
  }, []);

  if (unreadCount === 0) {
    return null;
  }

  return (
    <span className="inline-flex items-center rounded-full bg-orange-700 px-2 py-0.5 text-[10px] font-semibold text-white">
      {unreadCount}
    </span>
  );
}
