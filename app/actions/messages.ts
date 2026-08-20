"use server";

import { z } from "zod";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/session";
import { can } from "@/lib/permissions-guard";
import { getCurrentCustomer } from "@/lib/current-customer";
import { notifyCustomer, notifyStaff, notifyUser } from "@/lib/notifications";
import {
  getOrCreateGeneralConversation,
  markConversationRead,
  conversationReferenceLabel,
  conversationSourceLink,
} from "@/lib/conversations";
import { publishToUsers } from "@/lib/realtime";
import { saveUploadedFile, UploadRejectedError } from "@/lib/upload";
import { presenceStatus, type PresenceStatus } from "@/lib/staff-presence";
import { autoAssignOnNewCustomerMessage } from "@/lib/auto-assignment";

const messageSchema = z.object({ body: z.string().max(4000).optional() });

const ATTACHMENT_MAX_BYTES = 10 * 1024 * 1024;

type ConversationForAccess = {
  type: string;
  customerId: string | null;
  assignedStaffId: string | null;
  participants: { userId: string }[];
};

/**
 * Structural (non-permission) access check: is this user a legitimate party
 * to this conversation at all? CUSTOMER conversations are visible to any
 * staff-like user (their COMMUNICATION_VIEW grant is checked separately by
 * callers, since that's an async DB lookup this pure predicate avoids).
 * CUSTOMER_GROUP/PRIVATE/GROUP always require explicit participation.
 */
function hasStructuralAccess(
  user: { id: string; role: string },
  viewerCustomerId: string | null,
  conversation: ConversationForAccess
) {
  if (user.role === "CUSTOMER") {
    return (conversation.type === "CUSTOMER" || conversation.type === "CUSTOMER_GROUP") && conversation.customerId === viewerCustomerId;
  }
  if (conversation.type === "CUSTOMER") return true;
  return conversation.participants.some((p) => p.userId === user.id);
}

/** Whether this user may send into this conversation right now — the ownership rule: once a CUSTOMER conversation is assigned, only that Staff member (or Admin after an explicit takeover) may reply. CUSTOMER_GROUP/GROUP/PRIVATE have no single-owner lock, just participation + COMMUNICATION_SEND. */
async function computeCanSend(
  user: { id: string; role: string },
  conversation: ConversationForAccess
): Promise<boolean> {
  if (user.role === "CUSTOMER") return true;
  if (!(await can(user, "COMMUNICATION_SEND"))) return false;
  if (conversation.type === "CUSTOMER") {
    return !conversation.assignedStaffId || conversation.assignedStaffId === user.id;
  }
  return conversation.participants.some((p) => p.userId === user.id);
}

async function createAndPublishMessage(params: {
  conversationId: string;
  senderId: string;
  type: "TEXT" | "SYSTEM";
  body: string;
  attachmentPath?: string;
  attachmentName?: string;
  attachmentMime?: string;
  attachmentSize?: number;
  refType?: "INQUIRY" | "QUOTATION" | "JOB_ORDER";
  refInquiryId?: string;
  refQuotationId?: string;
  refJobOrderId?: string;
  recipientUserIds: string[];
}) {
  const { recipientUserIds, ...data } = params;
  const message = await prisma.message.create({ data, include: { sender: true, ...MESSAGE_REF_INCLUDE } });
  const serialized = serializeMessage(message);
  publishToUsers(recipientUserIds, {
    type: "message",
    conversationId: params.conversationId,
    message: {
      id: serialized.id,
      body: serialized.body,
      senderId: serialized.senderId,
      senderName: message.sender.name,
      senderRole: message.sender.role,
      messageType: serialized.type,
      createdAt: serialized.createdAt,
      attachment: serialized.attachment,
      reference: serialized.reference,
    },
  });
  return message;
}

// ---------- Composer: send (text / attachment / transaction reference) ----------

