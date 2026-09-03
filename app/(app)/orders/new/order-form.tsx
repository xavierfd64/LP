"use client";

import { useActionState, useEffect, useState } from "react";
import Link from "next/link";
import { createOrderAction } from "@/app/actions/orders";
import { Button } from "@/components/ui/button";
import { Input, Label, Textarea, Select } from "@/components/ui/input";
import { Alert } from "@/components/ui/alert";
import { CustomerPicker } from "@/components/customers/customer-picker";
import type { CustomerSearchResult } from "@/app/actions/customers";
import { QuotationPicker } from "@/components/quotations/quotation-picker";
import type { QuotationSearchResult } from "@/app/actions/quotation-picker";
import { getQuotationDetailAction } from "@/app/actions/quotation-detail";
import { FormSectionCard } from "@/components/documents/form-section-card";
import { LineItemsEditor, lineItemAmount, emptyLineItem, type LineItem } from "../../quotations/line-items-editor";
import { LineItemsView, type ViewLineItem } from "@/components/documents/line-items-view";
import { TotalsPanel } from "@/components/documents/editor-shell";
import { formatCurrency } from "@/lib/utils";
import { computeTotals, type DiscountType } from "@/lib/pricing-totals";

type Source = "NEW" | "FROM_QUOTATION";

