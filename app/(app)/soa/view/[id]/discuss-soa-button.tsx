"use client";

import { MessageCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { getStatementChatContextAction } from "@/app/actions/soa";
import { startCustomerConversationAction } from "@/app/actions/messages";

/** Opens the customer's existing central conversation in the floating Chatbox — reuses the same conversation every other "discuss this" surface uses, no separate SOA messaging channel. */
export function DiscussSoaButton({ statementId }: { statementId: string }) {
  async function handleClick() {
    const ctx = await getStatementChatContextAction(statementId);
    const { id: conversationId } = await startCustomerConversationAction(ctx.customerId);
    window.dispatchEvent(new CustomEvent("chatbox:open-conversation", { detail: { conversationId } }));
  }

  return (
    <Button type="button" variant="outline" onClick={handleClick}>
      <MessageCircle className="mr-1.5 h-4 w-4" />
      Discuss in Chatbox
    </Button>
  );
}
