"use client";

import { useActionState } from "react";
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

export function MessageThread({
  conversationId,
  currentUserId,
  messages,
}: {
  conversationId: string;
  currentUserId: string;
  messages: MessageItem[];
}) {
  const action = sendMessageAction.bind(null, conversationId);
  const [error, formAction, pending] = useActionState(action, undefined);

  return (
    <div className="space-y-3">
      <div className="max-h-96 space-y-2 overflow-y-auto rounded-md border border-slate-100 p-3">
        {messages.length === 0 && <p className="text-sm text-slate-400">No messages yet — say hello.</p>}
        {messages.map((m) => {
          const mine = m.senderId === currentUserId;
          return (
            <div key={m.id} className={cn("flex flex-col", mine ? "items-end" : "items-start")}>
              <div
                className={cn(
                  "max-w-[80%] rounded-lg px-3 py-2 text-sm",
                  mine ? "bg-slate-900 text-white" : "bg-slate-100 text-slate-800"
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
      <form action={formAction} className="flex flex-col gap-2 sm:flex-row sm:items-end">
        <Textarea name="body" rows={2} placeholder="Type a message..." className="flex-1" required />
        <Button type="submit" size="sm" disabled={pending} className="w-full sm:w-auto">
          {pending ? "Sending..." : "Send"}
        </Button>
      </form>
    </div>
  );
}