export async function sendMessageAction(conversationId: string, _prevState: string | undefined, formData: FormData) {
  const user = await requireUser();
  const isStaffLike = user.role === "STAFF" || user.role === "ADMIN";

  const conversation = await prisma.conversation.findUniqueOrThrow({
    where: { id: conversationId },
    include: { participants: true, customer: true },
  });

  let viewerCustomerId: string | null = null;
  if (!isStaffLike) {
    if (user.role !== "CUSTOMER") throw new Error("Not allowed.");
    viewerCustomerId = (await getCurrentCustomer(user.id)).id;
  }
  if (!hasStructuralAccess(user, viewerCustomerId, conversation)) throw new Error("Not allowed.");
  if (isStaffLike && !(await can(user, "COMMUNICATION_VIEW"))) throw new Error("Not allowed.");

  const canSend = await computeCanSend(user, conversation);
  if (!canSend) throw new Error("You are not the responsible Staff member for this conversation.");

  const parsed = messageSchema.safeParse({ body: formData.get("body") || undefined });
  if (!parsed.success) return parsed.error.issues[0]?.message ?? "Invalid input.";
  const bodyText = (parsed.data.body ?? "").trim();

  // Attachment
  let attachmentPath: string | undefined;
  let attachmentName: string | undefined;
  let attachmentMime: string | undefined;
  let attachmentSize: number | undefined;
  const file = formData.get("attachment");
  if (file instanceof File && file.size > 0) {
    if (isStaffLike && !(await can(user, "COMMUNICATION_ATTACHMENT"))) {
      return "You do not have permission to send attachments.";
    }
    let saved: { filename: string; path: string };
    try {
      saved = await saveUploadedFile(file, "chat-attachment", { maxBytes: ATTACHMENT_MAX_BYTES });
    } catch (e) {
      if (e instanceof UploadRejectedError) return e.message;
      throw e;
    }
    attachmentPath = saved.path;
    attachmentName = saved.filename;
    attachmentMime = file.type || undefined;
    attachmentSize = file.size;
  }

  // Transaction reference
  let refType: "INQUIRY" | "QUOTATION" | "JOB_ORDER" | undefined;
  let refInquiryId: string | undefined;
  let refQuotationId: string | undefined;
  let refJobOrderId: string | undefined;
  const refTypeRaw = formData.get("refType");
  const refId = formData.get("refId");
  if (typeof refTypeRaw === "string" && typeof refId === "string" && refId) {
    if (isStaffLike && !(await can(user, "COMMUNICATION_REFERENCE_TRANSACTION"))) {
      return "You do not have permission to reference a transaction.";
    }
    if (!conversation.customerId) return "This conversation has no linked customer to reference a transaction for.";
    if (refTypeRaw === "INQUIRY") {
      const rec = await prisma.inquiry.findFirst({ where: { id: refId, customerId: conversation.customerId } });
      if (!rec) return "That inquiry could not be found.";
      refType = "INQUIRY";
      refInquiryId = rec.id;
    } else if (refTypeRaw === "QUOTATION") {
      const rec = await prisma.quotation.findFirst({ where: { id: refId, customerId: conversation.customerId } });
      if (!rec) return "That quotation could not be found.";
      refType = "QUOTATION";
      refQuotationId = rec.id;
    } else if (refTypeRaw === "JOB_ORDER") {
      const rec = await prisma.jobOrder.findFirst({ where: { id: refId, order: { customerId: conversation.customerId } } });
      if (!rec) return "That job order could not be found.";
      refType = "JOB_ORDER";
      refJobOrderId = rec.id;
    }
  }

  if (!bodyText && !attachmentPath && !refType) {
    return "Type a message, attach a file, or reference a transaction.";
  }

  const wasUnassigned = conversation.type === "CUSTOMER" && isStaffLike && !conversation.assignedStaffId;
  const customerSentIntoUnassigned = conversation.type === "CUSTOMER" && !isStaffLike && !conversation.assignedStaffId;

  // Recipients: everyone who should get this pushed live / notified.
  const recipientUserIds = new Set<string>([user.id]);
  const preview = bodyText
    ? bodyText.length > 80
      ? `${bodyText.slice(0, 80)}...`
      : bodyText
    : attachmentPath
      ? `Sent an attachment: ${attachmentName}`
      : "Referenced a transaction";
  const link = `/messages/${conversationId}`;

  if (conversation.type === "CUSTOMER" || conversation.type === "CUSTOMER_GROUP") {
    if (conversation.customerId) {
      if (isStaffLike) {
        await notifyCustomer(conversation.customerId, "NEW_MESSAGE", `New message: "${preview}"`, link);
        const custUser = await prisma.customer.findUnique({ where: { id: conversation.customerId }, select: { userId: true } });
        if (custUser?.userId) recipientUserIds.add(custUser.userId);
      } else if (conversation.assignedStaffId) {
        await notifyUser(conversation.assignedStaffId, "NEW_MESSAGE", `New message from customer: "${preview}"`, link);
      } else {
        await notifyStaff("NEW_MESSAGE", `New message from customer: "${preview}"`, link);
      }
      if (!isStaffLike) {
        const staffUsers = await prisma.user.findMany({ where: { role: { in: ["STAFF", "ADMIN"] } }, select: { id: true } });
        for (const u of staffUsers) recipientUserIds.add(u.id);
      }
    }
    for (const p of conversation.participants) recipientUserIds.add(p.userId);
  } else {
    for (const p of conversation.participants) {
      if (p.userId === user.id) continue;
      await notifyUser(p.userId, "NEW_MESSAGE", `New message from ${user.name}: "${preview}"`, link);
      recipientUserIds.add(p.userId);
    }
  }

  await createAndPublishMessage({
    conversationId,
    senderId: user.id,
    type: "TEXT",
    body: bodyText,
    attachmentPath,
    attachmentName,
    attachmentMime,
    attachmentSize,
    refType,
    refInquiryId,
    refQuotationId,
    refJobOrderId,
    recipientUserIds: Array.from(recipientUserIds),
  });

  // Ownership: the first Staff/Admin reply to an unassigned conversation
  // establishes them as the responsible party — never on viewing, only on
  // actually sending.
  if (wasUnassigned) {
    await prisma.conversation.update({ where: { id: conversationId }, data: { assignedStaffId: user.id, assignedAt: new Date() } });
    await createAndPublishMessage({
      conversationId,
      senderId: user.id,
      type: "SYSTEM",
      body: `${user.name} is now handling this conversation.`,
      recipientUserIds: Array.from(recipientUserIds),
    });
  }

  // 24h response-reminder bookkeeping: a customer message starts the clock,
  // any Staff/Admin reply clears it.
  if (conversation.type === "CUSTOMER") {
    await prisma.conversation.update({
      where: { id: conversationId },
      data: { lastCustomerMessageAt: isStaffLike ? null : new Date() },
    });
  }

  // Automatic assignment (if Business Settings has it enabled) — a no-op
  // under MANUAL, and MANUAL_WITH_AUTO_FALLBACK is handled by the sweep
  // instead of firing immediately here.
  if (customerSentIntoUnassigned) {
    await autoAssignOnNewCustomerMessage(conversationId);
  }

  await markConversationRead(conversationId, user.id);
}

