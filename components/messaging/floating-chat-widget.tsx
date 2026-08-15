"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { MessageCircle, X, ChevronLeft } from "lucide-react";
import { cn, formatDateTime } from "@/lib/utils";
import {
  getMyConversationsAction,
  getConversationMessagesAction,
  markConversationReadAction,
  openOrCreateGeneralConversationAction,
} from "@/app/actions/messages";
import { MessageThread } from "@/components/messaging/message-thread";
import { Button } from "@/components/ui/button";

type ConversationPreview = {
  id: string;
  subjectType: string;
  lastMessage: { body: string; senderName: string; createdAt: string } | null;
  unreadCount: number;
  updatedAt: string;
};

type MessageItem = {
  id: string;
  body: string;
  createdAt: Date;
  senderId: string;
  sender: { name: string; role: string };
};

// Kept local (not imported from lib/conversations.ts) because that module
// also exports Prisma-backed helpers — importing it here would drag the
// Prisma/pg client into the client bundle. Same reasoning as
// lib/permissions.ts vs lib/permissions-guard.ts.
function subjectLabel(subjectType: string) {
  switch (subjectType) {
    case "INQUIRY":
      return "Inquiry";
    case "QUOTATION":
      return "Quotation";
    case "ORDER":
      return "Order";
    case "JOB_ORDER":
      return "Job Order";
    default:
      return "General Support";
  }
}

/**
 * Facebook-Messenger-style floating chat, mounted once for CUSTOMER role in
 * the Shell so it's available on every Customer Portal page. Reuses the
 * exact same Conversation/Message data and the same MessageThread component
 * (with its own real-time listener) that the full /messages pages use —
 * this is a presentation layer on top of the existing messaging
 * infrastructure, not a parallel system.
 */
export function FloatingChatWidget({ currentUserId }: { currentUserId: string }) {
  const [open, setOpen] = useState(false);
  const [conversations, setConversations] = useState<ConversationPreview[] | null>(null);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [activeMessages, setActiveMessages] = useState<MessageItem[] | null>(null);
  const [totalUnread, setTotalUnread] = useState(0);
  const hasOpenedOnce = useRef(false);

  async function refreshConversations() {
    const list = await getMyConversationsAction();
    setConversations(list);
    setTotalUnread(list.reduce((sum, c) => sum + c.unreadCount, 0));
    return list;
  }

  // Fetch the badge count as soon as the widget mounts, even before the
  // customer ever opens it, so it's accurate immediately on page load.
  useEffect(() => {
    refreshConversations();
  }, []);

  async function openThread(conversationId: string) {
    setActiveId(conversationId);
    setActiveMessages(null);
    const msgs = await getConversationMessagesAction(conversationId);
    setActiveMessages(msgs.map((m) => ({ ...m, createdAt: new Date(m.createdAt) })));
    await refreshConversations();
  }

  async function handleToggle() {
    const next = !open;
    setOpen(next);
    if (next && !hasOpenedOnce.current) {
      hasOpenedOnce.current = true;
      const list = await refreshConversations();
      if (list.length > 0) await openThread(list[0].id);
    }
  }

  async function handleStartGeneral() {
    const { id } = await openOrCreateGeneralConversationAction();
    await openThread(id);
  }

  function backToList() {
    setActiveId(null);
    setActiveMessages(null);
    refreshConversations();
  }

  // Live updates: keep the badge, the list previews, and the read status of
  // an actively-open thread all in sync without any manual refresh.
  useEffect(() => {
    async function onMessage(e: Event) {
      const detail = (e as CustomEvent).detail as {
        conversationId: string;
        message: { senderId: string };
      };
      const isOwnMessage = detail.message.senderId === currentUserId;
      if (open && activeId === detail.conversationId && !isOwnMessage) {
        await markConversationReadAction(detail.conversationId);
      }
      await refreshConversations();
    }
    window.addEventListener("realtime:message", onMessage);
    return () => window.removeEventListener("realtime:message", onMessage);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, activeId, currentUserId]);

  const activeConversation = conversations?.find((c) => c.id === activeId);

  return (
    <>
      {open && (
        <div className="fixed inset-0 z-40 sm:inset-auto sm:bottom-24 sm:right-6">
          <div className="flex h-full w-full flex-col bg-white shadow-2xl sm:h-[32rem] sm:w-96 sm:rounded-lg sm:border sm:border-slate-200">
            <div className="flex items-center justify-between bg-slate-900 px-4 py-3 text-white sm:rounded-t-lg">
              {activeId ? (
                <button
                  type="button"
                  onClick={backToList}
                  className="flex items-center gap-1 text-sm font-medium hover:text-slate-200"
                >
                  <ChevronLeft className="h-4 w-4" />
                  {activeConversation ? subjectLabel(activeConversation.subjectType) : "Messages"}
                </button>
              ) : (
                <span className="text-sm font-semibold">Messages</span>
              )}
              <button
                type="button"
                onClick={() => setOpen(false)}
                aria-label="Close chat"
                className="rounded p-1 hover:bg-white/10"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="flex min-h-0 flex-1 flex-col">
              {activeId ? (
                activeMessages === null ? (
                  <div className="p-4 text-sm text-slate-400">Loading…</div>
                ) : (
                  <div className="flex min-h-0 flex-1 flex-col p-3">
                    <MessageThread
                      conversationId={activeId}
                      currentUserId={currentUserId}
                      messages={activeMessages}
                      fillHeight
                    />
                  </div>
                )
              ) : (
                <ConversationList
                  conversations={conversations}
                  onSelect={openThread}
                  onNewGeneral={handleStartGeneral}
                />
              )}
            </div>
          </div>
        </div>
      )}

      <button
        type="button"
        onClick={handleToggle}
        aria-label={open ? "Minimize chat" : "Open chat"}
        className="fixed bottom-4 right-4 z-40 flex h-14 w-14 items-center justify-center rounded-full bg-slate-900 text-white shadow-lg transition-transform hover:scale-105 sm:bottom-6 sm:right-6"
      >
        <MessageCircle className="h-6 w-6" />
        {totalUnread > 0 && (
          <span className="absolute -right-1 -top-1 flex h-5 min-w-5 items-center justify-center rounded-full bg-red-600 px-1 text-[11px] font-semibold text-white">
            {totalUnread > 9 ? "9+" : totalUnread}
          </span>
        )}
      </button>
    </>
  );
}

