"use client";

import { useEffect, useRef, useState } from "react";
import { MessageCircle, X, ChevronLeft, Search, Users, UserPlus, ArrowRightLeft } from "lucide-react";
import { cn, formatDateTime } from "@/lib/utils";
import {
  getMyConversationsAction,
  getConversationMessagesAction,
  markConversationReadAction,
  openOrCreateGeneralConversationAction,
  searchCustomersAction,
  startCustomerConversationAction,
  searchStaffAction,
  startPrivateChatAction,
  startGroupChatAction,
  reassignConversationAction,
  takeOverConversationAction,
  heartbeatAction,
  type ConversationPreview,
  type StaffSearchResult,
} from "@/app/actions/messages";
import { MessageThread, type MessageItem } from "@/components/messaging/message-thread";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { PRESENCE_DOT } from "@/lib/staff-presence";

type ThreadMeta = {
  canSend: boolean;
  canTransfer: boolean;
  canAssign: boolean;
  canReference: boolean;
  canAttach: boolean;
  conversationType: string;
  assignedStaffId: string | null;
  assignedStaffName: string | null;
};

type OpenReferenceDetail = { conversationId: string; refType: "INQUIRY" | "QUOTATION" | "JOB_ORDER"; refId: string; refLabel: string };

const KIND_LABEL: Record<string, string> = {
  CUSTOMER: "Customer",
  CUSTOMER_GROUP: "Customer Group",
  PRIVATE: "Private",
  GROUP: "Group",
};

/**
 * Facebook-Messenger-style floating chat — the central communication hub.
 * Mounted for CUSTOMER (their own conversations), ADMIN (everything), and
 * STAFF (gated by COMMUNICATION_VIEW). One messaging system for every role:
 * customer conversations with ownership/assignment, private Staff<->Admin
 * chat, and internal group chats all flow through the same actions and the
 * same SSE pipe — this component just renders differently per role/type.
 */
