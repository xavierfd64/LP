"use client";

import { useState } from "react";
import Link from "next/link";
import { Loader2 } from "lucide-react";
import { Modal, ModalHeader, ModalBody, ModalFooter } from "@/components/ui/modal";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, THead, TBody, TR, TH, TD, EmptyState } from "@/components/ui/table";
import { Alert } from "@/components/ui/alert";
import { formatCurrency, formatDate, formatDateTime } from "@/lib/utils";
import { getSoaModalDataAction } from "@/app/actions/dashboard";
import { PeriodForm } from "@/app/(app)/soa/customer/[customerId]/period-form";
import { AdjustmentForm } from "@/app/(app)/soa/customer/[customerId]/adjustment-form";
import { ScheduleForm } from "@/app/(app)/soa/customer/[customerId]/schedule-form";

type SoaData = Awaited<ReturnType<typeof getSoaModalDataAction>>;

const STATUS_TONE = { CURRENT: "blue", DUE: "yellow", OVERDUE: "red" } as const;

/**
 * Statement of Account as a dialogue box (Aug 25 update 1) — the
 * Receivables card's SOA button no longer navigates away from the
 * Dashboard. Fetches the exact same data /soa/customer/[customerId] reads
 * (via getSoaModalDataAction) and reuses that page's own PeriodForm/
 * AdjustmentForm/ScheduleForm components verbatim, so every existing SOA
 * capability (generate a statement, add an adjustment, manage the monthly
 * schedule) stays available here — the full page remains reachable too
 * (e.g. "View all" / "View SOA" elsewhere) for a permanent link.
 */
export function SoaModal({ customerId }: { customerId: string }) {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [data, setData] = useState<SoaData | null>(null);

  function handleOpen() {
    setOpen(true);
    setLoading(true);
    setError(null);
    getSoaModalDataAction(customerId)
      .then((res) => setData(res))
      .catch((e) => setError(e instanceof Error ? e.message : "Failed to load statement of account."))
      .finally(() => setLoading(false));
  }

  return (
    <>
      <Button type="button" variant="outline" size="sm" className="h-7 px-2 text-xs" onClick={handleOpen}>
        SOA
      </Button>
      <Modal open={open} onClose={() => setOpen(false)} maxWidthClassName="max-w-3xl">
        <ModalHeader
          title={data ? data.customer.name : "Statement of Account"}
          subtitle={data ? `${data.customer.displayId}${data.customer.companyName ? ` · ${data.customer.companyName}` : ""}` : undefined}
          badge={data && data.outstandingBalance > 0.01 && <Badge tone={STATUS_TONE[data.balanceStatus]}>{data.balanceStatus.replace(/_/g, " ")}</Badge>}
          onClose={() => setOpen(false)}
        />
        <ModalBody>
          {loading && (
            <div className="flex items-center justify-center py-12 text-slate-400">
              <Loader2 className="h-6 w-6 animate-spin" />
            </div>
          )}
          {error && <Alert tone="error">{error}</Alert>}

          {data && !loading && (
            <>
              <Card className="border-l-4 border-l-brand-600">
                <CardContent className="flex flex-wrap items-center justify-between gap-2 py-4">
                  <div>
                    <p className="text-xs font-medium uppercase tracking-wide text-slate-500">Total Outstanding (as of today)</p>
                    <p className="text-2xl font-bold text-brand-700">{formatCurrency(data.outstandingBalance)}</p>
                  </div>
                </CardContent>
              </Card>

              {data.canGenerate && (
                <Card>
                  <CardHeader>
                    <CardTitle>Generate Statement of Account</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <PeriodForm customerId={customerId} />
                  </CardContent>
                </Card>
              )}

              {data.canGenerate && (
                <Card>
                  <CardHeader>
                    <CardTitle>Adjustments / Credits</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <AdjustmentForm customerId={customerId} />
                  </CardContent>
                </Card>
              )}

              {data.canGenerate && (
                <Card>
                  <CardHeader>
                    <CardTitle>Monthly Statement Schedule</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <ScheduleForm customerId={customerId} schedule={data.schedule} />
                  </CardContent>
                </Card>
              )}

              <Card>
                <CardHeader>
                  <CardTitle>Previous Statements</CardTitle>
                </CardHeader>
                <div className="overflow-x-auto">
                  <Table>
                    <THead>
                      <TR>
                        <TH>Statement No.</TH>
                        <TH>Period</TH>
                        <TH>Generated</TH>
                        <TH>Outstanding</TH>
                        <TH />
                      </TR>
                    </THead>
                    <TBody>
                      {data.statements.map((s) => (
                        <TR key={s.id}>
                          <TD className="font-medium text-slate-900">{s.statementNumber}</TD>
                          <TD className="whitespace-nowrap text-sm text-slate-600">
                            {formatDate(s.periodStart)} – {formatDate(new Date(new Date(s.periodEnd).getTime() - 1))}
                          </TD>
                          <TD className="whitespace-nowrap text-sm text-slate-500">{formatDateTime(s.generatedAt)}</TD>
                          <TD>{formatCurrency(s.outstandingBalance)}</TD>
                          <TD>
                            <Link href={`/soa/view/${s.id}`} target="_blank" className="text-sm font-medium text-brand-600 underline">
                              View
                            </Link>
                          </TD>
                        </TR>
                      ))}
                    </TBody>
                  </Table>
                </div>
                {data.statements.length === 0 && <EmptyState label="No statements generated yet." />}
              </Card>
            </>
          )}
        </ModalBody>
        <ModalFooter>
          <Link href={`/soa/customer/${customerId}`}>
            <Button type="button" variant="outline" size="sm">
              Open Full Page
            </Button>
          </Link>
          <Button type="button" variant="outline" size="sm" onClick={() => setOpen(false)}>
            Close
          </Button>
        </ModalFooter>
      </Modal>
    </>
  );
}
