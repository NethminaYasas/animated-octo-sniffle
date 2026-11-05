"use client";

import Link from "next/link";
import {
  AtSign,
  Bell,
  CheckCheck,
  MessageSquareQuote,
  Reply,
  type LucideIcon,
} from "lucide-react";
import { useEffect, useRef, useState } from "react";

import {
  type NotificationKind,
  type SavedNotification,
} from "@/lib/notifications";
import { formatRelativeTime } from "@/lib/time";

const KIND_META: Record<
  NotificationKind,
  { label: string; Icon: LucideIcon }
> = {
  reply: { label: "replied to you", Icon: Reply },
  quote: { label: "quoted you", Icon: MessageSquareQuote },
  mention: { label: "mentioned you", Icon: AtSign },
};

export function NotificationPanel({
  notifications,
  onClose,
  onMarkAllRead,
  onOpen,
}: {
  notifications: SavedNotification[];
  onClose: () => void;
  onMarkAllRead: () => void;
  onOpen: (id: string) => void;
}) {
  const panelRef = useRef<HTMLDivElement>(null);
  const [now, setNow] = useState<Date | null>(null);
  const unread = notifications.reduce(
    (count, notification) => count + (notification.read ? 0 : 1),
    0,
  );

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- start the relative-time clock on the client
    setNow(new Date());
    const interval = setInterval(() => setNow(new Date()), 60_000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    const handlePointerDown = (event: MouseEvent) => {
      if (
        panelRef.current &&
        !panelRef.current.contains(event.target as Node)
      ) {
        onClose();
      }
    };

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        onClose();
      }
    };

    document.addEventListener("mousedown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);

    return () => {
      document.removeEventListener("mousedown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [onClose]);

  return (
    <div
      ref={panelRef}
      id="notification-panel"
      role="dialog"
      aria-label="Notifications"
      className="fixed left-3 right-3 top-16 z-50 overflow-hidden rounded-xl border border-line bg-surface shadow-xl sm:absolute sm:left-auto sm:right-0 sm:top-full sm:mt-2 sm:w-[22rem]"
    >
      <div className="flex items-center justify-between gap-2 border-b border-line px-3 py-2">
        <p className="text-sm font-semibold text-ink">Notifications</p>
        {unread > 0 ? (
          <button
            type="button"
            onClick={onMarkAllRead}
            className="inline-flex items-center gap-1 text-[11px] font-semibold text-muted transition-colors hover:text-ink"
          >
            <CheckCheck className="size-3.5" />
            Mark all read
          </button>
        ) : null}
      </div>

      {notifications.length === 0 ? (
        <div className="px-4 py-8 text-center">
          <Bell className="mx-auto size-5 text-faint" />
          <p className="mt-2 text-sm font-semibold text-ink">
            You&apos;re all caught up
          </p>
          <p className="mx-auto mt-1 max-w-56 text-xs leading-5 text-muted">
            Replies, quotes and @mentions will appear here.
          </p>
        </div>
      ) : (
        <ul className="max-h-[calc(100vh-7rem)] overflow-y-auto">
          {notifications.map((notification) => {
            const { label, Icon } = KIND_META[notification.kind];
            const href = `/t/${notification.threadId}${
              notification.commentId
                ? `#comment-${notification.commentId}`
                : ""
            }`;

            return (
              <li key={notification.id}>
                <Link
                  href={href}
                  onClick={() => {
                    onOpen(notification.id);
                    onClose();
                  }}
                  className={`flex gap-2.5 border-b border-line px-3 py-2.5 transition-colors last:border-b-0 ${
                    notification.read
                      ? "bg-surface hover:bg-surface-muted"
                      : "bg-orange-50/60 hover:bg-orange-50 dark:bg-orange-950/20 dark:hover:bg-orange-950/30"
                  }`}
                >
                  <span className="mt-0.5 grid size-7 shrink-0 place-items-center rounded-full bg-surface-muted text-muted">
                    <Icon className="size-3.5" aria-hidden="true" />
                  </span>

                  <span className="min-w-0 flex-1">
                    <span className="block text-sm leading-5 text-ink">
                      <span className="font-semibold">
                        @{notification.actor}
                      </span>{" "}
                      {label}
                    </span>
                    <span className="mt-0.5 block truncate text-xs font-semibold text-muted">
                      {notification.threadTitle}
                    </span>
                    {notification.excerpt ? (
                      <span className="mt-1 line-clamp-2 text-xs leading-5 text-muted">
                        {notification.excerpt}
                      </span>
                    ) : null}
                    <span
                      className="mt-1 block text-[10px] text-faint"
                      suppressHydrationWarning
                    >
                      {now
                        ? formatRelativeTime(notification.createdAt, now)
                        : "just now"}
                    </span>
                  </span>

                  {!notification.read ? (
                    <span
                      className="mt-1.5 size-2 shrink-0 rounded-full bg-orange-600"
                      aria-label="Unread"
                    />
                  ) : null}
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