// ---------- Ownership: transfer / reassign / take over ----------

async function loadConversationFull(conversationId: string) {
  return prisma.conversation.findUniqueOrThrow({
    where: { id: conversationId },
    include: { customer: true, assignedStaff: true },
  });
}

/** One action backs both "Transfer" (used by the current owner) and "Reassign" (used by Admin/a manager) — the permission checked depends on whether the caller currently owns the conversation. */
export async function reassignConversationAction(conversationId: string, toUserId: string) {
  const user = await requireUser();
  const isStaffLike = user.role === "STAFF" || user.role === "ADMIN";
  if (!isStaffLike) throw new Error("Not allowed.");

  const conversation = await loadConversationFull(conversationId);
  if (conversation.type !== "CUSTOMER") throw new Error("Only customer conversations can be reassigned.");

  const isCurrentOwner = conversation.assignedStaffId === user.id;
  if (isCurrentOwner) {
    if (!(await can(user, "COMMUNICATION_TRANSFER"))) throw new Error("You do not have permission to transfer this conversation.");
  } else if (user.role !== "ADMIN" && !(await can(user, "COMMUNICATION_ASSIGN"))) {
    throw new Error("You do not have permission to reassign this conversation.");
  }

  const toUser = await prisma.user.findUnique({ where: { id: toUserId } });
  if (!toUser || !toUser.active || (toUser.role !== "STAFF" && toUser.role !== "ADMIN")) {
    throw new Error("That Staff member is not available for assignment.");
  }

  const fromLabel = conversation.assignedStaff?.name ?? "Unassigned";
  const recipients = new Set([user.id, toUserId]);
  if (conversation.assignedStaffId) recipients.add(conversation.assignedStaffId);

  await prisma.conversation.update({ where: { id: conversationId }, data: { assignedStaffId: toUserId, assignedAt: new Date() } });
  await createAndPublishMessage({
    conversationId,
    senderId: user.id,
    type: "SYSTEM",
    body: `Conversation ${isCurrentOwner ? "transferred" : "reassigned"} from ${fromLabel} to ${toUser.name}.`,
    recipientUserIds: Array.from(recipients),
  });
  await notifyUser(
    toUserId,
    "CONVERSATION_ASSIGNED",
    `A conversation with ${conversation.customer?.name ?? "a customer"} has been assigned to you.`,
    `/messages/${conversationId}`
  );
}

