import Link from "next/link";
import { redirect } from "next/navigation";
import { requireUser } from "@/lib/session";
import { can } from "@/lib/permissions-guard";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { formatDateTime } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { getMyConversationsAction, startGeneralConversationAction } from "@/app/actions/messages";
import { PRESENCE_DOT } from "@/lib/staff-presence";
import { RefreshOnMessage } from "@/components/realtime/refresh-on-message";

const KIND_LABEL: Record<string, string> = {
  CUSTOMER: "Customer",
  CUSTOMER_GROUP: "Customer Group",
  PRIVATE: "Private",
  GROUP: "Group",
};

export default async function MessagesPage() {
  const user = await requireUser();
  const isStaffLike = user.role === "STAFF" || user.role === "ADMIN";
  if (user.role === "STAFF" && !(await can(user, "COMMUNICATION_VIEW"))) redirect("/dashboard");

  const conversations = await getMyConversationsAction();

  return (
    <div className="space-y-6">
      <RefreshOnMessage />
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Messages</h1>
          <p className="text-sm text-slate-500">
            {isStaffLike
              ? "Every conversation you're authorized to see — customer, private, and group."
              : "Chat with our team. For inquiries, quotations, and orders, use the floating Chatbox to keep everything in one place."}
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
        {conversations.length === 0 && <p className="p-4 text-sm text-slate-400">No conversations yet.</p>}
        {conversations.map((c) => (
          <Link key={c.id} href={`/messages/${c.id}`} className="flex items-center justify-between gap-3 p-4 hover:bg-slate-50">
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <p className="font-medium text-slate-900">
                  {c.presence && <span className="mr-1">{PRESENCE_DOT[c.presence]}</span>}
                  {c.title}
                </p>
                {isStaffLike && <Badge tone="slate">{KIND_LABEL[c.kind]}</Badge>}
                {isStaffLike && c.kind === "CUSTOMER" && (
                  <Badge tone={c.isMine ? "green" : "default"}>{c.isMine ? "Can Reply" : "View Only"}</Badge>
                )}
              </div>
              {c.subtitle && <p className="truncate text-xs text-slate-400">{c.subtitle}</p>}
              <p className="truncate text-sm text-slate-500">
                {c.lastMessage
                  ? `${c.lastMessage.senderName}: ${c.lastMessage.hasAttachment && !c.lastMessage.body ? "📎 Attachment" : c.lastMessage.body}`
                  : "No messages yet."}
              </p>
            </div>
            <div className="flex flex-shrink-0 flex-col items-end gap-1">
              <span className="text-xs text-slate-400">{formatDateTime(c.updatedAt)}</span>
              {c.unreadCount > 0 && <Badge tone="red">{c.unreadCount}</Badge>}
            </div>
          </Link>
        ))}
      </Card>
    </div>
  );
}
