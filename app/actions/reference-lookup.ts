"use server";

import { prisma } from "@/lib/prisma";
import { ORDER_TRACKING_INCLUDE } from "@/lib/order-tracking";
import { isRateLimited, clientIp } from "@/lib/rate-limit";
import { buildPublicSnapshot, type PublicOrderTracking } from "./public-tracking";

export type ReferenceLookupResult =
  | { ok: true; data: PublicOrderTracking }
  | { ok: false; reason: "not_found" }
  | { ok: false; reason: "quotation_pending"; quoteNumber: string; status: string };

// Reference-keyed: caps brute-forcing the contact second-factor for one
// known/guessed reference number.
const REFERENCE_ATTEMPT_LIMIT = 10;
const REFERENCE_ATTEMPT_WINDOW_MS = 15 * 60 * 1000;
// IP-keyed: the reference-keyed limit above resets fresh for every new
// reference guessed, so on its own it does nothing to stop someone who
// already knows a target's contact info from scanning through this app's
// now-sequential, low-entropy reference numbers (YYYY-MMDD-#### — see
// lib/numbering.ts) looking for the one that matches. This caps that
// scan regardless of how many different references it tries.
const IP_ATTEMPT_LIMIT = 20;
const IP_ATTEMPT_WINDOW_MS = 15 * 60 * 1000;

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

  const ip = await clientIp();
  // Both checks always run (never short-circuited past each other) so attempt
  // counts stay accurate regardless of which one is already tripped — same
  // pattern as the login/reset-request limiters in app/actions/auth.ts and
  // password-reset.ts. The response is identical either way.
  const referenceLimited = isRateLimited("reference-lookup", reference, REFERENCE_ATTEMPT_LIMIT, REFERENCE_ATTEMPT_WINDOW_MS);
  const ipLimited = isRateLimited("reference-lookup-ip", ip, IP_ATTEMPT_LIMIT, IP_ATTEMPT_WINDOW_MS);
  if (referenceLimited || ipLimited) return { ok: false, reason: "not_found" };

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