/** Admin (or COMMUNICATION_ASSIGN) claiming a conversation directly, regardless of current owner — for when the responsible Staff member is unavailable. */
export async function takeOverConversationAction(conversationId: string) {
  const user = await requireUser();
  const isStaffLike = user.role === "STAFF" || user.role === "ADMIN";
  if (!isStaffLike) throw new Error("Not allowed.");
  if (user.role !== "ADMIN" && !(await can(user, "COMMUNICATION_ASSIGN"))) {
    throw new Error("You do not have permission to take over conversations.");
  }

  const conversation = await loadConversationFull(conversationId);
  if (conversation.type !== "CUSTOMER") throw new Error("Only customer conversations can be taken over.");

  const fromLabel = conversation.assignedStaff?.name ?? "Unassigned";
  const recipients = new Set([user.id]);
  if (conversation.assignedStaffId) recipients.add(conversation.assignedStaffId);

  await prisma.conversation.update({ where: { id: conversationId }, data: { assignedStaffId: user.id, assignedAt: new Date() } });
  await createAndPublishMessage({
    conversationId,
    senderId: user.id,
    type: "SYSTEM",
    body: `${user.name} took over this conversation from ${fromLabel}.`,
    recipientUserIds: Array.from(recipients),
  });
}

// ---------- Search + starting new conversations ----------

export async function searchCustomersAction(query: string) {
  const user = await requireUser();
  const isStaffLike = user.role === "STAFF" || user.role === "ADMIN";
  if (!isStaffLike) throw new Error("Not allowed.");
  if (user.role !== "ADMIN" && !(await can(user, "COMMUNICATION_SEARCH_CUSTOMER"))) {
    throw new Error("You do not have permission to search customers.");
  }
  const q = query.trim();
  if (!q) return [];
  return prisma.customer.findMany({
    where: { name: { contains: q, mode: "insensitive" } },
    take: 10,
    orderBy: { name: "asc" },
    select: { id: true, name: true, companyName: true },
  });
}

export async function startCustomerConversationAction(customerId: string) {
  const user = await requireUser();
  const isStaffLike = user.role === "STAFF" || user.role === "ADMIN";
  if (!isStaffLike) throw new Error("Not allowed.");
  if (user.role !== "ADMIN" && !(await can(user, "COMMUNICATION_SEARCH_CUSTOMER"))) throw new Error("Not allowed.");
  const conversation = await getOrCreateGeneralConversation(customerId);
  return { id: conversation.id };
}

export type StaffSearchResult = { id: string; name: string; role: string; presence: PresenceStatus };

export async function searchStaffAction(query: string): Promise<StaffSearchResult[]> {
  const user = await requireUser();
  const isStaffLike = user.role === "STAFF" || user.role === "ADMIN";
  if (!isStaffLike) throw new Error("Not allowed.");
  const q = query.trim();
  const staff = await prisma.user.findMany({
    where: { role: { in: ["STAFF", "ADMIN"] }, active: true, id: { not: user.id }, name: { contains: q, mode: "insensitive" } },
    take: 15,
    orderBy: { name: "asc" },
    select: { id: true, name: true, role: true, lastActiveAt: true },
  });
  return staff.map((s) => ({ id: s.id, name: s.name, role: s.role, presence: presenceStatus(s.lastActiveAt) }));
}

