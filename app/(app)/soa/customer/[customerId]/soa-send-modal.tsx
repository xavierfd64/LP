"use client";

import { useState, type ComponentType } from "react";
import { useRouter } from "next/navigation";
import { Select, Input, Label, Textarea } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Alert } from "@/components/ui/alert";
import { generateStatementForRangeAction, sendStatementEmailAction } from "@/app/actions/soa";
import { SOA_DATE_RANGE_OPTIONS, type SoaDateRangeValue } from "./soa-filters";
import { resolveClientPeriod } from "./resolve-client-period";

/**
 * "Send SOA to Customer" Quick Action (SOA UI/UX improvement, Sept 3) —
 * generates the statement for the chosen range (generateStatementForRangeAction)
 * then emails it via the existing sendStatementEmailAction/notifyCustomer
 * pipeline, exactly like SendSoaButton on /soa/view/[id]. "Send To" is
 * read-only, not a free-text address: notifyCustomer only ever delivers to
 * THIS customer's own registered account/email — there is no
 * send-to-any-address capability in the existing system, and inventing one
 * here would be a new, unreviewed way to route financial data off-platform.
 */
export function SoaSendModal({
  customerId,
  customerEmail,
  hasLogin,
  buttonIcon: ButtonIcon,
  initialRange,
  initialFrom,
  initialTo,
}: {
  customerId: string;
  customerEmail: string | null;
  hasLogin: boolean;
  buttonIcon?: ComponentType<{ className?: string }>;
  initialRange: SoaDateRangeValue;
  initialFrom: string;
  initialTo: string;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [range, setRange] = useState<SoaDateRangeValue>(initialRange);
  const [from, setFrom] = useState(initialFrom);
  const [to, setTo] = useState(initialTo);
  const [note, setNote] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);

  const canDeliver = hasLogin || !!customerEmail;
  const destination = hasLogin && customerEmail ? `${customerEmail} + in-app notification` : hasLogin ? "In-app notification only (no email on file)" : customerEmail ?? "No email on file";

  async function handleSend() {
    setError(null);
    const { start, end } = resolveClientPeriod(range, from, to);
    if (end <= start) {
      setError("The end date must be after the start date.");
      return;
    }
    setLoading(true);
    try {
      const { statementId } = await generateStatementForRangeAction(customerId, start.toISOString(), end.toISOString());
      await sendStatementEmailAction(statementId, note.trim() || undefined);
      setSent(true);
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to send the statement.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <>
      <Button type="button" variant="outline" className="w-full justify-start" onClick={() => setOpen(true)}>
        {ButtonIcon && <ButtonIcon className="h-4 w-4" />} Send SOA to Customer
      </Button>

      {open && (
        <div className="fixed inset-x-0 top-0 h-[100dvh] z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="flex max-h-[90dvh] w-full max-w-md flex-col rounded-lg bg-white shadow-xl">
            <div className="flex items-center justify-between border-b border-slate-100 px-5 py-4">
              <div>
                <h2 className="text-sm font-semibold text-slate-900">Send SOA to Customer</h2>
                <p className="text-xs text-slate-500">Send the Statement of Account to the customer.</p>
              </div>
              <button
                type="button"
                onClick={() => {
                  setOpen(false);
                  setSent(false);
                }}
                className="text-slate-400 hover:text-slate-700"
                aria-label="Close"
              >
                ✕
              </button>
            </div>
            <div className="space-y-4 px-5 py-4">
              {error && <Alert tone="error">{error}</Alert>}
              {sent && <Alert tone="success">Queued — check the Email Log for delivery status.</Alert>}
              {!canDeliver && <Alert tone="warning">This customer has no login account or email on file — there is nowhere to send this.</Alert>}

              <div>
                <Label htmlFor="sendRange">Date Range</Label>
                <Select id="sendRange" value={range} onChange={(e) => setRange(e.target.value as SoaDateRangeValue)}>
                  {SOA_DATE_RANGE_OPTIONS.map((o) => (
                    <option key={o.value} value={o.value}>
                      {o.label}
                    </option>
                  ))}
                </Select>
              </div>
              {range === "custom" && (
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <Label htmlFor="sendFrom">From</Label>
                    <Input id="sendFrom" type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
                  </div>
                  <div>
                    <Label htmlFor="sendTo">To</Label>
                    <Input id="sendTo" type="date" value={to} onChange={(e) => setTo(e.target.value)} />
                  </div>
                </div>
              )}
              <div>
                <Label htmlFor="sendDestination">Send To</Label>
                <Input id="sendDestination" value={destination} disabled readOnly />
              </div>
              <div>
                <Label htmlFor="sendNote">Message (Optional)</Label>
                <Textarea id="sendNote" value={note} onChange={(e) => setNote(e.target.value)} rows={2} maxLength={300} />
              </div>
            </div>
            <div className="flex flex-wrap items-center justify-end gap-2 border-t border-slate-100 px-5 py-3">
              <Button type="button" variant="outline" onClick={() => setOpen(false)}>
                Cancel
              </Button>
              <Button type="button" onClick={handleSend} disabled={loading || !canDeliver}>
                {loading ? "Sending…" : "Send SOA"}
              </Button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
