"use client";

import type { ModmailMessage } from "@/lib/modmail/types";

export function MessageThread({
  messages,
}: {
  messages: ModmailMessage[];
}) {
  if (messages.length === 0) {
    return (
      <div className="rounded-xl border border-dashed border-line bg-surface p-8 text-center text-sm text-muted">
        No messages yet.
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {messages.map((message) => (
        <MessageBubble key={message.id} message={message} />
      ))}
    </div>
  );
}

function MessageBubble({ message }: { message: ModmailMessage }) {
  const isMember = message.sender_kind === "member";

  return (
    <div className={`flex ${isMember ? "justify-end" : "justify-start"}`}>
      <div className={`max-w-[80%] rounded-lg px-3 py-2 ${
        isMember
          ? "bg-orange-700 text-white"
          : "bg-surface-muted text-ink"
      }`}>
        <p className="text-sm leading-6 whitespace-pre-wrap">{message.body}</p>
        <p className="mt-1 text-[10px] opacity-60">
          {new Date(message.created_at).toLocaleString(undefined, {
            dateStyle: "short",
            timeStyle: "short",
          })}
        </p>
      </div>
    </div>
  );
}
