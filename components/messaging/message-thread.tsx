"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import { sendMessageAction } from "@/app/actions/messages";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/input";
import { Alert } from "@/components/ui/alert";
import { cn, formatDateTime } from "@/lib/utils";

type MessageItem = {
  id: string;
  body: string;
  createdAt: Date;
  senderId: string;
  sender: { name: string; role: string };
};

type RealtimeMessageDetail = {
  conversationId: string;
  message: {
    id: string;
    body: string;
    senderId: string;
    senderName: string;
    senderRole: string;
    createdAt: string;
  };
};

export function MessageThread({
  conversationId,
  currentUserId,
  messages: initialMessages,
  fillHeight = false,
}: {
  conversationId: string;
  currentUserId: string;
  messages: MessageItem[];
  /** Stretch to fill a parent with a definite height (the floating widget) instead of the fixed max-h-96 used everywhere else. */
  fillHeight?: boolean;
}) {
  const [messages, setMessages] = useState(initialMessages);
  const action = sendMessageAction.bind(null, conversationId);
  const [error, formAction, pending] = useActionState(action, undefined);
  const scrollRef = useRef<HTMLDivElement>(null);
  const formRef = useRef<HTMLFormElement>(null);
  const wasPending = useRef(false);

  // New messages (including the current user's own, sent from another tab
  // or just submitted here) arrive over the shared SSE connection rather
  // than a redirect/refetch — this is the single source of truth for the
  // thread's contents once mounted.
  useEffect(() => {
    function onMessage(e: Event) {
      const detail = (e as CustomEvent).detail as RealtimeMessageDetail;
      if (detail.conversationId !== conversationId) return;
      setMessages((prev) => {
        if (prev.some((m) => m.id === detail.message.id)) return prev;
        return [
          ...prev,
          {
            id: detail.message.id,
            body: detail.message.body,
            createdAt: new Date(detail.message.createdAt),
            senderId: detail.message.senderId,
            sender: { name: detail.message.senderName, role: detail.message.senderRole },
          },
        ];
      });
    }
    window.addEventListener("realtime:message", onMessage);
    return () => window.removeEventListener("realtime:message", onMessage);
  }, [conversationId]);

  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [messages]);

  // Clear the composer once a send completes successfully (no redirect
  // happens anymore — the message shows up via the SSE listener above).
  useEffect(() => {
    if (wasPending.current && !pending && !error) {
      formRef.current?.reset();
    }
    wasPending.current = pending;
  }, [pending, error]);

  return (
    <div className={cn("flex flex-col gap-3", fillHeight && "h-full")}>
      <div
        ref={scrollRef}
        className={cn(
          "space-y-2 overflow-y-auto rounded-md border border-slate-100 p-3",
          fillHeight ? "flex-1 min-h-0" : "max-h-96"
        )}
      >
        {messages.length === 0 && <p className="text-sm text-slate-400">No messages yet — say hello.</p>}
        {messages.map((m) => {
          const mine = m.senderId === currentUserId;
          return (
            <div key={m.id} className={cn("flex flex-col", mine ? "items-end" : "items-start")}>
              <div
                className={cn(
                  "max-w-[80%] rounded-lg px-3 py-2 text-sm",
                  mine ? "bg-brand-600 text-white" : "bg-slate-100 text-slate-800"
                )}
              >
                {m.body}
              </div>
              <p className="mt-0.5 text-xs text-slate-400">
                {m.sender.name} &middot; {formatDateTime(m.createdAt)}
              </p>
            </div>
          );
        })}
      </div>

      {error && <Alert tone="error">{error}</Alert>}
      <form ref={formRef} action={formAction} className="flex flex-col gap-2 sm:flex-row sm:items-end">
        <Textarea name="body" rows={2} placeholder="Type a message..." className="flex-1" required />
        <Button type="submit" size="sm" disabled={pending} className="w-full sm:w-auto">
          {pending ? "Sending..." : "Send"}
        </Button>
      </form>
    </div>
  );
}
