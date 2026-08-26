import { prisma } from "@/lib/prisma";

/**
 * Unified document identity (3rd Update item 5): Quotation, Order, and the
 * Invoice print view of an Order all share one "transaction identity" —
 * the same YYYY-MMDD-#### digits, only the prefix changes
 * (QUO-2026-0826-0001 -> ORD-2026-0826-0001 -> INV-2026-0826-0001). The
 * numeric part is a single global sequence (document_number_seq, a real
 * Postgres SEQUENCE — see the 20260826120000 migration) shared by every
 * document type and every concurrent request: `nextval()` is atomic at the
 * database level, so two staff creating a Quotation and an Order-with-no-
 * quotation at the same instant can never be handed the same number,
 * unlike the old per-table `count()`-then-format approach this replaced.
 * The date embedded in the number is when that identity was first minted,
 * not "today" — an Order derived from a Quotation keeps the Quotation's
 * original date+sequence digits (see deriveDocumentNumber), it doesn't
 * redraw a new one.
 */
async function nextGlobalSequence(): Promise<number> {
  const rows = await prisma.$queryRaw<{ n: bigint }[]>`SELECT nextval('document_number_seq') AS n`;
  return Number(rows[0].n);
}

function formatDocumentNumber(prefix: string, date: Date, seq: number): string {
  const yyyy = date.getFullYear();
  const mmdd = `${String(date.getMonth() + 1).padStart(2, "0")}${String(date.getDate()).padStart(2, "0")}`;
  return `${prefix}-${yyyy}-${mmdd}-${String(seq).padStart(4, "0")}`;
}

/** Mints a brand-new transaction identity — for a Quotation, or for an Order created with no prior Quotation to inherit from. */
export async function nextTransactionNumber(prefix: "QUO" | "ORD"): Promise<string> {
  const seq = await nextGlobalSequence();
  return formatDocumentNumber(prefix, new Date(), seq);
}

/**
 * Swaps a transaction identity's prefix while keeping its date+sequence
 * digits — Order-from-Quotation, and the Invoice print view's number
 * (which is never stored; derived from the Order's orderNumber at render
 * time, since this app has no separate persisted Invoice entity).
 */
export function deriveDocumentNumber(sourceNumber: string, newPrefix: string): string {
  const parts = sourceNumber.split("-");
  parts[0] = newPrefix;
  return parts.join("-");
}

/** New Order: reuses the linked Quotation's identity if there is one, otherwise mints a fresh one. */
export async function nextOrderNumber(sourceQuoteNumber?: string | null): Promise<string> {
  if (sourceQuoteNumber) return deriveDocumentNumber(sourceQuoteNumber, "ORD");
  return nextTransactionNumber("ORD");
}

export async function nextQuoteNumber(): Promise<string> {
  return nextTransactionNumber("QUO");
}

/**
 * A Job Order retains its parent Order's transaction identity rather than
 * a separate JO-001-style sequence (3rd Update item 6) — the common case
 * (one job order per order) gets exactly the order's number; a second or
 * later job order under the same order gets a "-2", "-3", ... suffix so
 * orderId+joNumber stays unique (the schema's real constraint) and each
 * job order is still individually referenceable in search/print/QC/
 * tracking, without inventing an unrelated identity.
 */
export async function nextJoNumber(orderId: string): Promise<string> {
  const order = await prisma.order.findUniqueOrThrow({ where: { id: orderId }, select: { orderNumber: true } });
  const count = await prisma.jobOrder.count({ where: { orderId } });
  return count === 0 ? order.orderNumber : `${order.orderNumber}-${count + 1}`;
}

/** Human-readable Customer ID shown throughout the UI (search results, quick-add confirmation, documents) — distinct from the internal cuid `Customer.id`, which is never surfaced to users. */
export async function nextCustomerDisplayId(): Promise<string> {
  const count = await prisma.customer.count();
  const seq = String(count + 1).padStart(6, "0");
  return `CUST-${seq}`;
}

export async function nextExpenseNumber(): Promise<string> {
  const year = new Date().getFullYear();
  const count = await prisma.operatingExpense.count({
    where: { expenseNumber: { startsWith: `EXP-${year}-` } },
  });
  const seq = String(count + 1).padStart(4, "0");
  return `EXP-${year}-${seq}`;
}

function shortCode(name: string): string {
  const cleaned = name.replace(/[^A-Za-z0-9]/g, "").toUpperCase();
  return cleaned.slice(0, 3) || "ITM";
}

export async function nextLotCode(
  itemSku: string,
  itemName: string
): Promise<string> {
  const now = new Date();
  const yyyymm = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, "0")}`;
  const code = shortCode(itemSku || itemName);
  const prefix = `${code}-${yyyymm}-`;
  const count = await prisma.supplyLot.count({
    where: { lotCode: { startsWith: prefix } },
  });
  const seq = String(count + 1).padStart(3, "0");
  return `${prefix}${seq}`;
}

/** SOA-2026-08-0001-style — sequential within the statement's ending month. */
export async function nextStatementNumber(periodEnd: Date): Promise<string> {
  const y = periodEnd.getFullYear();
  const m = String(periodEnd.getMonth() + 1).padStart(2, "0");
  const prefix = `SOA-${y}-${m}-`;
  const count = await prisma.statementOfAccount.count({ where: { statementNumber: { startsWith: prefix } } });
  return `${prefix}${String(count + 1).padStart(4, "0")}`;
}

export async function nextVoucherCode(): Promise<string> {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; // no ambiguous chars (0/O, 1/I)
  for (let attempt = 0; attempt < 5; attempt++) {
    let suffix = "";
    for (let i = 0; i < 8; i++) suffix += chars[Math.floor(Math.random() * chars.length)];
    const code = `VCH-${suffix}`;
    const existing = await prisma.voucher.findUnique({ where: { code } });
    if (!existing) return code;
  }
  throw new Error("Could not generate a unique voucher code.");
}
