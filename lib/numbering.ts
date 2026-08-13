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

export async function nextQuoteNumber(): Promise<string> {
  const year = new Date().getFullYear();
  const count = await prisma.quotation.count({
    where: { quoteNumber: { startsWith: `QUO-${year}-` } },
  });
  const seq = String(count + 1).padStart(4, "0");
  return `QUO-${year}-${seq}`;
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
