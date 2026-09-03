/**
 * Client-side mirror of the date-boundary math page.tsx already resolves
 * server-side via lib/transaction-summary.ts's resolvePeriodRange —
 * duplicated here (not imported) because that module pulls in Prisma,
 * which a "use client" component can't bundle. This is pure calendar
 * arithmetic (what dates a preset name means), never the financial
 * calculation itself — every number still comes from
 * computeStatementOfAccount() via a server action. See soa-filters.tsx
 * for the same preset values used by the page's own filter bar.
 */
export function resolveClientPeriod(range: string, from: string, to: string): { start: Date; end: Date } {
  const now = new Date();
  if (range === "custom" && from && to) {
    const start = new Date(from + "T00:00:00");
    const endInclusive = new Date(to + "T00:00:00");
    const end = new Date(endInclusive.getFullYear(), endInclusive.getMonth(), endInclusive.getDate() + 1);
    return { start, end };
  }
  if (range === "monthly") {
    return { start: new Date(now.getFullYear(), now.getMonth(), 1), end: new Date(now.getFullYear(), now.getMonth() + 1, 1) };
  }
  if (range === "quarterly") {
    const q = Math.floor(now.getMonth() / 3);
    return { start: new Date(now.getFullYear(), q * 3, 1), end: new Date(now.getFullYear(), q * 3 + 3, 1) };
  }
  if (range === "annual") {
    return { start: new Date(now.getFullYear(), 0, 1), end: new Date(now.getFullYear() + 1, 0, 1) };
  }
  // "all" (or an incomplete custom selection)
  return { start: new Date(0), end: now };
}
