"use client";

import { useEffect, useState } from "react";
import { getOrderBalanceAction, type OrderBalanceResult } from "@/app/actions/order-search";
import { Alert } from "@/components/ui/alert";
import { formatCurrency, cn } from "@/lib/utils";

/**
 * Fetches the authoritative order balance (paymentSummary() via
 * getOrderBalanceAction — the exact same confirmed-payment total
 * createPaymentRecord itself checks) for a live Balance Preview panel.
 * Shared by PaymentForm and HistoricalPaymentForm (Sept 9 — "Record
 * Payment" balance-preview improvement) so both forms' preview can never
 * disagree with each other or with the backend — this hook is the only
 * place either form reads an order's balance from.
 */
export function useOrderBalance(orderId: string): OrderBalanceResult | null {
  const [balance, setBalance] = useState<OrderBalanceResult | null>(null);

  useEffect(() => {
    if (!orderId) {
      setBalance(null);
      return;
    }
    let cancelled = false;
    setBalance(null);
    getOrderBalanceAction(orderId).then((result) => {
      if (!cancelled) setBalance(result);
    });
    return () => {
      cancelled = true;
    };
  }, [orderId]);

  return balance;
}

/**
 * Live Order Total / Total Paid (Before) / This Payment / Total Paid
 * (After) / Balance card — the same figures and computation
 * (totalPaidAfter = confirmedPaid + amount; balance = max(total -
 * totalPaidAfter, 0)) already used by HistoricalPaymentForm, extracted so
 * PaymentForm (the normal "Record Payment" form) gets the identical
 * preview instead of a second, possibly-diverging implementation. Before
 * an order is selected, every figure except "This Payment" shows as
 * "—" rather than a misleading 0 — "This Payment" always reflects
 * whatever amount is currently typed, since that much is true regardless
 * of which order it ends up applied to.
 */
export function BalancePreviewPanel({
  orderId,
  amount,
  balance,
  infoText,
}: {
  orderId: string;
  amount: number;
  balance: OrderBalanceResult | null;
  infoText?: string;
}) {
  const orderTotal = balance?.ok ? balance.total : null;
  const totalPaidBefore = balance?.ok ? balance.confirmedPaid : null;
  const totalPaidAfter = totalPaidBefore != null ? totalPaidBefore + (amount || 0) : null;
  const balanceAfter = orderTotal != null && totalPaidAfter != null ? Math.max(orderTotal - totalPaidAfter, 0) : null;

  return (
    <div className="space-y-3 rounded-lg border border-slate-200 bg-slate-50 p-4">
      <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Balance Preview</p>

      {orderId && !balance && <p className="text-sm text-slate-400">Loading…</p>}
      {orderId && balance && !balance.ok && <p className="text-sm text-red-600">{balance.error}</p>}

      {(!orderId || balance?.ok) && (
        <dl className="space-y-1.5 text-sm">
          <Row label="Order Total" value={orderTotal != null ? formatCurrency(orderTotal) : "—"} />
          <Row label="Total Paid (Before)" value={totalPaidBefore != null ? formatCurrency(totalPaidBefore) : "—"} />
          <Row label="This Payment" value={formatCurrency(amount || 0)} />
          <Row label="Total Paid (After)" value={totalPaidAfter != null ? formatCurrency(totalPaidAfter) : "—"} bordered />
          <Row
            label="Balance"
            value={balanceAfter != null ? formatCurrency(balanceAfter) : "—"}
            valueClassName={cn("font-semibold", balanceAfter == null ? "text-slate-900" : balanceAfter > 0 ? "text-yellow-700" : "text-green-700")}
          />
        </dl>
      )}

      {infoText && (
        <Alert tone="info" className="text-xs">
          {infoText}
        </Alert>
      )}
    </div>
  );
}

function Row({ label, value, bordered, valueClassName }: { label: string; value: string; bordered?: boolean; valueClassName?: string }) {
  return (
    <div className={cn("flex justify-between", bordered && "border-t border-slate-200 pt-1.5")}>
      <dt className="text-slate-500">{label}</dt>
      <dd className={valueClassName ?? "font-medium text-slate-900"}>{value}</dd>
    </div>
  );
}