export async function startPrivateChatAction(otherUserId: string) {
  const user = await requireUser();
  const isStaffLike = user.role === "STAFF" || user.role === "ADMIN";
  if (!isStaffLike) throw new Error("Not allowed.");
  if (!(await can(user, "COMMUNICATION_VIEW"))) throw new Error("Not allowed.");
  if (otherUserId === user.id) throw new Error("You can't start a conversation with yourself.");

  const other = await prisma.user.findUnique({ where: { id: otherUserId } });
  if (!other || !other.active || (other.role !== "STAFF" && other.role !== "ADMIN")) {
    throw new Error("That user is not available for a private conversation.");
  }
  if (user.role === "STAFF" && other.role !== "ADMIN") {
    throw new Error("Staff can only start a private conversation with Admin.");
  }

  const existing = await prisma.conversation.findFirst({
    where: {
      type: "PRIVATE",
      AND: [{ participants: { some: { userId: user.id } } }, { participants: { some: { userId: other.id } } }],
    },
  });
  if (existing) return { id: existing.id };

  const conversation = await prisma.conversation.create({
    data: { type: "PRIVATE", createdById: user.id, participants: { create: [{ userId: user.id }, { userId: other.id }] } },
  });
  await notifyUser(other.id, "PRIVATE_CHAT_STARTED", `${user.name} started a private conversation with you.`, `/messages/${conversation.id}`);
  return { id: conversation.id };
}

export async function startGroupChatAction(title: string, participantUserIds: string[], customerId?: string) {
  const user = await requireUser();
  const isStaffLike = user.role === "STAFF" || user.role === "ADMIN";
  if (!isStaffLike) throw new Error("Not allowed.");
  if (user.role !== "ADMIN" && !(await can(user, "COMMUNICATION_GROUP"))) {
    throw new Error("You do not have permission to create group chats.");
  }

  const trimmedTitle = title.trim();
  if (!trimmedTitle) throw new Error("Group name is required.");
  const uniqueParticipants = Array.from(new Set([...participantUserIds, user.id]));
  if (uniqueParticipants.length < 2) throw new Error("Select at least one other participant.");

  const validUsers = await prisma.user.findMany({
    where: { id: { in: uniqueParticipants }, role: { in: ["STAFF", "ADMIN"] }, active: true },
    select: { id: true },
  });
  if (validUsers.length !== uniqueParticipants.length) throw new Error("One or more selected participants are not available.");

  let customerRecordId: string | undefined;
  if (customerId) {
    const customer = await prisma.customer.findUnique({ where: { id: customerId } });
    if (!customer) throw new Error("Customer not found.");
    customerRecordId = customer.id;
  }

  const conversation = await prisma.conversation.create({
    data: {
      type: customerRecordId ? "CUSTOMER_GROUP" : "GROUP",
      title: trimmedTitle,
      customerId: customerRecordId,
      createdById: user.id,
      participants: { create: uniqueParticipants.map((id) => ({ userId: id })) },
    },
  });

  const others = uniqueParticipants.filter((id) => id !== user.id);
  await Promise.all(
    others.map((id) => notifyUser(id, "GROUP_CHAT_CREATED", `${user.name} added you to "${trimmedTitle}".`, `/messages/${conversation.id}`))
  );

  return { id: conversation.id };
}

// ---------- Reading conversations / messages ----------

export type ConversationPreview = {
  id: string;
  kind: "CUSTOMER" | "CUSTOMER_GROUP" | "PRIVATE" | "GROUP";
  title: string;
  subtitle?: string;
  assignedStaffName?: string | null;
  isMine?: boolean;
  presence?: PresenceStatus;
  lastMessage: { body: string; senderName: string; createdAt: string; hasAttachment: boolean } | null;
  unreadCount: number;
  updatedAt: string;
};

