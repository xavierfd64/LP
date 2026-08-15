import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { getOrCreateConversation, ConversationSubjectType } from "@/lib/conversations";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { formatDateTime } from "@/lib/utils";

export async function ConversationCard({
  customerId,
  subjectType,
  subjectId,
  currentUserId,
}: {
  customerId: string;
  subjectType: ConversationSubjectType;
  subjectId: string;
  currentUserId: string;
}) {
  const conversation = await getOrCreateConversation(customerId, subjectType, subjectId);

  const [lastMessage, read] = await Promise.all([
    prisma.message.findFirst({ where: { conversationId: conversation.id }, orderBy: { createdAt: "desc" }, include: { sender: true } }),
    prisma.conversationRead.findUnique({
      where: { conversationId_userId: { conversationId: conversation.id, userId: currentUserId } },
    }),
  ]);

  const unreadCount = await prisma.message.count({
    where: {
      conversationId: conversation.id,
      senderId: { not: currentUserId },
      createdAt: { gt: read?.lastReadAt ?? new Date(0) },
    },
  });

  return (
    <Card>
      <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-2">
        <CardTitle>Messages</CardTitle>
        {unreadCount > 0 && <Badge tone="red">{unreadCount} unread</Badge>}
      </CardHeader>
      <CardContent className="space-y-2 text-sm">
        {lastMessage ? (
          <p className="text-slate-600">
            <span className="font-medium text-slate-900">{lastMessage.sender.name}: </span>
            {lastMessage.body.length > 100 ? `${lastMessage.body.slice(0, 100)}...` : lastMessage.body}
            <span className="ml-2 text-xs text-slate-400">{formatDateTime(lastMessage.createdAt)}</span>
          </p>
        ) : (
          <p className="text-slate-400">No messages yet.</p>
        )}
        <Link href={`/messages/${conversation.id}`}>
          <Button size="sm" variant="outline">
            {lastMessage ? "Open Chat" : "Start Chat"}
          </Button>
        </Link>
      </CardContent>
    </Card>
  );
}
