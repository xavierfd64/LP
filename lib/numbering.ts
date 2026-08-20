import { prisma } from "@/lib/prisma";

export async function nextOrderNumber(): Promise<string> {
  const year = new Date().getFullYear();
  const count = await prisma.order.count({
    where: { orderNumber: { startsWith: `ORD-${year}-` } },
  });
  const seq = String(count + 1).padStart(4, "0");
  return `ORD-${year}-${seq}`;
}

export async function nextJoNumber(orderId: string): Promise<string> {
  const count = await prisma.jobOrder.count({ where: { orderId } });
  const seq = String(count + 1).padStart(3, "0");
  return `JO-${seq}`;
}

/** Human-readable Customer ID shown throughout the UI (search results, quick-add confirmation, documents) — distinct from the internal cuid `Customer.id`, which is never surfaced to users. */
export async function nextCustomerDisplayId(): Promise<string> {
  const count = await prisma.customer.count();
  const seq = String(count + 1).padStart(6, "0");
  return `CUST-${seq}`;
}

export async function nextQuoteNumber(): Promise<string> {
  const year = new Date().getFullYear();
  const count = await prisma.quotation.count({
    where: { quoteNumber: { startsWith: `QUO-${year}-` } },
  });
  const seq = String(count + 1).padStart(4, "0");
  return `QUO-${year}-${seq}`;
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