export async function getMyConversationsAction(): Promise<ConversationPreview[]> {
  const user = await requireUser();
  const isStaffLike = user.role === "STAFF" || user.role === "ADMIN";

  const include = {
    customer: true,
    assignedStaff: true,
    participants: { include: { user: true } },
    inquiry: { select: { desiredProduct: true } },
    quotation: { select: { quoteNumber: true } },
    order: { select: { orderNumber: true } },
    jobOrder: { select: { joNumber: true } },
    messages: { orderBy: { createdAt: "desc" as const }, take: 1, include: { sender: true } },
    reads: { where: { userId: user.id } },
  };

  const conversations = isStaffLike
    ? await (async () => {
        if (!(await can(user, "COMMUNICATION_VIEW"))) throw new Error("Not allowed.");
        return prisma.conversation.findMany({
          where: { OR: [{ type: "CUSTOMER" }, { participants: { some: { userId: user.id } } }] },
          include,
          orderBy: { createdAt: "desc" },
        });
      })()
    : await (async () => {
        if (user.role !== "CUSTOMER") throw new Error("Not allowed.");
        const customer = await getCurrentCustomer(user.id);
        return prisma.conversation.findMany({
          where: { customerId: customer.id, type: { in: ["CUSTOMER", "CUSTOMER_GROUP"] } },
          include,
          orderBy: { createdAt: "desc" },
        });
      })();

  const withMeta = await Promise.all(
    conversations.map(async (c) => {
      const lastMessage = c.messages[0];
      const lastReadAt = c.reads[0]?.lastReadAt ?? new Date(0);
      const unreadCount = await prisma.message.count({
        where: { conversationId: c.id, senderId: { not: user.id }, createdAt: { gt: lastReadAt } },
      });

      let title: string;
      let subtitle: string | undefined;
      let presence: PresenceStatus | undefined;

      if (c.type === "CUSTOMER" || c.type === "CUSTOMER_GROUP") {
        const refLabel = conversationReferenceLabel(c);
        title = isStaffLike ? (c.customer?.name ?? "Customer") : refLabel;
        subtitle = isStaffLike ? `Re: ${refLabel}` : undefined;
        if (c.type === "CUSTOMER_GROUP" && c.title) title = c.title;
      } else if (c.type === "PRIVATE") {
        const other = c.participants.find((p) => p.userId !== user.id)?.user;
        title = other?.name ?? "Private conversation";
        subtitle = "Private conversation";
        presence = presenceStatus(other?.lastActiveAt ?? null);
      } else {
        title = c.title ?? "Group Chat";
        subtitle = `Group · ${c.participants.length} members`;
      }

      return {
        id: c.id,
        kind: c.type as ConversationPreview["kind"],
        title,
        subtitle,
        assignedStaffName: c.type === "CUSTOMER" ? (c.assignedStaff?.name ?? null) : undefined,
        isMine: c.type === "CUSTOMER" ? !c.assignedStaffId || c.assignedStaffId === user.id : undefined,
        presence,
        lastMessage: lastMessage
          ? {
              body: lastMessage.body,
              senderName: lastMessage.sender.name,
              createdAt: lastMessage.createdAt.toISOString(),
              hasAttachment: Boolean(lastMessage.attachmentPath),
            }
          : null,
        unreadCount,
        updatedAt: (lastMessage?.createdAt ?? c.createdAt).toISOString(),
      };
    })
  );

  withMeta.sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());
  return withMeta;
}

export type MessageReference =
  | { type: "INQUIRY"; id: string; label: string; status: string }
  | { type: "QUOTATION"; id: string; label: string; status: string; amount: string; customerName: string }
  | { type: "JOB_ORDER"; id: string; label: string; status: string };

type MessageWithRelations = {
  id: string;
  body: string;
  type: "TEXT" | "SYSTEM";
  createdAt: Date;
  senderId: string;
  sender: { name: string; role: string };
  attachmentPath: string | null;
  attachmentName: string | null;
  attachmentMime: string | null;
  attachmentSize: number | null;
  refType: "INQUIRY" | "QUOTATION" | "JOB_ORDER" | null;
  refInquiry: { id: string; desiredProduct: string; status: string } | null;
  refQuotation: { id: string; quoteNumber: string; status: string; total: { toString(): string }; customer: { name: string } } | null;
  refJobOrder: { id: string; joNumber: string; status: string } | null;
};

const MESSAGE_REF_INCLUDE = {
  refInquiry: { select: { id: true, desiredProduct: true, status: true } },
  refQuotation: { select: { id: true, quoteNumber: true, status: true, total: true, customer: { select: { name: true } } } },
  refJobOrder: { select: { id: true, joNumber: true, status: true } },
} as const;

