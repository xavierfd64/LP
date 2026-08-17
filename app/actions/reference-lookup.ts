"use server";

import { prisma } from "@/lib/prisma";
import { ORDER_TRACKING_INCLUDE } from "@/lib/order-tracking";
import { buildPublicSnapshot, type PublicOrderTracking } from "./public-tracking";

export type ReferenceLookupResult =
  | { ok: true; data: PublicOrderTracking }
  | { ok: false; reason: "not_found" }
  | { ok: false; reason: "quotation_pending"; quoteNumber: string; status: string };

const ATTEMPT_LIMIT = 10;
const ATTEMPT_WINDOW_MS = 15 * 60 * 1000;

type AttemptStore = Map<string, { count: number; resetAt: number }>;
function attemptStore(): AttemptStore {
  const g = globalThis as unknown as { __refLookupAttempts?: AttemptStore };
  if (!g.__refLookupAttempts) g.__refLookupAttempts = new Map();
  return g.__refLookupAttempts;
}

/** Best-effort per-reference throttle (in-memory — resets on redeploy, same
 * pragmatic tradeoff as the rest of this stack's debounce/sweep patterns).
 * Caps brute-force guessing of the contact second-factor for a known/guessed
 * reference number. */
function rateLimited(key: string): boolean {
  const store = attemptStore();
  const now = Date.now();
  const entry = store.get(key);
  if (!entry || entry.resetAt < now) {
    store.set(key, { count: 1, resetAt: now + ATTEMPT_WINDOW_MS });
    return false;
  }
  entry.count += 1;
  return entry.count > ATTEMPT_LIMIT;
}

function contactMatches(customer: { email: string | null; contactNumber: string | null }, input: string): boolean {
  const norm = input.trim().toLowerCase();
  if (!norm) return false;
  if (customer.email && customer.email.toLowerCase() === norm) return true;
  const inputDigits = norm.replace(/\D/g, "");
  const customerDigits = (customer.contactNumber ?? "").replace(/\D/g, "");
  if (inputDigits.length >= 7 && customerDigits.length >= 7) {
    return inputDigits.slice(-10) === customerDigits.slice(-10);
  }
  return false;
}

/**
 * Public, unauthenticated "track by reference number" — the homepage entry
 * point for customers with no login (spec: "especially important for
 * customers who were created by Admin/Staff but do not have login
 * credentials"). Unlike the token-based /track/[token] link (where the
 * token itself is the authorization), a bare reference number like
 * ORD-2026-0007 is short and guessable, so this also requires the
 * customer's own email or phone on file as a second factor — and every
 * failure path returns the same generic result, so a wrong reference,
 * a wrong contact, and a rate-limited attempt are indistinguishable from
 * the outside.
 */
export async function lookupTrackingByReferenceAction(rawReference: string, rawContact: string): Promise<ReferenceLookupResult> {
  const reference = rawReference.trim().toUpperCase();
  const contact = rawContact.trim();
  if (!reference || !contact) return { ok: false, reason: "not_found" };
  if (rateLimited(reference)) return { ok: false, reason: "not_found" };

  const [byOrder, byQuotation, byJobOrders] = await Promise.all([
    prisma.order.findFirst({ where: { orderNumber: { equals: reference, mode: "insensitive" } } }),
    prisma.quotation.findFirst({
      where: { quoteNumber: { equals: reference, mode: "insensitive" } },
      include: { customer: true, orders: { select: { id: true } } },
    }),
    prisma.jobOrder.findMany({ where: { joNumber: { equals: reference, mode: "insensitive" } }, select: { orderId: true } }),
  ]);

  const candidateOrderIds = new Set<string>();
  if (byOrder) candidateOrderIds.add(byOrder.id);
  byQuotation?.orders.forEach((o) => candidateOrderIds.add(o.id));
  byJobOrders.forEach((jo) => candidateOrderIds.add(jo.orderId));

  const matches: PublicOrderTracking[] = [];
  for (const orderId of candidateOrderIds) {
    const order = await prisma.order.findUnique({ where: { id: orderId }, include: ORDER_TRACKING_INCLUDE });
    if (order && contactMatches(order.customer, contact)) {
      matches.push(await buildPublicSnapshot(order));
    }
  }

  // Exactly one verified match — anything else (zero, or an unresolvable
  // ambiguity) fails closed rather than guessing which order was meant.
  if (matches.length === 1) return { ok: true, data: matches[0] };
  if (matches.length > 1) return { ok: false, reason: "not_found" };

  // The reference matched a Quotation that has no Order yet — still a
  // legitimate, customer-safe status to show, just without production/
  // delivery detail (spec: "Quotation Number -> quotation/approval/payment
  // status ... The system should intelligently resolve the reference").
  if (byQuotation && contactMatches(byQuotation.customer, contact)) {
    return { ok: false, reason: "quotation_pending", quoteNumber: byQuotation.quoteNumber, status: byQuotation.status };
  }

  return { ok: false, reason: "not_found" };
}
