"use client";

import { useEffect, useState } from "react";

import {
  markAllNotificationsRead,
  markNotificationRead,
} from "@/lib/forum/actions";
import { createClient } from "@/lib/supabase/client";

export const NOTIFICATION_KINDS = ["reply", "quote", "mention"] as const;

export type NotificationKind = (typeof NOTIFICATION_KINDS)[number];

export type ForumNotification = {
  id: number;
  kind: NotificationKind;
  actor: string;
  threadId: number;
  threadTitle: string;
  postId: number;
  excerpt: string;
  readAt: string | null;
  createdAt: string;
};

type NotificationRow = {
  id: number;
  kind: NotificationKind;
  actor_username: string;
  thread_id: number;
  thread_title: string;
  post_id: number;
  excerpt: string;
  read_at: string | null;
  created_at: string;
};

function mapRow(row: NotificationRow): ForumNotification {
  return {
    id: row.id,
    kind: row.kind,
    actor: row.actor_username,
    threadId: row.thread_id,
    threadTitle: row.thread_title,
    postId: row.post_id,
    excerpt: row.excerpt,
    readAt: row.read_at,
    createdAt: row.created_at,
  };
}

export function useNotifications(userId: string | null) {
  const [notifications, setNotifications] = useState<ForumNotification[]>([]);
  const [loading, setLoading] = useState(Boolean(userId));
  const [reloadToken, setReloadToken] = useState(0);

  useEffect(() => {
    if (!userId) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- clear the bell when the session ends
      setNotifications([]);
      setLoading(false);
      return;
    }

    let active = true;
    let supabase: ReturnType<typeof createClient> | null = null;
    let channel: ReturnType<ReturnType<typeof createClient>["channel"]> | null =
      null;

    const load = async () => {
      try {
        supabase ??= createClient();
        const { data, error } = await supabase
          .from("notifications")
          .select(
            "id, kind, actor_username, thread_id, thread_title, post_id, excerpt, read_at, created_at",
          )
          .eq("user_id", userId)
          .order("created_at", { ascending: false })
          .limit(50);

        if (error) {
          throw error;
        }

        if (active) {
          setNotifications(
            ((data ?? []) as NotificationRow[]).map(mapRow),
          );
        }
      } catch {
        // Polling keeps trying. The bell simply stays empty on a hard failure.
      } finally {
        if (active) {
          setLoading(false);
        }
      }
    };

    void load();

    // Realtime is the fast path; the 60-second interval is the documented
    // fallback when the websocket is unavailable or the channel errors.
    // The user_id filter is required for DELETE events: Realtime applies RLS
    // to INSERT/UPDATE, but a DELETE payload has no row to check, so without
    // the filter every signed-in client would receive every member's deletes.
    try {
      supabase = createClient();
      channel = supabase
        .channel(`kaluwo-notifications-${userId}-${crypto.randomUUID()}`)
        .on(
          "postgres_changes",
          {
            event: "*",
            schema: "public",
            table: "notifications",
            filter: `user_id=eq.${userId}`,
          },
          () => {
            void load();
          },
        )
        .subscribe();
    } catch {
      // The interval below still works.
    }

    const interval = window.setInterval(() => {
      void load();
    }, 60_000);

    return () => {
      active = false;
      window.clearInterval(interval);

      if (supabase && channel) {
        void supabase.removeChannel(channel);
      }
    };
  }, [reloadToken, userId]);

  const reload = () => setReloadToken((current) => current + 1);

  const markRead = async (id: number) => {
    const readAt = new Date().toISOString();
    setNotifications((current) =>
      current.map((notification) =>
        notification.id === id
          ? { ...notification, readAt }
          : notification,
      ),
    );

    try {
      const result = await markNotificationRead(id);

      if (!result.ok) {
        reload();
      }
    } catch {
      reload();
    }
  };

  const markAllRead = async () => {
    const readAt = new Date().toISOString();
    setNotifications((current) =>
      current.map((notification) => ({ ...notification, readAt })),
    );

    try {
      const result = await markAllNotificationsRead();

      if (!result.ok) {
        reload();
      }
    } catch {
      reload();
    }
  };

  return {
    notifications,
    loading,
    unread: notifications.reduce(
      (count, notification) => count + (notification.readAt ? 0 : 1),
      0,
    ),
    markRead,
    markAllRead,
  };
}
