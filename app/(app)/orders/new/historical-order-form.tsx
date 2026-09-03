"use client";

import { useActionState, useState } from "react";
import { CalendarClock, CheckCircle2 } from "lucide-react";
import { encodeHistoricalOrderAction } from "@/app/actions/orders";
import { Button } from "@/components/ui/button";
import { Input, Label, Textarea, Select } from "@/components/ui/input";
import { Alert } from "@/components/ui/alert";
import { CustomerPicker } from "@/components/customers/customer-picker";
import type { CustomerSearchResult } from "@/app/actions/customers";
import { FormSectionCard } from "@/components/documents/form-section-card";
import { LineItemsEditor, lineItemAmount, emptyLineItem, type LineItem } from "../../quotations/line-items-editor";
import { TotalsPanel } from "@/components/documents/editor-shell";
import { formatCurrency, cn } from "@/lib/utils";
import { computeTotals, type DiscountType } from "@/lib/pricing-totals";

type HistoricalOrderType = "PENDING_PRODUCTION" | "ALREADY_RELEASED";

const today = () => new Date().toISOString().slice(0, 10);

/**
 * Encode Old Order (Historical Transaction Encoding, Sept 3) — a controlled
 * path distinct from the normal New Order form (order-form.tsx), reusing
 * the exact same building blocks (CustomerPicker, FormSectionCard,
 * LineItemsEditor, computeTotals) rather than a parallel implementation.
 * "Select Type" is the one genuinely new concept: it decides whether the
 * resulting order still needs production (PENDING_PRODUCTION) or was
 * already completed before being entered (ALREADY_RELEASED) — see
 * encodeHistoricalOrderAction and HistoricalOrderType's schema doc comment.
 */