/** Shared by getConversationMessagesAction's page-load fetch and createAndPublishMessage's live broadcast, so a message looks identical whether it arrived cold or over SSE — attachments and transaction references included either way. */
function serializeMessage(m: MessageWithRelations) {
  let reference: MessageReference | null = null;
  if (m.refType === "INQUIRY" && m.refInquiry) {
    reference = { type: "INQUIRY", id: m.refInquiry.id, label: m.refInquiry.desiredProduct, status: m.refInquiry.status };
  } else if (m.refType === "QUOTATION" && m.refQuotation) {
    reference = {
      type: "QUOTATION",
      id: m.refQuotation.id,
      label: m.refQuotation.quoteNumber,
      status: m.refQuotation.status,
      amount: m.refQuotation.total.toString(),
      customerName: m.refQuotation.customer.name,
    };
  } else if (m.refType === "JOB_ORDER" && m.refJobOrder) {
    reference = { type: "JOB_ORDER", id: m.refJobOrder.id, label: m.refJobOrder.joNumber, status: m.refJobOrder.status };
  }
  return {
    id: m.id,
    body: m.body,
    type: m.type,
    createdAt: m.createdAt.toISOString(),
    senderId: m.senderId,
    sender: { name: m.sender.name, role: m.sender.role },
    attachment: m.attachmentPath
      ? { path: m.attachmentPath, name: m.attachmentName ?? "file", mime: m.attachmentMime ?? "", size: m.attachmentSize ?? 0 }
      : null,
    reference,
  };
}

export async function getConversationMessagesAction(conversationId: string) {
  const user = await requireUser();
  const isStaffLike = user.role === "STAFF" || user.role === "ADMIN";
  const conversation = await prisma.conversation.findUniqueOrThrow({
    where: { id: conversationId },
    include: {
      participants: { include: { user: true } },
      customer: true,
      assignedStaff: true,
      inquiry: { select: { desiredProduct: true } },
      quotation: { select: { quoteNumber: true } },
      order: { select: { orderNumber: true } },
      jobOrder: { select: { joNumber: true } },
    },
  });

  let viewerCustomerId: string | null = null;
  if (isStaffLike) {
    if (!(await can(user, "COMMUNICATION_VIEW"))) throw new Error("Not allowed.");
  } else if (user.role === "CUSTOMER") {
    viewerCustomerId = (await getCurrentCustomer(user.id)).id;
  } else {
    throw new Error("Not allowed.");
  }
  if (!hasStructuralAccess(user, viewerCustomerId, conversation)) throw new Error("Not allowed.");

  const canSend = await computeCanSend(user, conversation);
  const canTransfer = isStaffLike && conversation.assignedStaffId === user.id && (await can(user, "COMMUNICATION_TRANSFER"));
  const canAssign = isStaffLike && (user.role === "ADMIN" || (await can(user, "COMMUNICATION_ASSIGN")));
  const canReference = !isStaffLike || (await can(user, "COMMUNICATION_REFERENCE_TRANSACTION"));
  const canAttach = !isStaffLike || (await can(user, "COMMUNICATION_ATTACHMENT"));

  let title: string;
  let presence: PresenceStatus | undefined;
  if (conversation.type === "CUSTOMER" || conversation.type === "CUSTOMER_GROUP") {
    title = conversation.type === "CUSTOMER_GROUP" && conversation.title ? conversation.title : conversationReferenceLabel(conversation);
  } else if (conversation.type === "PRIVATE") {
    const other = conversation.participants.find((p) => p.userId !== user.id)?.user;
    title = other?.name ?? "Private conversation";
    presence = presenceStatus(other?.lastActiveAt ?? null);
  } else {
    title = conversation.title ?? "Group Chat";
  }

  const messages = await prisma.message.findMany({
    where: { conversationId },
    orderBy: { createdAt: "asc" },
    include: { sender: true, ...MESSAGE_REF_INCLUDE },
  });
  await markConversationRead(conversationId, user.id);

  return {
    canSend,
    canTransfer,
    canAssign,
    canReference,
    canAttach,
    conversationType: conversation.type,
    customerId: conversation.customerId,
    customerName: conversation.customer?.name ?? null,
    assignedStaffId: conversation.assignedStaffId,
    assignedStaffName: conversation.assignedStaff?.name ?? null,
    title,
    presence,
    sourceLink: conversationSourceLink(conversation),
    messages: messages.map(serializeMessage),
  };
}

export async function markConversationReadAction(conversationId: string) {
  const user = await requireUser();
  if (user.role === "STAFF" && !(await can(user, "COMMUNICATION_VIEW"))) throw new Error("Not allowed.");
  await markConversationRead(conversationId, user.id);
}