export function FloatingChatWidget({ currentUserId, role }: { currentUserId: string; role: string }) {
  const isStaffLike = role === "STAFF" || role === "ADMIN";
  const [open, setOpen] = useState(false);
  const [view, setView] = useState<"list" | "thread" | "new">("list");
  const [conversations, setConversations] = useState<ConversationPreview[] | null>(null);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [activeMessages, setActiveMessages] = useState<MessageItem[] | null>(null);
  const [activeMeta, setActiveMeta] = useState<ThreadMeta | null>(null);
  const [totalUnread, setTotalUnread] = useState(0);
  const [assignPickerOpen, setAssignPickerOpen] = useState(false);
  const hasOpenedOnce = useRef(false);

  // Staff/Admin presence: heartbeat every 30s while the app is open, so
  // Online/Away/Offline (derived from User.lastActiveAt) stays reasonably
  // live for assign/transfer/search pickers without a push channel.
  useEffect(() => {
    if (!isStaffLike) return;
    heartbeatAction();
    const id = setInterval(() => heartbeatAction(), 30000);
    return () => clearInterval(id);
  }, [isStaffLike]);

  async function refreshConversations() {
    const list = await getMyConversationsAction();
    setConversations(list);
    setTotalUnread(list.reduce((sum, c) => sum + c.unreadCount, 0));
    return list;
  }

  useEffect(() => {
    refreshConversations();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function openThread(conversationId: string) {
    setActiveId(conversationId);
    setActiveMessages(null);
    setActiveMeta(null);
    setView("thread");
    const data = await getConversationMessagesAction(conversationId);
    setActiveMessages(data.messages);
    setActiveMeta({
      canSend: data.canSend,
      canTransfer: data.canTransfer,
      canAssign: data.canAssign,
      canReference: data.canReference,
      canAttach: data.canAttach,
      conversationType: data.conversationType,
      assignedStaffId: data.assignedStaffId,
      assignedStaffName: data.assignedStaffName,
    });
    await refreshConversations();
  }

  // "Discuss in Chatbox" from an Inquiry/Quotation/Job Order page dispatches
  // this once it has ensured the conversation exists — we just open it.
  useEffect(() => {
    function onOpenReference(e: Event) {
      const detail = (e as CustomEvent<OpenReferenceDetail>).detail;
      setOpen(true);
      hasOpenedOnce.current = true;
      openThread(detail.conversationId);
    }
    window.addEventListener("chatbox:open-reference", onOpenReference);
    return () => window.removeEventListener("chatbox:open-reference", onOpenReference);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Clicking a chat-related notification (see NotificationBell) dispatches
  // this instead of navigating to the old /messages page — open (or
  // re-open) the widget straight to that conversation, wherever the user
  // currently is in the app.
  useEffect(() => {
    function onOpenConversation(e: Event) {
      const detail = (e as CustomEvent<{ conversationId: string }>).detail;
      setOpen(true);
      hasOpenedOnce.current = true;
      openThread(detail.conversationId);
    }
    window.addEventListener("chatbox:open-conversation", onOpenConversation);
    return () => window.removeEventListener("chatbox:open-conversation", onOpenConversation);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function handleToggle() {
    const next = !open;
    setOpen(next);
    if (next && !hasOpenedOnce.current) {
      hasOpenedOnce.current = true;
      const list = await refreshConversations();
      // Customers jump straight into their most recent thread (they only
      // ever have a handful). Staff/Admin can have conversations across many
      // different customers/colleagues, so they land on the list and pick.
      if (!isStaffLike && list.length > 0) await openThread(list[0].id);
    }
  }

  async function handleStartGeneral() {
    const { id } = await openOrCreateGeneralConversationAction();
    await openThread(id);
  }

  function backToList() {
    setActiveId(null);
    setActiveMessages(null);
    setActiveMeta(null);
    setAssignPickerOpen(false);
    setView("list");
    refreshConversations();
  }

  async function handleReassign(staffId: string) {
    if (!activeId) return;
    await reassignConversationAction(activeId, staffId);
    setAssignPickerOpen(false);
    await openThread(activeId);
  }

  async function handleTakeOver() {
    if (!activeId) return;
    await takeOverConversationAction(activeId);
    await openThread(activeId);
  }

  // Live updates: keep the badge, the list previews, and the read status of
  // an actively-open thread all in sync without any manual refresh.
  useEffect(() => {
    async function onMessage(e: Event) {
      const detail = (e as CustomEvent).detail as { conversationId: string; message: { senderId: string } };
      const isOwnMessage = detail.message.senderId === currentUserId;
      if (open && activeId === detail.conversationId && !isOwnMessage) {
        await markConversationReadAction(detail.conversationId);
      }
      if (open && activeId === detail.conversationId) {
        // Assignment may have changed (first-response ownership, transfer, takeover) — refresh thread meta.
        getConversationMessagesAction(detail.conversationId).then((data) =>
          setActiveMeta({
            canSend: data.canSend,
            canTransfer: data.canTransfer,
            canAssign: data.canAssign,
            canReference: data.canReference,
            canAttach: data.canAttach,
            conversationType: data.conversationType,
            assignedStaffId: data.assignedStaffId,
            assignedStaffName: data.assignedStaffName,
          })
        );
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
          <div className="flex h-full w-full flex-col bg-white shadow-2xl sm:h-[34rem] sm:w-96 sm:rounded-lg sm:border sm:border-slate-200">
            <div className="flex items-center justify-between bg-brand-600 px-4 py-3 text-white sm:rounded-t-lg">
              {view === "thread" ? (
                <button type="button" onClick={backToList} className="flex min-w-0 items-center gap-1 text-sm font-medium hover:text-slate-200">
                  <ChevronLeft className="h-4 w-4 shrink-0" />
                  <span className="truncate">
                    {activeConversation ? (
                      <>
                        {activeConversation.presence && <span className="mr-1">{PRESENCE_DOT[activeConversation.presence]}</span>}
                        {activeConversation.title}
                      </>
                    ) : (
                      "Messages"
                    )}
                  </span>
                </button>
              ) : view === "new" ? (
                <button type="button" onClick={() => setView("list")} className="flex items-center gap-1 text-sm font-medium hover:text-slate-200">
                  <ChevronLeft className="h-4 w-4" />
                  New Chat
                </button>
              ) : (
                <span className="text-sm font-semibold">{isStaffLike ? "Chatbox" : "Messages"}</span>
              )}
              <div className="flex items-center gap-1">
                {view === "list" && isStaffLike && (
                  <button type="button" onClick={() => setView("new")} aria-label="Start new conversation" className="rounded p-1 hover:bg-white/10">
                    <UserPlus className="h-4.5 w-4.5" />
                  </button>
                )}
                <button type="button" onClick={() => setOpen(false)} aria-label="Close chat" className="rounded p-1 hover:bg-white/10">
                  <X className="h-5 w-5" />
                </button>
              </div>
            </div>

            <div className="flex min-h-0 flex-1 flex-col">
              {view === "thread" ? (
                activeMessages === null || activeMeta === null ? (
                  <div className="p-4 text-sm text-slate-400">Loading…</div>
                ) : (
                  <div className="flex min-h-0 flex-1 flex-col p-3">
                    {activeMeta.conversationType === "CUSTOMER" && isStaffLike && (
                      <div className="mb-2 flex flex-wrap items-center gap-1.5 border-b border-slate-100 pb-2 text-xs">
                        <Badge tone={activeMeta.assignedStaffId === currentUserId || !activeMeta.assignedStaffId ? "green" : "default"}>
                          {activeMeta.assignedStaffName ? `Responsible: ${activeMeta.assignedStaffName}` : "Unassigned"}
                        </Badge>
                        {(activeMeta.canTransfer || activeMeta.canAssign) && (
                          <button
                            type="button"
                            onClick={() => setAssignPickerOpen((v) => !v)}
                            className="flex items-center gap-1 rounded border border-slate-200 px-1.5 py-0.5 text-slate-600 hover:bg-slate-50"
                          >
                            <ArrowRightLeft className="h-3 w-3" />
                            {activeMeta.canTransfer ? "Transfer" : "Reassign"}
                          </button>
                        )}
                        {activeMeta.canAssign && activeMeta.assignedStaffId !== currentUserId && (
                          <button
                            type="button"
                            onClick={handleTakeOver}
                            className="rounded border border-slate-200 px-1.5 py-0.5 text-slate-600 hover:bg-slate-50"
                          >
                            Take Over
                          </button>
                        )}
                      </div>
                    )}
                    {assignPickerOpen && <StaffPicker onSelect={handleReassign} onClose={() => setAssignPickerOpen(false)} />}
                    <MessageThread
                      conversationId={activeId!}
                      currentUserId={currentUserId}
                      messages={activeMessages}
                      canSend={activeMeta.canSend}
                      canAttach={activeMeta.canAttach}
                      canReference={activeMeta.canReference}
                      fillHeight
                    />
                  </div>
                )
              ) : view === "new" ? (
                <NewChatPanel role={role} onOpenConversation={(id) => openThread(id)} />
              ) : (
                <ConversationList
                  conversations={conversations}
                  isStaffLike={isStaffLike}
                  onSelect={openThread}
                  onNewGeneral={isStaffLike ? undefined : handleStartGeneral}
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
        className="fixed bottom-4 right-4 z-40 flex h-14 w-14 items-center justify-center rounded-full bg-brand-600 text-white shadow-lg transition-transform hover:scale-105 sm:bottom-6 sm:right-6"
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

function StaffPicker({ onSelect, onClose }: { onSelect: (staffId: string) => void; onClose: () => void }) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<StaffSearchResult[] | null>(null);

  useEffect(() => {
    const t = setTimeout(() => {
      searchStaffAction(query).then(setResults);
    }, 250);
    return () => clearTimeout(t);
  }, [query]);

  return (
    <div className="mb-2 rounded-md border border-slate-200 bg-white p-2 text-xs shadow-sm">
      <div className="mb-1 flex items-center justify-between">
        <span className="font-medium text-slate-700">Assign to…</span>
        <button type="button" onClick={onClose}>
          <X className="h-3.5 w-3.5" />
        </button>
      </div>
      <Input placeholder="Search Staff…" value={query} onChange={(e) => setQuery(e.target.value)} className="mb-1 h-7 text-xs" />
      <div className="max-h-32 overflow-y-auto">
        {results?.map((s) => (
          <button
            key={s.id}
            type="button"
            onClick={() => onSelect(s.id)}
            className="flex w-full items-center gap-1.5 rounded px-1.5 py-1 text-left hover:bg-slate-50"
          >
            <span>{PRESENCE_DOT[s.presence]}</span>
            <span className="truncate">{s.name}</span>
            <span className="ml-auto text-[10px] text-slate-400">{s.role}</span>
          </button>
        ))}
        {results && results.length === 0 && <p className="px-1.5 py-1 text-slate-400">No matches.</p>}
      </div>
    </div>
  );
}

function ConversationList({
  conversations,
  isStaffLike,
  onSelect,
  onNewGeneral,
}: {
  conversations: ConversationPreview[] | null;
  isStaffLike: boolean;
  onSelect: (id: string) => void;
  onNewGeneral?: () => void;
}) {
  if (conversations === null) {
    return <div className="p-4 text-sm text-slate-400">Loading…</div>;
  }

  return (
    <div className="flex h-full flex-col">
      {onNewGeneral && (
        <div className="border-b border-slate-100 p-3">
          <Button type="button" size="sm" variant="outline" className="w-full" onClick={onNewGeneral}>
            New General Message
          </Button>
        </div>
      )}
      <div className="flex-1 divide-y divide-slate-100 overflow-y-auto">
        {conversations.length === 0 && (
          <p className="p-4 text-center text-sm text-slate-400">
            {isStaffLike ? "No conversations yet." : "No conversations yet — start one above to chat with our team."}
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
              <div className="flex items-center gap-1.5">
                {c.presence && <span>{PRESENCE_DOT[c.presence]}</span>}
                <p className="truncate font-medium text-slate-900">{c.title}</p>
              </div>
              {isStaffLike && (
                <div className="mt-0.5 flex flex-wrap items-center gap-1">
                  <Badge tone="slate" className="text-[10px]">
                    {KIND_LABEL[c.kind]}
                  </Badge>
                  {c.kind === "CUSTOMER" && (
                    <Badge tone={c.isMine ? "green" : "default"} className="text-[10px]">
                      {c.isMine ? "Can Reply" : "View Only"}
                    </Badge>
                  )}
                </div>
              )}
              {c.subtitle && <p className="truncate text-xs text-slate-400">{c.subtitle}</p>}
              <p className="truncate text-slate-500">
                {c.lastMessage ? `${c.lastMessage.senderName}: ${c.lastMessage.hasAttachment && !c.lastMessage.body ? "📎 Attachment" : c.lastMessage.body}` : "No messages yet."}
              </p>
            </div>
            <div className="flex flex-shrink-0 flex-col items-end gap-1">
              <span className="text-xs text-slate-400">{formatDateTime(c.updatedAt)}</span>
              {c.unreadCount > 0 && (
                <span className="flex h-5 min-w-5 items-center justify-center rounded-full bg-red-600 px-1 text-[11px] font-semibold text-white">
                  {c.unreadCount}
                </span>
              )}
            </div>
          </button>
        ))}
      </div>
    </div>
  );
}

function NewChatPanel({ role, onOpenConversation }: { role: string; onOpenConversation: (id: string) => void }) {
  const [tab, setTab] = useState<"customer" | "private" | "group">("customer");
  return (
    <div className="flex h-full flex-col">
      <div className="flex border-b border-slate-100 text-xs">
        <button
          type="button"
          onClick={() => setTab("customer")}
          className={cn("flex-1 py-2 font-medium", tab === "customer" ? "border-b-2 border-brand-600 text-brand-700" : "text-slate-500")}
        >
          Customer
        </button>
        <button
          type="button"
          onClick={() => setTab("private")}
          className={cn("flex-1 py-2 font-medium", tab === "private" ? "border-b-2 border-brand-600 text-brand-700" : "text-slate-500")}
        >
          {role === "STAFF" ? "Admin" : "Staff"}
        </button>
        <button
          type="button"
          onClick={() => setTab("group")}
          className={cn("flex-1 py-2 font-medium", tab === "group" ? "border-b-2 border-brand-600 text-brand-700" : "text-slate-500")}
        >
          Group
        </button>
      </div>
      <div className="flex-1 overflow-y-auto p-3">
        {tab === "customer" && <CustomerSearchTab onOpenConversation={onOpenConversation} />}
        {tab === "private" && <PrivateChatTab onOpenConversation={onOpenConversation} />}
        {tab === "group" && <GroupChatTab onOpenConversation={onOpenConversation} />}
      </div>
    </div>
  );
}

function CustomerSearchTab({ onOpenConversation }: { onOpenConversation: (id: string) => void }) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<{ id: string; name: string; companyName: string | null }[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const t = setTimeout(() => {
      searchCustomersAction(query)
        .then(setResults)
        .catch((e) => setError(e instanceof Error ? e.message : "Search failed."));
    }, 250);
    return () => clearTimeout(t);
  }, [query]);

  if (error) return <p className="text-sm text-slate-400">{error}</p>;

  return (
    <div className="space-y-2">
      <div className="relative">
        <Search className="absolute left-2 top-2.5 h-4 w-4 text-slate-400" />
        <Input placeholder="Search customers…" value={query} onChange={(e) => setQuery(e.target.value)} className="pl-8" />
      </div>
      <div className="space-y-1">
        {results?.map((c) => (
          <button
            key={c.id}
            type="button"
            onClick={async () => {
              const { id } = await startCustomerConversationAction(c.id);
              onOpenConversation(id);
            }}
            className="flex w-full items-center justify-between rounded-md border border-slate-100 px-2 py-1.5 text-left text-sm hover:bg-slate-50"
          >
            <span>
              <span className="font-medium text-slate-900">{c.name}</span>
              {c.companyName && <span className="ml-1 text-xs text-slate-400">({c.companyName})</span>}
            </span>
            <span className="text-xs text-brand-600">Start →</span>
          </button>
        ))}
        {results && results.length === 0 && <p className="text-xs text-slate-400">No customers found.</p>}
      </div>
    </div>
  );
}

function PrivateChatTab({ onOpenConversation }: { onOpenConversation: (id: string) => void }) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<StaffSearchResult[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    searchStaffAction(query).then(setResults);
  }, [query]);

  return (
    <div className="space-y-2">
      <div className="relative">
        <Search className="absolute left-2 top-2.5 h-4 w-4 text-slate-400" />
        <Input placeholder="Search…" value={query} onChange={(e) => setQuery(e.target.value)} className="pl-8" />
      </div>
      {error && <p className="text-xs text-red-600">{error}</p>}
      <div className="space-y-1">
        {results
          ?.filter((s) => s.role === "ADMIN" || query.length > 0)
          .map((s) => (
            <button
              key={s.id}
              type="button"
              onClick={async () => {
                try {
                  const { id } = await startPrivateChatAction(s.id);
                  onOpenConversation(id);
                } catch (e) {
                  setError(e instanceof Error ? e.message : "Couldn't start that conversation.");
                }
              }}
              className="flex w-full items-center justify-between rounded-md border border-slate-100 px-2 py-1.5 text-left text-sm hover:bg-slate-50"
            >
              <span className="flex items-center gap-1.5">
                <span>{PRESENCE_DOT[s.presence]}</span>
                <span className="font-medium text-slate-900">{s.name}</span>
                <span className="text-xs text-slate-400">{s.role}</span>
              </span>
              <span className="text-xs text-brand-600">Chat →</span>
            </button>
          ))}
        {results && results.length === 0 && <p className="text-xs text-slate-400">No matches.</p>}
      </div>
    </div>
  );
}

function GroupChatTab({ onOpenConversation }: { onOpenConversation: (id: string) => void }) {
  const [title, setTitle] = useState("");
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<StaffSearchResult[] | null>(null);
  const [selected, setSelected] = useState<StaffSearchResult[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    searchStaffAction(query).then(setResults);
  }, [query]);

  function toggle(s: StaffSearchResult) {
    setSelected((prev) => (prev.some((p) => p.id === s.id) ? prev.filter((p) => p.id !== s.id) : [...prev, s]));
  }

  async function submit() {
    setError(null);
    setSubmitting(true);
    try {
      const { id } = await startGroupChatAction(title, selected.map((s) => s.id));
      onOpenConversation(id);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't create that group.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="space-y-2">
      <Input placeholder="Group name (e.g. Production Team)" value={title} onChange={(e) => setTitle(e.target.value)} />
      <div className="relative">
        <Users className="absolute left-2 top-2.5 h-4 w-4 text-slate-400" />
        <Input placeholder="Add participants…" value={query} onChange={(e) => setQuery(e.target.value)} className="pl-8" />
      </div>
      {selected.length > 0 && (
        <div className="flex flex-wrap gap-1">
          {selected.map((s) => (
            <button key={s.id} type="button" onClick={() => toggle(s)} className="rounded-full bg-brand-50 px-2 py-0.5 text-xs text-brand-700">
              {s.name} ✕
            </button>
          ))}
        </div>
      )}
      <div className="max-h-28 space-y-1 overflow-y-auto">
        {results?.map((s) => (
          <button
            key={s.id}
            type="button"
            onClick={() => toggle(s)}
            className={cn(
              "flex w-full items-center gap-1.5 rounded-md border px-2 py-1 text-left text-sm",
              selected.some((p) => p.id === s.id) ? "border-brand-300 bg-brand-50" : "border-slate-100 hover:bg-slate-50"
            )}
          >
            <span>{PRESENCE_DOT[s.presence]}</span>
            <span className="truncate">{s.name}</span>
            <span className="ml-auto text-[10px] text-slate-400">{s.role}</span>
          </button>
        ))}
      </div>
      {error && <p className="text-xs text-red-600">{error}</p>}
      <Button type="button" size="sm" className="w-full" disabled={submitting || !title.trim() || selected.length === 0} onClick={submit}>
        {submitting ? "Creating…" : "Create Group"}
      </Button>
    </div>
  );
}
