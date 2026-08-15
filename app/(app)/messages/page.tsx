import Link from "next/link";
import { redirect } from "next/navigation";
import { requireUser } from "@/lib/session";
import { can } from "@/lib/permissions-guard";
import { getCurrentCustomer } from "@/lib/current-customer";
import { prisma } from "@/lib/prisma";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { formatDateTime } from "@/lib/utils";
import { conversationReferenceLabel } from "@/lib/conversations";
import { Button } from "@/components/ui/button";
import { startGeneralConversationAction } from "@/app/actions/messages";
import { RefreshOnMessage } from "@/components/realtime/refresh-on-message";

export default async function MessagesPage() {
  const user = await requireUser();
  const isStaffLike = user.role === "STAFF" || user.role === "ADMIN";
  if (user.role === "STAFF" && !(await can(user, "COMMUNICATION_VIEW"))) redirect("/dashboard");

  const where = isStaffLike ? {} : { customerId: (await getCurrentCustomer(user.id)).id };

  const conversations = await prisma.conversation.findMany({
    where,
    include: {
      customer: true,
      inquiry: { select: { desiredProduct: true } },
      quotation: { select: { quoteNumber: true } },
      order: { select: { orderNumber: true } },
      jobOrder: { select: { joNumber: true } },
      messages: { orderBy: { createdAt: "desc" }, take: 1, include: { sender: true } },
      reads: { where: { userId: user.id } },
    },
    orderBy: { createdAt: "desc" },
  });

  const withMeta = await Promise.all(
    conversations.map(async (c) => {
      const lastMessage = c.messages[0];
      const lastReadAt = c.reads[0]?.lastReadAt ?? new Date(0);
      const unreadCount = await prisma.message.count({
        where: { conversationId: c.id, senderId: { not: user.id }, createdAt: { gt: lastReadAt } },
      });
      return { ...c, lastMessage, unreadCount };
    })
  );

  withMeta.sort((a, b) => {
    const at = a.lastMessage?.createdAt ?? a.createdAt;
    const bt = b.lastMessage?.createdAt ?? b.createdAt;
    return bt.getTime() - at.getTime();
  });

  return (
    <div className="space-y-6">
      <RefreshOnMessage />
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Messages</h1>
          <p className="text-sm text-slate-500">
            {isStaffLike
              ? "All customer conversations across inquiries, quotations, and orders."
              : "Chat with our team about your inquiries, quotations, and orders."}
          </p>
        </div>
        {!isStaffLike && (
          <form action={startGeneralConversationAction}>
            <Button type="submit" variant="outline">
              New General Message
            </Button>
          </form>
        )}
      </div>

      <Card className="divide-y divide-slate-100">
        {withMeta.length === 0 && <p className="p-4 text-sm text-slate-400">No conversations yet.</p>}
        {withMeta.map((c) => (
          <Link
            key={c.id}
            href={`/messages/${c.id}`}
            className="flex items-center justify-between gap-3 p-4 hover:bg-slate-50"
          >
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <p className="font-medium text-slate-900">{conversationReferenceLabel(c)}</p>
                {isStaffLike && <span className="text-sm text-slate-500">· {c.customer.name}</span>}
              </div>
              <p className="truncate text-sm text-slate-500">
                {c.lastMessage ? `${c.lastMessage.sender.name}: ${c.lastMessage.body}` : "No messages yet."}
              </p>
            </div>
            <div className="flex flex-shrink-0 flex-col items-end gap-1">
              <span className="text-xs text-slate-400">
                {formatDateTime(c.lastMessage?.createdAt ?? c.createdAt)}
              </span>
              {c.unreadCount > 0 && <Badge tone="red">{c.unreadCount}</Badge>}
            </div>
          </Link>
        ))}
      </Card>
    </div>
  );
}
