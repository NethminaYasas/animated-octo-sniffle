"use client";

import { useMemo, useSyncExternalStore } from "react";

import { normaliseUsername } from "@/lib/auth/validation";

export const NOTIFICATION_KINDS = [
  "reply",
  "quote",
  "mention",
  "saved",
] as const;

export type NotificationKind = (typeof NOTIFICATION_KINDS)[number];

export type SavedNotification = {
  id: string;
  recipient: string;
  actor: string;
  kind: NotificationKind;
  threadId: number;
  threadTitle: string;
  commentId: number | null;
  excerpt: string;
  createdAt: string;
  read: boolean;
};

const NOTIFICATIONS_KEY = "kaluwo:notifications";
const NOTIFICATIONS_EVENT = "kaluwo:notifications-changed";
const MAX_NOTIFICATIONS = 200;

function createId(): string {
  if (
    typeof crypto !== "undefined" &&
    typeof crypto.randomUUID === "function"
  ) {
    return crypto.randomUUID();
  }

  return `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function readRaw(): string {
  try {
    if (typeof window === "undefined") {
      return "";
    }

    return window.localStorage.getItem(NOTIFICATIONS_KEY) ?? "";
  } catch {
    return "";
  }
}

function isNotification(value: unknown): value is SavedNotification {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return false;
  }

  const notification = value as Record<string, unknown>;

  return (
    typeof notification.id === "string" &&
    typeof notification.recipient === "string" &&
    typeof notification.actor === "string" &&
    (notification.kind === "reply" ||
      notification.kind === "quote" ||
      notification.kind === "mention" ||
      notification.kind === "saved") &&
    typeof notification.threadId === "number" &&
    typeof notification.threadTitle === "string" &&
    (notification.commentId === null ||
      typeof notification.commentId === "number") &&
    typeof notification.excerpt === "string" &&
    typeof notification.createdAt === "string" &&
    typeof notification.read === "boolean"
  );
}

function parseNotifications(raw: string): SavedNotification[] {
  if (!raw) {
    return [];
  }

  try {
    const parsed = JSON.parse(raw) as unknown;

    return Array.isArray(parsed) ? parsed.filter(isNotification) : [];
  } catch {
    return [];
  }
}

function writeNotifications(notifications: SavedNotification[]): boolean {
  try {
    window.localStorage.setItem(
      NOTIFICATIONS_KEY,
      JSON.stringify(notifications),
    );
    window.dispatchEvent(new Event(NOTIFICATIONS_EVENT));
    return true;
  } catch {
    return false;
  }
}

function subscribe(onChange: () => void): () => void {
  const handleStorage = (event: StorageEvent) => {
    if (event.key === NOTIFICATIONS_KEY) {
      onChange();
    }
  };

  window.addEventListener(NOTIFICATIONS_EVENT, onChange);
  window.addEventListener("storage", handleStorage);

  return () => {
    window.removeEventListener(NOTIFICATIONS_EVENT, onChange);
    window.removeEventListener("storage", handleStorage);
  };
}

/** Notifications for one member, newest first. */
export function useNotifications(
  username: string | null,
): SavedNotification[] {
  const raw = useSyncExternalStore(subscribe, readRaw, () => "");

  return useMemo(() => {
    if (!username) {
      return [];
    }

    const recipient = normaliseUsername(username);

    return parseNotifications(raw)
      .filter((notification) => notification.recipient === recipient)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }, [raw, username]);
}

export function addNotification(
  input: Omit<SavedNotification, "id" | "createdAt" | "read">,
): boolean {
  const recipient = normaliseUsername(input.recipient);
  const actor = normaliseUsername(input.actor);

  if (!recipient || !actor || recipient === actor) {
    return false;
  }

  const notification: SavedNotification = {
    ...input,
    recipient,
    actor,
    id: createId(),
    createdAt: new Date().toISOString(),
    read: false,
  };

  return writeNotifications(
    [notification, ...parseNotifications(readRaw())].slice(0, MAX_NOTIFICATIONS),
  );
}

export function markNotificationRead(id: string): boolean {
  return writeNotifications(
    parseNotifications(readRaw()).map((notification) =>
      notification.id === id ? { ...notification, read: true } : notification,
    ),
  );
}

export function markAllNotificationsRead(username: string): boolean {
  const recipient = normaliseUsername(username);

  return writeNotifications(
    parseNotifications(readRaw()).map((notification) =>
      notification.recipient === recipient
        ? { ...notification, read: true }
        : notification,
    ),
  );
}
