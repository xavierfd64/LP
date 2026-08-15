"use client";

import { MessageCircle } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { openTransactionInChatAction } from "@/app/actions/messages";

/**
 * Replaces the old per-transaction "Message" card on Inquiry/Quotation/Job
 * Order pages — the floating Chatbox is now the central communication
 * channel (transaction pages still show the record itself, they just don't
 * embed a separate chat thread anymore). Opens/creates the customer's
 * central conversation and tells the widget to jump straight to it with
 * this transaction pre-attached as a reference.
 */
export function DiscussInChatboxButton({
  refType,
  refId,
  label,
}: {
  refType: "INQUIRY" | "QUOTATION" | "JOB_ORDER";
  refId: string;
  label: string;
}) {
  async function handleClick() {
    const { conversationId } = await openTransactionInChatAction(refType, refId);
    window.dispatchEvent(
      new CustomEvent("chatbox:open-reference", { detail: { conversationId, refType, refId, refLabel: label } })
    );
  }

  return (
    <Card>
      <CardContent className="flex flex-wrap items-center justify-between gap-3 py-4">
        <div>
          <p className="text-sm font-medium text-slate-900">Have a question about this?</p>
          <p className="text-xs text-slate-500">Message our team from the Chatbox, with this record attached for context.</p>
        </div>
        <Button type="button" size="sm" onClick={handleClick}>
          <MessageCircle className="mr-1.5 h-4 w-4" />
          Discuss in Chatbox
        </Button>
      </CardContent>
    </Card>
  );
}