function ConversationList({
  conversations,
  onSelect,
  onNewGeneral,
}: {
  conversations: ConversationPreview[] | null;
  onSelect: (id: string) => void;
  onNewGeneral: () => void;
}) {
  if (conversations === null) {
    return <div className="p-4 text-sm text-slate-400">Loading…</div>;
  }

  return (
    <div className="flex h-full flex-col">
      <div className="border-b border-slate-100 p-3">
        <Button type="button" size="sm" variant="outline" className="w-full" onClick={onNewGeneral}>
          New General Message
        </Button>
      </div>
      <div className="flex-1 divide-y divide-slate-100 overflow-y-auto">
        {conversations.length === 0 && (
          <p className="p-4 text-center text-sm text-slate-400">
            No conversations yet — start one above to chat with our team.
          </p>
        )}
        {conversations.map((c) => (
          <button
            key={c.id}
            type="button"
            onClick={() => onSelect(c.id)}
            className="flex w-full items-start justify-between gap-2 p-3 text-left text-sm hover:bg-slate-50"
          >
            <div className="min-w-0">
              <p className="font-medium text-slate-900">{subjectLabel(c.subjectType)}</p>
              <p className="truncate text-slate-500">
                {c.lastMessage ? `${c.lastMessage.senderName}: ${c.lastMessage.body}` : "No messages yet."}
              </p>
            </div>
            <div className="flex flex-shrink-0 flex-col items-end gap-1">
              <span className="text-xs text-slate-400">{formatDateTime(c.updatedAt)}</span>
              {c.unreadCount > 0 && (
                <span
                  className={cn(
                    "flex h-5 min-w-5 items-center justify-center rounded-full bg-red-600 px-1 text-[11px] font-semibold text-white"
                  )}
                >
                  {c.unreadCount}
                </span>
              )}
            </div>
          </button>
        ))}
      </div>
      <div className="border-t border-slate-100 p-2 text-center">
        <Link href="/messages" className="text-xs text-slate-500 underline hover:text-slate-800">
          View full message history
        </Link>
      </div>
    </div>
  );
}
