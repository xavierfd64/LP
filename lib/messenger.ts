import { prisma } from "@/lib/prisma";
import { getBusinessSettings } from "@/lib/business-settings";
import { decryptSecret } from "@/lib/email-crypto";
import { generateSecureToken } from "@/lib/order-tracking";
import { MESSENGER_EVENTS, messengerMessageFor } from "@/lib/messenger-events";

const GRAPH_API_VERSION = "v19.0";

/** One row per Customer, created lazily the first time an opt-in link is requested. */
export async function getOrCreateMessengerConnection(customerId: string) {
  const existing = await prisma.messengerConnection.findUnique({ where: { customerId } });
  if (existing) return existing;
  return prisma.messengerConnection.create({ data: { customerId, optinRef: generateSecureToken() } });
}

/**
 * The real Meta "Send to Messenger" opt-in deep link — m.me/<pageId>?ref=
 * <code> — never a bare Facebook page URL (spec explicitly forbids
 * simulating Messenger that way). Returns null when the Page isn't
 * configured yet, so callers can hide the "Connect Messenger" UI cleanly.
 */
export async function messengerOptinLink(customerId: string): Promise<string | null> {
  const settings = await getBusinessSettings();
  if (!settings.messengerEnabled || !settings.messengerPageId) return null;
  const connection = await getOrCreateMessengerConnection(customerId);
  return `https://m.me/${settings.messengerPageId}?ref=${connection.optinRef}`;
}

async function callSendAPI(pageAccessToken: string, psid: string, text: string): Promise<void> {
  const res = await fetch(
    `https://graph.facebook.com/${GRAPH_API_VERSION}/me/messages?access_token=${encodeURIComponent(pageAccessToken)}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        recipient: { id: psid },
        message: { text },
        messaging_type: "MESSAGE_TAG",
        tag: "POST_PURCHASE_UPDATE",
      }),
    }
  );
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`Meta Send API error ${res.status}: ${body.slice(0, 300)}`);
  }
}

/**
 * Centralized Messenger funnel — mirrors sendEmailEvent's contract exactly
 * (never throws; always leaves a MessengerLog trail) and is called from the
 * same lib/notifications.ts funnel, so every existing notifyCustomer call
 * site becomes Messenger-capable with zero per-module changes. Two distinct
 * "nothing sent" cases are both logged SKIPPED rather than silently
 * dropped, so Admin can see exactly why: the customer never explicitly
 * connected (spec: "Do not send unsolicited messages"), or the Page itself
 * isn't configured yet.
 */
export async function sendMessengerEvent(
  eventType: string,
  customerId: string,
  vars: { message: string; trackingLink?: string },
  related?: { type: string; id: string }
): Promise<void> {
  const eventDef = MESSENGER_EVENTS[eventType];
  if (!eventDef) return;

  const settings = await getBusinessSettings();
  if (!settings.messengerEnabled) return;

  const overrides = (settings.messengerEventSettings ?? {}) as Record<string, boolean>;
  if (overrides[eventDef.category] === false) return;

  const text = messengerMessageFor(eventType, vars);
  const connection = await prisma.messengerConnection.findUnique({ where: { customerId } });

  if (!connection?.connected || !connection.psid) {
    await prisma.messengerLog.create({
      data: {
        customerId,
        message: text,
        eventType,
        relatedType: related?.type,
        relatedId: related?.id,
        status: "SKIPPED",
        failureReason: "Customer has not connected/authorized Messenger.",
      },
    });
    return;
  }

  if (!settings.messengerPageId || !settings.messengerPageAccessTokenEnc) {
    await prisma.messengerLog.create({
      data: {
        customerId,
        message: text,
        eventType,
        relatedType: related?.type,
        relatedId: related?.id,
        status: "SKIPPED",
        failureReason: "Messenger Page is not configured yet.",
      },
    });
    return;
  }

  const log = await prisma.messengerLog.create({
    data: { customerId, message: text, eventType, relatedType: related?.type, relatedId: related?.id, status: "QUEUED" },
  });

  await prisma.messengerLog.update({ where: { id: log.id }, data: { status: "SENDING" } });
  try {
    const pageAccessToken = decryptSecret(settings.messengerPageAccessTokenEnc);
    await callSendAPI(pageAccessToken, connection.psid, text);
    await prisma.messengerLog.update({ where: { id: log.id }, data: { status: "SENT", sentAt: new Date() } });
  } catch (e) {
    await prisma.messengerLog.update({
      where: { id: log.id },
      data: { status: "FAILED", failureReason: e instanceof Error ? e.message : "Unknown error." },
    });
  }
}

/** Called by the webhook route once a customer taps through the opt-in link and messages the Page — matches the PSID to the pending MessengerConnection by its ref code. */
export async function handleMessengerOptin(psid: string, optinRef: string): Promise<boolean> {
  const connection = await prisma.messengerConnection.findUnique({ where: { optinRef } });
  if (!connection) return false;
  await prisma.messengerConnection.update({
    where: { id: connection.id },
    data: { psid, connected: true, connectedAt: new Date() },
  });
  return true;
}

export async function sendTestMessengerMessage(customerId: string): Promise<{ ok: boolean; error?: string }> {
  const settings = await getBusinessSettings();
  if (!settings.messengerPageId || !settings.messengerPageAccessTokenEnc) {
    return { ok: false, error: "Messenger Page ID and Page Access Token must be set first." };
  }
  const connection = await prisma.messengerConnection.findUnique({ where: { customerId } });
  if (!connection?.connected || !connection.psid) {
    return { ok: false, error: "This customer has not connected Messenger yet." };
  }
  try {
    const pageAccessToken = decryptSecret(settings.messengerPageAccessTokenEnc);
    await callSendAPI(pageAccessToken, connection.psid, "This is a test message from your business management system's Messenger Settings.");
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Unknown error." };
  }
}