export function OrderForm({
  initialQuotation,
  defaultCustomer,
  initialQuotationLineItems,
  initialQuotationTotals,
  defaultTotal,
  onCancel,
}: {
  initialQuotation?: QuotationSearchResult | null;
  defaultCustomer?: CustomerSearchResult | null;
  initialQuotationLineItems?: ViewLineItem[];
  initialQuotationTotals?: { subtotal: string | null; discountAmount: string; discountLabel: string | null; taxAmount?: string };
  defaultTotal?: number;
  /** When set (e.g. rendered inside a dialogue box), Cancel calls this instead of navigating to /orders. */
  onCancel?: () => void;
}) {
  const [error, formAction, pending] = useActionState(createOrderAction, undefined);
  const [source, setSource] = useState<Source>(initialQuotation ? "FROM_QUOTATION" : "NEW");
  const lockedFromUrl = !!initialQuotation;

  const [pickedQuotation, setPickedQuotation] = useState<QuotationSearchResult | null>(initialQuotation ?? null);
  const [quotationCustomer, setQuotationCustomer] = useState<CustomerSearchResult | null>(defaultCustomer ?? null);
  const [quotationLineItems, setQuotationLineItems] = useState<ViewLineItem[] | undefined>(initialQuotationLineItems);
  const [quotationTotals, setQuotationTotals] = useState<{ subtotal: string | null; discountAmount: string; discountLabel: string | null; taxAmount?: string } | null>(
    initialQuotationTotals ?? null
  );
  const [loadingQuotation, setLoadingQuotation] = useState(false);

  const [manualCustomer, setManualCustomer] = useState<CustomerSearchResult | null>(null);
  const [items, setItems] = useState<LineItem[]>([{ ...emptyLineItem }]);
  const [discountType, setDiscountType] = useState<DiscountType>("PERCENTAGE");
  const [discountValue, setDiscountValue] = useState(0);
  // Tax/VAT correction: was silently defaulting to 12 — new orders now
  // default to 0% like every other pricing form in this app.
  const [taxPct, setTaxPct] = useState(0);

  const [termType, setTermType] = useState<"STANDARD_PARTIAL" | "APPROVED_TERMS">("STANDARD_PARTIAL");

  // When staff picks a quotation from the interactive search (not the
  // ?quotationId= deep-link path), fetch its full detail for the read-only
  // "Imported from Quotation" preview — same permission-checked action the
  // Quotation Details modal already uses.
  useEffect(() => {
    if (!pickedQuotation || lockedFromUrl) return;
    setLoadingQuotation(true);
    getQuotationDetailAction(pickedQuotation.id).then((res) => {
      setLoadingQuotation(false);
      if (!res.ok) return;
      setQuotationCustomer({
        id: pickedQuotation.customerId,
        displayId: "",
        name: res.data.customerName,
        companyName: null,
        email: res.data.customerEmail,
        contactNumber: res.data.customerContact,
        hasLogin: true,
        isQualifiedForTerms: false,
      });
      setQuotationLineItems(res.data.lineItems.map((li) => ({ id: li.id, productType: li.productType, description: li.description, qty: li.qty, unit: li.unit, unitPrice: li.unitPrice })));
      setQuotationTotals({ subtotal: res.data.subtotal, discountAmount: res.data.discountAmount, discountLabel: res.data.discountLabel, taxAmount: res.data.taxAmount });
    });
  }, [pickedQuotation, lockedFromUrl]);

  const manualSubtotal = items.reduce((sum, li) => sum + lineItemAmount(li), 0);
  const manualTotals = computeTotals({ subtotal: manualSubtotal, discountType, discountValue, taxPct });
  const manualDiscountAmount = manualTotals.discountAmount;
  const manualTaxAmount = manualTotals.taxAmount;
  const manualGrandTotal = manualTotals.total;

  const effectiveCustomer = source === "FROM_QUOTATION" ? quotationCustomer : manualCustomer;
  const effectiveTotal = source === "FROM_QUOTATION" ? (pickedQuotation ? Number(pickedQuotation.total) : (defaultTotal ?? 0)) : manualGrandTotal;
  const effectiveQuotationId = source === "FROM_QUOTATION" ? pickedQuotation?.id : undefined;

  return (
    <form action={formAction} className="space-y-5">
      {error && <Alert tone="error">{error}</Alert>}
      <input type="hidden" name="customerId" value={effectiveCustomer?.id ?? ""} />
      {source === "NEW" && (
        <>
          <input type="hidden" name="subtotal" value={manualSubtotal} />
          <input type="hidden" name="discountType" value={discountType} />
          <input type="hidden" name="discountValue" value={discountValue} />
          <input type="hidden" name="taxPct" value={taxPct} />
        </>
      )}
      {effectiveQuotationId && <input type="hidden" name="quotationId" value={effectiveQuotationId} />}

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
        <FormSectionCard number={1} title="Customer Information" tone="purple">
          {source === "FROM_QUOTATION" ? (
            effectiveCustomer ? (
              <div className="rounded-md border border-slate-300 bg-slate-50 px-3 py-2">
                <p className="text-sm font-medium text-slate-900">
                  {effectiveCustomer.name}
                  {effectiveCustomer.companyName ? ` (${effectiveCustomer.companyName})` : ""}
                </p>
                <p className="text-xs text-slate-500">Locked from the source quotation</p>
              </div>
            ) : (
              <p className="text-sm text-slate-400">Select a quotation to load its customer.</p>
            )
          ) : (
            <CustomerPicker name="_customerDisplay" required={false} initialCustomer={manualCustomer} onSelect={setManualCustomer} />
          )}
        </FormSectionCard>

        <FormSectionCard number={2} title="Order Information" tone="blue">
          <div className="space-y-3">
            <div>
              <Label htmlFor="source">Source</Label>
              <Select
                id="source"
                value={source}
                disabled={lockedFromUrl}
                onChange={(e) => setSource(e.target.value as Source)}
              >
                <option value="NEW">Create New Order</option>
                <option value="FROM_QUOTATION">From Quotation</option>
              </Select>
            </div>
            {source === "FROM_QUOTATION" && !lockedFromUrl && (
              <QuotationPicker name="_quotationDisplay" initialQuotation={pickedQuotation} onSelect={setPickedQuotation} />
            )}
            <div>
              <Label htmlFor="orderDate">Order Date</Label>
              <Input id="orderDate" type="date" disabled defaultValue={new Date().toISOString().slice(0, 10)} />
            </div>
          </div>
        </FormSectionCard>
      </div>

      <FormSectionCard number={3} title="Services / Line Items" tone="purple">
        {source === "FROM_QUOTATION" ? (
          <>
            {loadingQuotation && <p className="text-sm text-slate-400">Loading quotation…</p>}
            {quotationLineItems && quotationLineItems.length > 0 && (
              <>
                <p className="text-xs font-medium uppercase tracking-wide text-slate-400">Imported from Quotation</p>
                <LineItemsView items={quotationLineItems} />
                <TotalsPanel
                  rows={
                    quotationTotals?.subtotal != null
                      ? [
                          { label: "Subtotal", value: formatCurrency(quotationTotals.subtotal) },
                          ...(Number(quotationTotals.discountAmount) > 0
                            ? [{ label: quotationTotals.discountLabel ?? "Discount", value: formatCurrency(quotationTotals.discountAmount), negative: true }]
                            : []),
                          ...(quotationTotals.taxAmount && Number(quotationTotals.taxAmount) > 0
                            ? [{ label: "Tax / VAT", value: formatCurrency(quotationTotals.taxAmount) }]
                            : []),
                        ]
                      : []
                  }
                  total={{ label: "Grand Total", value: formatCurrency(effectiveTotal) }}
                />
              </>
            )}
            {!loadingQuotation && (!quotationLineItems || quotationLineItems.length === 0) && (
              <p className="text-sm text-slate-400">Select an approved quotation above to import its line items.</p>
            )}
          </>
        ) : (
          <>
            <LineItemsEditor items={items} onChange={setItems} />
            <TotalsPanel
              rows={[
                { label: "Subtotal", value: formatCurrency(manualSubtotal) },
                ...(manualDiscountAmount > 0 ? [{ label: manualTotals.discountLabel ?? "Discount", value: formatCurrency(manualDiscountAmount), negative: true }] : []),
                ...(manualTaxAmount > 0 ? [{ label: `Tax / VAT (${taxPct}%)`, value: formatCurrency(manualTaxAmount) }] : []),
              ]}
              total={{ label: "Grand Total", value: formatCurrency(manualGrandTotal) }}
            />
            <div className="ml-auto grid w-full grid-cols-2 gap-3 sm:w-80">
              <div>
                <Label htmlFor="discountTypeOrder">Discount Type</Label>
                <Select
                  id="discountTypeOrder"
                  value={discountType}
                  onChange={(e) => setDiscountType(e.target.value as DiscountType)}
                >
                  <option value="PERCENTAGE">Percentage</option>
                  <option value="FIXED">Fixed Amount</option>
                </Select>
              </div>
              <div>
                <Label htmlFor="discountValueOrder">{discountType === "FIXED" ? "Discount (₱)" : "Discount (%)"}</Label>
                <Input
                  id="discountValueOrder"
                  type="number"
                  min={0}
                  max={discountType === "PERCENTAGE" ? 100 : undefined}
                  step="0.01"
                  value={discountValue}
                  onChange={(e) => setDiscountValue(Number(e.target.value))}
                />
                {discountType === "FIXED" && discountValue > manualSubtotal && manualSubtotal > 0 && (
                  <p className="mt-1 text-xs text-amber-600">Capped to the subtotal ({formatCurrency(manualSubtotal)}).</p>
                )}
              </div>
              <div className="col-span-2">
                <Label htmlFor="taxPctOrder">Tax / VAT (%)</Label>
                <Input id="taxPctOrder" type="number" min={0} max={100} step="0.01" value={taxPct} onChange={(e) => setTaxPct(Number(e.target.value))} />
              </div>
            </div>
          </>
        )}
      </FormSectionCard>

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
        <FormSectionCard number={4} title="Payment Terms" tone="orange">
          <div className="space-y-3">
            <div>
              <Label htmlFor="paymentTermType">Payment Terms</Label>
              <Select
                id="paymentTermType"
                name="paymentTermType"
                value={termType}
                onChange={(e) => setTermType(e.target.value as "STANDARD_PARTIAL" | "APPROVED_TERMS")}
              >
                <option value="STANDARD_PARTIAL">Standard — requires partial payment</option>
                <option value="APPROVED_TERMS">Approved Terms — qualified client exception</option>
              </Select>
            </div>
            <div>
              <Label htmlFor="dueDate">Payment Due Date (optional)</Label>
              <Input id="dueDate" name="dueDate" type="date" />
            </div>
            {termType === "STANDARD_PARTIAL" && (
              <div>
                <Label htmlFor="requiredPartialPct">Required Partial Payment (%)</Label>
                <Input id="requiredPartialPct" name="requiredPartialPct" type="number" min={0} max={100} defaultValue={50} />
              </div>
            )}
            {termType === "APPROVED_TERMS" && (
              <>
                <div>
                  <Label htmlFor="termsApprovedBy">Authorized By</Label>
                  <Input id="termsApprovedBy" name="termsApprovedBy" required placeholder="Name of approving manager" />
                </div>
                <div>
                  <Label htmlFor="termsReason">Reason</Label>
                  <Textarea id="termsReason" name="termsReason" rows={2} placeholder="Why this client qualifies for terms" />
                </div>
              </>
            )}
          </div>
        </FormSectionCard>

        <FormSectionCard number={5} title="Notes / Requirements" tone="green">
          <Textarea id="notes" name="notes" rows={5} maxLength={1000} placeholder="Add notes or special instructions for this order..." />
        </FormSectionCard>
      </div>

      <div className="flex flex-col gap-2 sm:flex-row">
        <Button type="submit" size="lg" disabled={pending || !effectiveCustomer}>
          {pending ? "Creating..." : "Create Order"}
        </Button>
        {onCancel ? (
          <Button type="button" variant="outline" size="lg" className="w-full sm:w-auto" onClick={onCancel}>
            Cancel
          </Button>
        ) : (
          <Link href="/orders">
            <Button type="button" variant="outline" size="lg" className="w-full sm:w-auto">
              Cancel
            </Button>
          </Link>
        )}
      </div>
    </form>
  );
}