/** Fetches this conversation's customer's Inquiries/Quotations/Job Orders for the composer's "Reference" picker. */
export async function getCustomerTransactionsAction(conversationId: string) {
  const user = await requireUser();
  const isStaffLike = user.role === "STAFF" || user.role === "ADMIN";
  const conversation = await prisma.conversation.findUniqueOrThrow({
    where: { id: conversationId },
    select: { customerId: true },
  });
  if (!conversation.customerId) return { inquiries: [], quotations: [], jobOrders: [] };

  if (isStaffLike) {
    if (!(await can(user, "COMMUNICATION_VIEW"))) throw new Error("Not allowed.");
  } else if (user.role === "CUSTOMER") {
    const customer = await getCurrentCustomer(user.id);
    if (customer.id !== conversation.customerId) throw new Error("Not allowed.");
  } else {
    throw new Error("Not allowed.");
  }

  const [inquiries, quotations, jobOrders] = await Promise.all([
    prisma.inquiry.findMany({
      where: { customerId: conversation.customerId },
      orderBy: { createdAt: "desc" },
      take: 20,
      select: { id: true, desiredProduct: true, status: true },
    }),
    prisma.quotation.findMany({
      where: { customerId: conversation.customerId },
      orderBy: { createdAt: "desc" },
      take: 20,
      select: { id: true, quoteNumber: true, status: true },
    }),
    prisma.jobOrder.findMany({
      where: { order: { customerId: conversation.customerId } },
      orderBy: { createdAt: "desc" },
      take: 20,
      select: { id: true, joNumber: true, status: true },
    }),
  ]);

  return {
    inquiries: inquiries.map((i) => ({ id: i.id, label: i.desiredProduct, status: i.status })),
    quotations: quotations.map((q) => ({ id: q.id, label: q.quoteNumber, status: q.status })),
    jobOrders: jobOrders.map((j) => ({ id: j.id, label: j.joNumber, status: j.status })),
  };
}

// ---------- Misc ----------

export async function openOrCreateGeneralConversationAction() {
  const user = await requireUser();
  if (user.role !== "CUSTOMER") throw new Error("Not allowed.");
  const customer = await getCurrentCustomer(user.id);
  const conversation = await getOrCreateGeneralConversation(customer.id);
  return { id: conversation.id };
}

export async function startGeneralConversationAction() {
  const user = await requireUser();
  if (user.role !== "CUSTOMER") throw new Error("Not allowed.");
  const customer = await getCurrentCustomer(user.id);
  const conversation = await getOrCreateGeneralConversation(customer.id);
  redirect(`/messages/${conversation.id}`);
}

/** "Discuss in Chatbox" from an Inquiry/Quotation/Job Order page — opens (or creates) that customer's central conversation and returns a reference payload the floating widget pre-attaches to the composer. */
export async function openTransactionInChatAction(refType: "INQUIRY" | "QUOTATION" | "JOB_ORDER", refId: string) {
  const user = await requireUser();
  const isStaffLike = user.role === "STAFF" || user.role === "ADMIN";

  let customerId: string;
  if (refType === "INQUIRY") {
    customerId = (await prisma.inquiry.findUniqueOrThrow({ where: { id: refId } })).customerId;
  } else if (refType === "QUOTATION") {
    customerId = (await prisma.quotation.findUniqueOrThrow({ where: { id: refId } })).customerId;
  } else {
    const jo = await prisma.jobOrder.findUniqueOrThrow({ where: { id: refId }, include: { order: true } });
    customerId = jo.order.customerId;
  }

  if (!isStaffLike) {
    const customer = await getCurrentCustomer(user.id);
    if (customer.id !== customerId) throw new Error("Not allowed.");
  } else if (!(await can(user, "COMMUNICATION_VIEW"))) {
    throw new Error("Not allowed.");
  }

  const conversation = await getOrCreateGeneralConversation(customerId);
  return { conversationId: conversation.id, refType, refId };
}

/** Called every ~30s by a Staff/Admin client to keep User.lastActiveAt fresh — the basis for the Online/Away/Offline presence shown in assign/transfer/search pickers. */
export async function heartbeatAction() {
  const user = await requireUser();
  if (user.role !== "STAFF" && user.role !== "ADMIN") return;
  await prisma.user.update({ where: { id: user.id }, data: { lastActiveAt: new Date() } });
}
