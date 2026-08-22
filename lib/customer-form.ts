import { prisma } from "@/lib/prisma";
import { generateSecureToken } from "@/lib/order-tracking";
import { getBusinessSettings } from "@/lib/business-settings";
import { sendEmailEvent } from "@/lib/email";
import { sendMessengerEvent } from "@/lib/messenger";
import { logAudit } from "@/lib/audit";

/** Absolute, server-buildable URL to the public Customer Form page — same NEXTAUTH_URL fallback pattern already used by every other outbound link in this app (lib/notifications.ts, password-reset.ts, messenger-dispatch.ts). */
export function formLinkUrl(token: string): string {
  const base = process.env.NEXTAUTH_URL || "http://localhost:3000";
  return `${base}/form/${token}`;
}

export async function findActiveFormLink(formId: string) {
  return prisma.customerFormLink.findFirst({
    where: { formId, revokedAt: null },
    orderBy: { createdAt: "desc" },
  });
}

const FORM_INCLUDE = {
  jobOrder: { include: { order: { include: { customer: true } }, service: true } },
  customer: true,
  items: { orderBy: { sortOrder: "asc" as const } },
  additionalOrders: { include: { order: true, addedBy: true } },
} as const;

export type CustomerFormWithRelations = NonNullable<Awaited<ReturnType<typeof loadFormById>>>;

export function loadFormById(id: string) {
  return prisma.customerForm.findUnique({ where: { id }, include: FORM_INCLUDE });
}

export type PublicFormResult =
  | { ok: false; reason: "not_found" | "revoked" | "expired" }
  | { ok: true; form: CustomerFormWithRelations };

/**
 * Token-authorized, mutation-capable form lookup for the public Customer
 * Form page — the one net-new "customer submits data" shape in this app's
 * otherwise read-only public-link infrastructure (see lib/public-document.ts
 * / app/actions/public-tracking.ts, which this mirrors for the resolve
 * step). Records the first-ever open as a history event at the call site,
 * not here, so this stays a pure lookup.
 */
export async function resolvePublicCustomerForm(token: string): Promise<PublicFormResult> {
  const link = await prisma.customerFormLink.findUnique({ where: { token } });
  if (!link) return { ok: false, reason: "not_found" };
  if (link.revokedAt) return { ok: false, reason: "revoked" };
  if (link.expiresAt && link.expiresAt.getTime() < Date.now()) return { ok: false, reason: "expired" };

  const isFirstOpen = link.viewCount === 0;
  await prisma.customerFormLink.update({
    where: { id: link.id },
    data: { viewCount: { increment: 1 }, lastViewedAt: new Date() },
  });
  if (isFirstOpen) {
    await logAudit(null, "FORM_ACCESSED", "CustomerForm", link.formId, {});
  }

  const form = await loadFormById(link.formId);
  if (!form) return { ok: false, reason: "not_found" };
  return { ok: true, form };
}

type DeliveryOutcome = { status: "SENT" | "FAILED" | "PENDING"; detail?: string };

/**
 * Attempts one delivery channel and always records a CustomerFormDelivery
 * row reflecting what actually happened — including "we didn't even try
 * because the channel is disabled," never silently skipping the ledger
 * entry (spec item 8: every delivery attempt must be recorded). Reuses
 * the exact same sendEmailEvent/sendMessengerEvent funnel every other
 * module sends through (never a parallel mailer), then reads back the
 * EmailLog/MessengerLog row those calls just wrote — both send inline
 * with no background worker, so by the time the call resolves the log
 * row's status is already final.
 */
export async function attemptFormDelivery(
  formId: string,
  method: "EMAIL" | "MESSENGER",
  opts: { customerId: string; customerEmail: string | null; message: string; link: string; deliveredById: string | null }
): Promise<DeliveryOutcome> {
  const settings = await getBusinessSettings();
  const recipient = method === "EMAIL" ? (opts.customerEmail ?? "") : opts.customerId;

  if (method === "EMAIL") {
    if (!settings.emailEnabled) return recordAndReturn(formId, method, recipient, opts.deliveredById, { status: "FAILED", detail: "Email is disabled in Business Settings." });
    if (!opts.customerEmail) return recordAndReturn(formId, method, recipient, opts.deliveredById, { status: "FAILED", detail: "Customer has no email on file." });

    await sendEmailEvent("FORM_LINK_SENT", opts.customerEmail, { message: opts.message, form_link: opts.link }, { type: "CustomerForm", id: formId });
    const log = await prisma.emailLog.findFirst({ where: { relatedType: "CustomerForm", relatedId: formId, eventType: "FORM_LINK_SENT" }, orderBy: { createdAt: "desc" } });
    const outcome: DeliveryOutcome = log?.status === "SENT" ? { status: "SENT" } : { status: "FAILED", detail: log?.failureReason ?? "Email send failed." };
    return recordAndReturn(formId, method, opts.customerEmail, opts.deliveredById, outcome);
  }

  if (!settings.messengerEnabled) return recordAndReturn(formId, method, recipient, opts.deliveredById, { status: "FAILED", detail: "Messenger is disabled in Business Settings." });

  await sendMessengerEvent("FORM_LINK_SENT", opts.customerId, { message: opts.message, trackingLink: opts.link }, { type: "CustomerForm", id: formId });
  const log = await prisma.messengerLog.findFirst({ where: { relatedType: "CustomerForm", relatedId: formId, eventType: "FORM_LINK_SENT" }, orderBy: { createdAt: "desc" } });
  const outcome: DeliveryOutcome =
    log?.status === "SENT" ? { status: "SENT" } : { status: "FAILED", detail: log?.failureReason ?? "Messenger send failed." };
  return recordAndReturn(formId, method, recipient, opts.deliveredById, outcome);
}

async function recordAndReturn(
  formId: string,
  method: "EMAIL" | "MESSENGER",
  recipient: string,
  deliveredById: string | null,
  outcome: DeliveryOutcome
): Promise<DeliveryOutcome> {
  await prisma.customerFormDelivery.create({
    data: { formId, method, recipient, deliveredById: deliveredById ?? undefined, status: outcome.status, detail: outcome.detail },
  });
  return outcome;
}

/** Generic per-item form field editor's dynamic columns — reuses the Service.specFields mechanism already used for Inquiry/Quotation line items (e.g. "Size", "Number" for a Jersey service), rather than hardcoding apparel-specific fields into the schema. */
export function formItemSpecFields(specFields: unknown): string[] {
  return Array.isArray(specFields) ? (specFields as string[]) : [];
}
