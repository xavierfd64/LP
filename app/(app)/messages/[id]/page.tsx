import Link from "next/link";
import { requireUser } from "@/lib/session";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { MessageThread } from "@/components/messaging/message-thread";
import { getConversationMessagesAction } from "@/app/actions/messages";
import { PRESENCE_DOT, PRESENCE_LABEL } from "@/lib/staff-presence";

const KIND_LABEL: Record<string, string> = {
  CUSTOMER: "Customer Conversation",
  CUSTOMER_GROUP: "Customer Group",
  PRIVATE: "Private Conversation",
  GROUP: "Group Conversation",
};

export default async function ConversationDetailPage({ params }: PageProps<"/messages/[id]">) {
  const { id } = await params;
  const user = await requireUser();
  const isStaffLike = user.role === "STAFF" || user.role === "ADMIN";

  const data = await getConversationMessagesAction(id);

  return (
    <div className="max-w-2xl space-y-6">
      <div>
        <div className="flex flex-wrap items-center gap-2">
          <h1 className="text-2xl font-bold text-slate-900">
            {data.presence && <span className="mr-1">{PRESENCE_DOT[data.presence]}</span>}
            {data.title}
          </h1>
          {isStaffLike && <Badge tone="slate">{KIND_LABEL[data.conversationType]}</Badge>}
        </div>
        {isStaffLike && data.customerName && data.conversationType === "CUSTOMER" && (
          <p className="text-sm text-slate-500">{data.customerName}</p>
        )}
        {isStaffLike && data.conversationType === "CUSTOMER" && (
          <p className="mt-1 text-sm text-slate-500">
            {data.assignedStaffName ? (
              <>
                Responsible Staff: <span className="font-medium text-slate-700">{data.assignedStaffName}</span>
              </>
            ) : (
              "Unassigned — replying will make you the responsible Staff member."
            )}
          </p>
        )}
        {data.presence && <p className="text-xs text-slate-400">{PRESENCE_LABEL[data.presence]}</p>}
        {data.sourceLink && (
          <Link href={data.sourceLink} className="text-sm text-slate-500 underline">
            View related record →
          </Link>
        )}
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Conversation</CardTitle>
        </CardHeader>
        <CardContent>
          <MessageThread
            conversationId={id}
            currentUserId={user.id}
            messages={data.messages}
            canSend={data.canSend}
            canAttach={data.canAttach}
            canReference={data.canReference}
          />
        </CardContent>
      </Card>
    </div>
  );
}
