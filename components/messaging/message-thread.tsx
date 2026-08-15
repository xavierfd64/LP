"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { Paperclip, Smile, Link2, X, FileText } from "lucide-react";
import { sendMessageAction, getCustomerTransactionsAction } from "@/app/actions/messages";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/input";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { cn, formatDateTime } from "@/lib/utils";

export type MessageReference =
  | { type: "INQUIRY"; id: string; label: string; status: string }
  | { type: "QUOTATION"; id: string; label: string; status: string; amount: string; customerName: string }
  | { type: "JOB_ORDER"; id: string; label: string; status: string };

export type MessageItem = {
  id: string;
  body: string;
  type: "TEXT" | "SYSTEM";
  createdAt: string;
  senderId: string;
  sender: { name: string; role: string };
  attachment: { path: string; name: string; mime: string; size: number } | null;
  reference: MessageReference | null;
};

type RealtimeMessageDetail = {
  conversationId: string;
  message: {
    id: string;
    body: string;
    senderId: string;
    senderName: string;
    senderRole: string;
    messageType: "TEXT" | "SYSTEM";
    createdAt: string;
  };
};

const EMOJI = ["👍", "❤️", "😂", "😮", "😢", "🙏", "🎉", "👏", "✅", "❌", "😊", "😅", "🙌", "💯", "🔥", "⏰", "📌", "✨", "🤝", "👀"];

const REF_LINK: Record<MessageReference["type"], (id: string) => string> = {
  INQUIRY: (id) => `/inquiries/${id}`,
  QUOTATION: (id) => `/quotations/${id}`,
  JOB_ORDER: (id) => `/job-orders/${id}`,
};

const REF_LABEL: Record<MessageReference["type"], string> = {
  INQUIRY: "INQUIRY",
  QUOTATION: "QUOTATION",
  JOB_ORDER: "JOB ORDER",
};

