import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { requireUser } from "@/lib/session";
import { can } from "@/lib/permissions-guard";
import { getCurrentCustomer } from "@/lib/current-customer";
import { prisma } from "@/lib/prisma";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { MessageThread } from "@/components/messaging/message-thread";
import { markConversationRead, conversationSubjectLabel, conversationSourceLink } from "@/lib/conversations";

export default async function ConversationDetailPage({ params }: PageProps<"/messages/[id]">) {
  const { id } = await params;
  const user = await requireUser();
  const isStaffLike = user.role === "STAFF" || user.role === "ADMIN";

  const conversation = await prisma.conversation.findUnique({
    where: { id },
    include: { customer: true },
  });
  if (!conversation) notFound();

  if (!isStaffLike) {
    const customer = await getCurrentCustomer(user.id);
    if (conversation.customerId !== customer.id) redirect("/messages");
  } else if (user.role === "STAFF" && !(await can(user, "COMMUNICATION_VIEW"))) {
    redirect("/messages");
  }

  const messages = await prisma.message.findMany({
    where: { conversationId: conversation.id },
    orderBy: { createdAt: "asc" },
    include: { sender: true },
  });
  await markConversationRead(conversation.id, user.id);

  const sourceLink = conversationSourceLink(conversation);

  return (
    <div className="max-w-2xl space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">{conversationSubjectLabel(conversation)}</h1>
        {isStaffLike && <p className="text-sm text-slate-500">{conversation.customer.name}</p>}
        {sourceLink && (
          <Link href={sourceLink} className="text-sm text-slate-500 underline">
            View related record →
          </Link>
        )}
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Conversation</CardTitle>
        </CardHeader>
        <CardContent>
          <MessageThread conversationId={conversation.id} currentUserId={user.id} messages={messages} />
        </CardContent>
      </Card>
    </div>
  );
}