export function HistoricalOrderForm({ onCancel }: { onCancel?: () => void }) {
  const [error, formAction, pending] = useActionState(encodeHistoricalOrderAction, undefined);
  const [type, setType] = useState<HistoricalOrderType | null>(null);

  const [customer, setCustomer] = useState<CustomerSearchResult | null>(null);
  const [orderDate, setOrderDate] = useState(today());
  const [releaseDate, setReleaseDate] = useState(today());

  const [items, setItems] = useState<LineItem[]>([{ ...emptyLineItem }]);
  const [discountType, setDiscountType] = useState<DiscountType>("PERCENTAGE");
  const [discountValue, setDiscountValue] = useState(0);
  const [taxPct, setTaxPct] = useState(0);

  const [termType, setTermType] = useState<"STANDARD_PARTIAL" | "APPROVED_TERMS">("STANDARD_PARTIAL");

  const subtotal = items.reduce((sum, li) => sum + lineItemAmount(li), 0);
  const totals = computeTotals({ subtotal, discountType, discountValue, taxPct });

  return (
    <form action={formAction} className="space-y-5">
      {error && <Alert tone="error">{error}</Alert>}
      <input type="hidden" name="customerId" value={customer?.id ?? ""} />
      <input type="hidden" name="orderDate" value={orderDate} />
      <input type="hidden" name="historicalOrderType" value={type ?? ""} />
      {type === "ALREADY_RELEASED" && <input type="hidden" name="releaseDate" value={releaseDate} />}
      <input type="hidden" name="subtotal" value={subtotal} />
      <input type="hidden" name="discountType" value={discountType} />
      <input type="hidden" name="discountValue" value={discountValue} />
      <input type="hidden" name="taxPct" value={taxPct} />

      <FormSectionCard number={1} title="Select Type" tone="purple">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <button
            type="button"
            onClick={() => setType("PENDING_PRODUCTION")}
            className={cn(
              "flex flex-col items-start gap-2 rounded-xl border-2 p-4 text-left transition-colors",
              type === "PENDING_PRODUCTION" ? "border-brand-600 bg-brand-50" : "border-slate-200 hover:border-slate-300"
            )}
          >
            <CalendarClock className="h-6 w-6 text-brand-600" />
            <span className="font-semibold text-slate-900">Still to be Produced</span>
            <span className="text-xs text-slate-500">
              This order happened in the past but the work still needs to go through production.
            </span>
          </button>
          <button
            type="button"
            onClick={() => setType("ALREADY_RELEASED")}
            className={cn(
              "flex flex-col items-start gap-2 rounded-xl border-2 p-4 text-left transition-colors",
              type === "ALREADY_RELEASED" ? "border-brand-600 bg-brand-50" : "border-slate-200 hover:border-slate-300"
            )}
          >
            <CheckCircle2 className="h-6 w-6 text-brand-600" />
            <span className="font-semibold text-slate-900">Already Released</span>
            <span className="text-xs text-slate-500">
              This order was already produced and released before being entered into the system.
            </span>
          </button>
        </div>
      </FormSectionCard>

      {type && (
        <>
          <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
            <FormSectionCard number={2} title="Customer Information" tone="purple">
              <CustomerPicker name="_customerDisplay" required={false} initialCustomer={customer} onSelect={setCustomer} />
            </FormSectionCard>

            <FormSectionCard number={3} title="Order Information" tone="blue">
              <div className="space-y-3">
                <div>
                  <Label htmlFor="historicalOrderDate">Actual Order Date</Label>
                  <Input
                    id="historicalOrderDate"
                    type="date"
                    required
                    max={today()}
                    value={orderDate}
                    onChange={(e) => setOrderDate(e.target.value)}
                  />
                </div>
                {type === "ALREADY_RELEASED" && (
                  <div>
                    <Label htmlFor="historicalReleaseDate">Actual Release Date</Label>
                    <Input
                      id="historicalReleaseDate"
                      type="date"
                      required
                      min={orderDate}
                      max={today()}
                      value={releaseDate}
                      onChange={(e) => setReleaseDate(e.target.value)}
                    />
                  </div>
                )}
              </div>
            </FormSectionCard>
          </div>

          <FormSectionCard number={4} title="Services / Line Items" tone="purple">
            <LineItemsEditor items={items} onChange={setItems} />
            <TotalsPanel
              rows={[
                { label: "Subtotal", value: formatCurrency(subtotal) },
                ...(totals.discountAmount > 0 ? [{ label: totals.discountLabel ?? "Discount", value: formatCurrency(totals.discountAmount), negative: true }] : []),
                ...(totals.taxAmount > 0 ? [{ label: `Tax / VAT (${taxPct}%)`, value: formatCurrency(totals.taxAmount) }] : []),
              ]}
              total={{ label: "Grand Total", value: formatCurrency(totals.total) }}
            />
            <div className="ml-auto grid w-full grid-cols-2 gap-3 sm:w-80">
              <div>
                <Label htmlFor="discountTypeHistorical">Discount Type</Label>
                <Select id="discountTypeHistorical" value={discountType} onChange={(e) => setDiscountType(e.target.value as DiscountType)}>
                  <option value="PERCENTAGE">Percentage</option>
                  <option value="FIXED">Fixed Amount</option>
                </Select>
              </div>
              <div>
                <Label htmlFor="discountValueHistorical">{discountType === "FIXED" ? "Discount (₱)" : "Discount (%)"}</Label>
                <Input
                  id="discountValueHistorical"
                  type="number"
                  min={0}
                  max={discountType === "PERCENTAGE" ? 100 : undefined}
                  step="0.01"
                  value={discountValue}
                  onChange={(e) => setDiscountValue(Number(e.target.value))}
                />
                {discountType === "FIXED" && discountValue > subtotal && subtotal > 0 && (
                  <p className="mt-1 text-xs text-amber-600">Capped to the subtotal ({formatCurrency(subtotal)}).</p>
                )}
              </div>
              <div className="col-span-2">
                <Label htmlFor="taxPctHistorical">Tax / VAT (%)</Label>
                <Input id="taxPctHistorical" type="number" min={0} max={100} step="0.01" value={taxPct} onChange={(e) => setTaxPct(Number(e.target.value))} />
              </div>
            </div>
          </FormSectionCard>

          <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
            <FormSectionCard number={5} title="Payment Terms" tone="orange">
              <div className="space-y-3">
                <div>
                  <Label htmlFor="historicalPaymentTermType">Payment Terms</Label>
                  <Select
                    id="historicalPaymentTermType"
                    name="paymentTermType"
                    value={termType}
                    onChange={(e) => setTermType(e.target.value as "STANDARD_PARTIAL" | "APPROVED_TERMS")}
                  >
                    <option value="STANDARD_PARTIAL">Standard — requires partial payment</option>
                    <option value="APPROVED_TERMS">Approved Terms — qualified client exception</option>
                  </Select>
                </div>
                {termType === "STANDARD_PARTIAL" && (
                  <div>
                    <Label htmlFor="historicalRequiredPartialPct">Required Partial Payment (%)</Label>
                    <Input id="historicalRequiredPartialPct" name="requiredPartialPct" type="number" min={0} max={100} defaultValue={50} />
                  </div>
                )}
                {termType === "APPROVED_TERMS" && (
                  <>
                    <div>
                      <Label htmlFor="historicalTermsApprovedBy">Authorized By</Label>
                      <Input id="historicalTermsApprovedBy" name="termsApprovedBy" required placeholder="Name of approving manager" />
                    </div>
                    <div>
                      <Label htmlFor="historicalTermsReason">Reason</Label>
                      <Textarea id="historicalTermsReason" name="termsReason" rows={2} placeholder="Why this client qualifies for terms" />
                    </div>
                  </>
                )}
              </div>
            </FormSectionCard>

            <FormSectionCard number={6} title="Additional Information" tone="green">
              <Label htmlFor="historicalNotes">Notes</Label>
              <Textarea
                id="historicalNotes"
                name="historicalNotes"
                rows={5}
                maxLength={1000}
                placeholder="Why this order is being encoded historically — e.g. system downtime, manual processing..."
              />
            </FormSectionCard>
          </div>

          <Alert tone={type === "ALREADY_RELEASED" ? "success" : "info"}>
            {type === "ALREADY_RELEASED"
              ? "This order will be marked as Completed/Released immediately. It will not go to production and will be available for payment monitoring and SOA only."
              : "This order will go through the normal production workflow after saving."}
          </Alert>

          <div className="flex flex-col gap-2 sm:flex-row">
            <Button type="submit" size="lg" disabled={pending || !customer || subtotal <= 0}>
              {pending ? "Saving..." : "Save Historical Order"}
            </Button>
            {onCancel && (
              <Button type="button" variant="outline" size="lg" className="w-full sm:w-auto" onClick={onCancel}>
                Cancel
              </Button>
            )}
          </div>
        </>
      )}
    </form>
  );
}