function formatBytes(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function ReferenceCard({ reference }: { reference: MessageReference }) {
  return (
    <Link
      href={REF_LINK[reference.type](reference.id)}
      className="mb-1 block w-56 max-w-full rounded-md border border-slate-200 bg-white p-2 text-left shadow-sm hover:border-brand-300"
    >
      <p className="text-[10px] font-semibold uppercase tracking-wide text-brand-600">{REF_LABEL[reference.type]}</p>
      <p className="truncate text-sm font-medium text-slate-900">{reference.label}</p>
      {reference.type === "QUOTATION" && <p className="text-xs text-slate-500">₱{Number(reference.amount).toLocaleString()}</p>}
      <Badge tone="slate" className="mt-1">
        {reference.status.replace(/_/g, " ")}
      </Badge>
      <p className="mt-1 text-xs text-brand-600 underline">View →</p>
    </Link>
  );
}

function AttachmentPreview({ attachment }: { attachment: NonNullable<MessageItem["attachment"]> }) {
  const isImage = attachment.mime.startsWith("image/");
  if (isImage) {
    return (
      <a href={attachment.path} target="_blank" rel="noreferrer" className="mb-1 block">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={attachment.path} alt={attachment.name} className="max-h-48 max-w-full rounded-md border border-slate-200 object-cover" />
      </a>
    );
  }
  return (
    <a
      href={attachment.path}
      target="_blank"
      rel="noreferrer"
      className="mb-1 flex w-56 max-w-full items-center gap-2 rounded-md border border-slate-200 bg-white p-2 hover:border-brand-300"
    >
      <FileText className="h-6 w-6 shrink-0 text-slate-400" />
      <div className="min-w-0">
        <p className="truncate text-xs font-medium text-slate-900">{attachment.name}</p>
        <p className="text-[10px] text-slate-400">{formatBytes(attachment.size)}</p>
      </div>
    </a>
  );
}

export function MessageThread({
  conversationId,
  currentUserId,
  messages: initialMessages,
  fillHeight = false,
  canSend = true,
  canAttach = true,
  canReference = true,
}: {
  conversationId: string;
  currentUserId: string;
  messages: MessageItem[];
  /** Stretch to fill a parent with a definite height (the floating widget) instead of the fixed max-h-96 used everywhere else. */
  fillHeight?: boolean;
  /** Staff with COMMUNICATION_VIEW but not COMMUNICATION_SEND (or not the responsible Staff member) can read a conversation but not reply — hides the composer instead of letting them submit into a guaranteed server-side rejection. */
  canSend?: boolean;
  canAttach?: boolean;
  canReference?: boolean;
}) {
  const [messages, setMessages] = useState(initialMessages);
  const action = sendMessageAction.bind(null, conversationId);
  const [error, formAction, pending] = useActionState(action, undefined);
  const scrollRef = useRef<HTMLDivElement>(null);
  const formRef = useRef<HTMLFormElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const wasPending = useRef(false);

  const [pendingFile, setPendingFile] = useState<File | null>(null);
  const [showEmoji, setShowEmoji] = useState(false);
  const [showRefPicker, setShowRefPicker] = useState(false);
  const [refOptions, setRefOptions] = useState<Awaited<ReturnType<typeof getCustomerTransactionsAction>> | null>(null);
  const [selectedRef, setSelectedRef] = useState<{ type: "INQUIRY" | "QUOTATION" | "JOB_ORDER"; id: string; label: string } | null>(null);

  useEffect(() => {
    setMessages(initialMessages);
  }, [initialMessages]);

  // New messages (including the current user's own, sent from another tab
  // or just submitted here) arrive over the shared SSE connection rather
  // than a redirect/refetch — this is the single source of truth for the
  // thread's contents once mounted. System messages (ownership/transfer
  // events) arrive the same way but render as centered pills, not bubbles.
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
            type: detail.message.messageType,
            createdAt: detail.message.createdAt,
            senderId: detail.message.senderId,
            sender: { name: detail.message.senderName, role: detail.message.senderRole },
            attachment: null,
            reference: null,
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
      setPendingFile(null);
      setSelectedRef(null);
    }
    wasPending.current = pending;
  }, [pending, error]);

  async function openRefPicker() {
    setShowRefPicker((v) => !v);
    setShowEmoji(false);
    if (!refOptions) setRefOptions(await getCustomerTransactionsAction(conversationId));
  }

  function insertEmoji(emoji: string) {
    const el = textareaRef.current;
    if (el) {
      const start = el.selectionStart ?? el.value.length;
      const end = el.selectionEnd ?? el.value.length;
      el.value = el.value.slice(0, start) + emoji + el.value.slice(end);
      el.focus();
      el.selectionStart = el.selectionEnd = start + emoji.length;
    }
    setShowEmoji(false);
  }

  const hasRefOptions = refOptions && refOptions.inquiries.length + refOptions.quotations.length + refOptions.jobOrders.length > 0;

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
          if (m.type === "SYSTEM") {
            return (
              <p key={m.id} className="py-1 text-center text-xs text-slate-400">
                {m.body} · {formatDateTime(m.createdAt)}
              </p>
            );
          }
          const mine = m.senderId === currentUserId;
          return (
            <div key={m.id} className={cn("flex flex-col", mine ? "items-end" : "items-start")}>
              {m.reference && <ReferenceCard reference={m.reference} />}
              {m.attachment && <AttachmentPreview attachment={m.attachment} />}
              {m.body && (
                <div
                  className={cn(
                    "max-w-[80%] rounded-lg px-3 py-2 text-sm",
                    mine ? "bg-brand-600 text-white" : "bg-slate-100 text-slate-800"
                  )}
                >
                  {m.body}
                </div>
              )}
              <p className="mt-0.5 text-xs text-slate-400">
                {m.sender.name} &middot; {formatDateTime(m.createdAt)}
              </p>
            </div>
          );
        })}
      </div>

      {error && <Alert tone="error">{error}</Alert>}

      {canSend ? (
        <form ref={formRef} action={formAction} className="flex flex-col gap-2">
          {pendingFile && (
            <div className="flex items-center gap-2 rounded-md bg-slate-50 px-2 py-1 text-xs text-slate-600">
              <Paperclip className="h-3.5 w-3.5" />
              <span className="min-w-0 flex-1 truncate">{pendingFile.name}</span>
              <button type="button" onClick={() => { setPendingFile(null); if (fileInputRef.current) fileInputRef.current.value = ""; }}>
                <X className="h-3.5 w-3.5" />
              </button>
            </div>
          )}
          {selectedRef && (
            <div className="flex items-center gap-2 rounded-md bg-slate-50 px-2 py-1 text-xs text-slate-600">
              <Link2 className="h-3.5 w-3.5" />
              <span className="min-w-0 flex-1 truncate">
                {selectedRef.type.replace("_", " ")}: {selectedRef.label}
              </span>
              <button type="button" onClick={() => setSelectedRef(null)}>
                <X className="h-3.5 w-3.5" />
              </button>
            </div>
          )}

          {showRefPicker && (
            <div className="max-h-40 overflow-y-auto rounded-md border border-slate-200 bg-white p-2 text-sm">
              {!refOptions && <p className="text-xs text-slate-400">Loading…</p>}
              {refOptions && !hasRefOptions && <p className="text-xs text-slate-400">No transactions to reference yet.</p>}
              {refOptions?.quotations.map((q) => (
                <button
                  key={q.id}
                  type="button"
                  className="block w-full truncate rounded px-2 py-1 text-left hover:bg-slate-50"
                  onClick={() => {
                    setSelectedRef({ type: "QUOTATION", id: q.id, label: q.label });
                    setShowRefPicker(false);
                  }}
                >
                  Quotation #{q.label}
                </button>
              ))}
              {refOptions?.jobOrders.map((j) => (
                <button
                  key={j.id}
                  type="button"
                  className="block w-full truncate rounded px-2 py-1 text-left hover:bg-slate-50"
                  onClick={() => {
                    setSelectedRef({ type: "JOB_ORDER", id: j.id, label: j.label });
                    setShowRefPicker(false);
                  }}
                >
                  Job Order #{j.label}
                </button>
              ))}
              {refOptions?.inquiries.map((i) => (
                <button
                  key={i.id}
                  type="button"
                  className="block w-full truncate rounded px-2 py-1 text-left hover:bg-slate-50"
                  onClick={() => {
                    setSelectedRef({ type: "INQUIRY", id: i.id, label: i.label });
                    setShowRefPicker(false);
                  }}
                >
                  Inquiry: {i.label}
                </button>
              ))}
            </div>
          )}

          {showEmoji && (
            <div className="flex flex-wrap gap-1 rounded-md border border-slate-200 bg-white p-2">
              {EMOJI.map((e) => (
                <button key={e} type="button" className="rounded p-1 text-lg hover:bg-slate-100" onClick={() => insertEmoji(e)}>
                  {e}
                </button>
              ))}
            </div>
          )}

          <div className="flex items-end gap-2">
            <div className="flex gap-1">
              {canAttach && (
                <>
                  <input
                    ref={fileInputRef}
                    type="file"
                    name="attachment"
                    className="hidden"
                    onChange={(e) => setPendingFile(e.target.files?.[0] ?? null)}
                  />
                  <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    aria-label="Attach file"
                    className="rounded-md p-2 text-slate-400 hover:bg-slate-100 hover:text-slate-700"
                  >
                    <Paperclip className="h-4 w-4" />
                  </button>
                </>
              )}
              <button
                type="button"
                onClick={() => { setShowEmoji((v) => !v); setShowRefPicker(false); }}
                aria-label="Insert emoji"
                className="rounded-md p-2 text-slate-400 hover:bg-slate-100 hover:text-slate-700"
              >
                <Smile className="h-4 w-4" />
              </button>
              {canReference && (
                <button
                  type="button"
                  onClick={openRefPicker}
                  aria-label="Reference a transaction"
                  className="rounded-md p-2 text-slate-400 hover:bg-slate-100 hover:text-slate-700"
                >
                  <Link2 className="h-4 w-4" />
                </button>
              )}
            </div>
            <Textarea ref={textareaRef} name="body" rows={1} placeholder="Type a message..." className="flex-1" />
            {selectedRef && <input type="hidden" name="refType" value={selectedRef.type} />}
            {selectedRef && <input type="hidden" name="refId" value={selectedRef.id} />}
            <Button type="submit" size="sm" disabled={pending}>
              {pending ? "Sending..." : "Send"}
            </Button>
          </div>
        </form>
      ) : (
        <p className="rounded-md bg-slate-50 px-3 py-2 text-xs text-slate-500">
          You have view-only access to this conversation.
        </p>
      )}
    </div>
  );
}
