"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Search, Package, CheckCircle2, AlertCircle, Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input, Select } from "@/components/ui/input";
import { Alert } from "@/components/ui/alert";
import { formatDate, formatDateTime, cn } from "@/lib/utils";
import { toggleFormItemQcCheckedAction, completeQcFromFormAction, completeQcFromFormBoardAction } from "@/app/actions/qc";

type Item = {
  id: string;
  name: string;
  qty: number;
  specs: Record<string, string>;
  qcChecked: boolean;
  qcCheckedAt: string | null;
  qcCheckedByName: string | null;
};

export function QcChecklistView({
  jobOrder,
  items: initialItems,
  currentUserName,
  errorMsg,
  embedded = false,
  onComplete,
}: {
  jobOrder: { id: string; joNumber: string; productType: string; customerName: string; quantity: number; deadline: string | null; startedAt: string | null; assignedToName: string | null };
  items: Item[];
  currentUserName: string;
  errorMsg?: string;
  /** Rendered inside the QC popup/modal (1st Update item 2) instead of the standalone /qc-checklist page — hides the page-style heading/Back link, and completion calls onComplete instead of navigating. */
  embedded?: boolean;
  onComplete?: (result: { ok: true } | { ok: false; error: string }) => void;
}) {
  const router = useRouter();
  const [items, setItems] = useState(initialItems);
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<"" | "checked" | "pending">("");
  const [pending, startTransition] = useTransition();
  const [completing, setCompleting] = useState(false);
  const [localError, setLocalError] = useState<string | undefined>(errorMsg);

  const checkedCount = items.filter((i) => i.qcChecked).length;
  const totalCount = items.length;
  const progressPct = totalCount > 0 ? Math.round((checkedCount / totalCount) * 100) : 0;
  const checkedQty = items.filter((i) => i.qcChecked).reduce((s, i) => s + i.qty, 0);
  const remainingQty = jobOrder.quantity - checkedQty;

  const q = query.trim().toLowerCase();
  const visible = items.filter((i) => {
    if (q && !i.name.toLowerCase().includes(q) && !Object.values(i.specs).some((v) => v.toLowerCase().includes(q))) return false;
    if (statusFilter === "checked" && !i.qcChecked) return false;
    if (statusFilter === "pending" && i.qcChecked) return false;
    return true;
  });

  function toggle(id: string) {
    const now = new Date().toISOString();
    setItems((prev) =>
      prev.map((i) =>
        i.id === id
          ? i.qcChecked
            ? { ...i, qcChecked: false, qcCheckedAt: null, qcCheckedByName: null }
            : { ...i, qcChecked: true, qcCheckedAt: now, qcCheckedByName: currentUserName }
          : i
      )
    );
    startTransition(async () => {
      await toggleFormItemQcCheckedAction(id);
      router.refresh();
    });
  }

  function checkAllVisible() {
    const now = new Date().toISOString();
    const ids = new Set(visible.map((i) => i.id));
    setItems((prev) => prev.map((i) => (ids.has(i.id) && !i.qcChecked ? { ...i, qcChecked: true, qcCheckedAt: now, qcCheckedByName: currentUserName } : i)));
    startTransition(async () => {
      await Promise.all(visible.filter((i) => !i.qcChecked).map((i) => toggleFormItemQcCheckedAction(i.id)));
      router.refresh();
    });
  }

  const specKeys = useMemo(() => Array.from(new Set(items.flatMap((i) => Object.keys(i.specs)))), [items]);

  async function handleComplete() {
    setCompleting(true);
    if (onComplete) {
      const result = await completeQcFromFormBoardAction(jobOrder.id, undefined);
      setCompleting(false);
      if (!result.ok) setLocalError(result.error);
      else setLocalError(undefined);
      onComplete(result);
      return;
    }
    const fd = new FormData();
    await completeQcFromFormAction(jobOrder.id, fd);
    setCompleting(false);
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        {!embedded && (
          <div>
            <h1 className="text-2xl font-bold text-slate-900">QC Checklist</h1>
            <p className="text-sm text-slate-500">Check and verify each item before marking the job as complete.</p>
          </div>
        )}
        <div className="flex gap-2">
          {!embedded && (
            <Link href={`/job-orders/${jobOrder.id}`}>
              <Button type="button" variant="outline">
                ← Back to Production
              </Button>
            </Link>
          )}
          <Button type="button" onClick={handleComplete} disabled={completing || checkedCount === 0}>
            <Check className="h-4 w-4" /> {completing ? "Completing..." : "Complete QC"}
          </Button>
        </div>
      </div>

      {localError && <Alert tone="error">{localError}</Alert>}

      <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <div className="flex items-center gap-2">
              <p className="font-bold text-slate-900">{jobOrder.joNumber}</p>
              <span className="rounded-full bg-purple-100 px-2 py-0.5 text-xs font-semibold text-purple-700">IN QC</span>
            </div>
            <p className="text-sm text-slate-600">{jobOrder.customerName}</p>
            <p className="text-xs text-slate-400">{jobOrder.productType}</p>
          </div>
          <div className="flex flex-wrap gap-6">
            <Stat icon={Package} label="Total Quantity" value={`${jobOrder.quantity} pcs`} tone="slate" />
            <Stat icon={CheckCircle2} label="Checked" value={`${checkedQty} pcs`} tone="green" />
            <Stat icon={AlertCircle} label="Remaining" value={`${Math.max(remainingQty, 0)} pcs`} tone="red" />
            <div>
              <p className="flex items-center gap-1 text-xs text-slate-400">QC Progress <span className="font-semibold text-slate-700">{progressPct}%</span></p>
              <div className="mt-1 h-2 w-32 overflow-hidden rounded-full bg-slate-100">
                <div className="h-full rounded-full bg-brand-500" style={{ width: `${progressPct}%` }} />
              </div>
              <p className="text-[11px] text-slate-400">{checkedCount} of {totalCount} items checked</p>
            </div>
          </div>
        </div>
        <div className="mt-3 grid grid-cols-3 gap-3 border-t border-slate-100 pt-3 text-xs">
          <div>
            <p className="text-slate-400">Due Date</p>
            <p className="font-medium text-slate-700" suppressHydrationWarning>{jobOrder.deadline ? formatDate(jobOrder.deadline) : "—"}</p>
          </div>
          <div>
            <p className="text-slate-400">Date Started</p>
            <p className="font-medium text-slate-700" suppressHydrationWarning>{jobOrder.startedAt ? formatDateTime(jobOrder.startedAt) : "—"}</p>
          </div>
          <div>
            <p className="text-slate-400">Assigned To</p>
            <p className="font-medium text-slate-700">{jobOrder.assignedToName ?? "Unassigned"}</p>
          </div>
        </div>
      </div>

      <div className="flex flex-wrap gap-2">
        <div className="relative flex-1 sm:min-w-[220px]">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-slate-400" />
          <Input placeholder="Search name, number, size..." className="pl-8" value={query} onChange={(e) => setQuery(e.target.value)} />
        </div>
        <Select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value as typeof statusFilter)} className="sm:w-40">
          <option value="">All Status</option>
          <option value="checked">Checked</option>
          <option value="pending">Pending</option>
        </Select>
        <Button type="button" variant="outline" onClick={checkAllVisible} disabled={pending}>
          Check All Visible
        </Button>
      </div>

      <div className="overflow-x-auto rounded-lg border border-slate-200 bg-white">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-left text-xs uppercase text-slate-500">
            <tr>
              <th className="w-10 px-3 py-2" />
              <th className="px-3 py-2">#</th>
              {specKeys.map((k) => (
                <th key={k} className="px-3 py-2">{k}</th>
              ))}
              <th className="px-3 py-2">Name</th>
              <th className="px-3 py-2">Qty</th>
              <th className="px-3 py-2">Status</th>
              <th className="px-3 py-2">Checked By</th>
              <th className="px-3 py-2">Checked At</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {visible.map((it, i) => (
              <tr key={it.id} className={cn(it.qcChecked && "bg-green-50/40")}>
                <td className="px-3 py-2">
                  <input type="checkbox" checked={it.qcChecked} onChange={() => toggle(it.id)} className="h-4 w-4 rounded border-slate-300" />
                </td>
                <td className="px-3 py-2 text-slate-500">{i + 1}</td>
                {specKeys.map((k) => (
                  <td key={k} className="px-3 py-2">{it.specs[k] ?? "—"}</td>
                ))}
                <td className="px-3 py-2 font-medium text-slate-900">{it.name}</td>
                <td className="px-3 py-2">{it.qty}</td>
                <td className="px-3 py-2">
                  {it.qcChecked ? (
                    <span className="inline-flex items-center gap-1 rounded-full bg-green-100 px-2 py-0.5 text-xs font-medium text-green-700">
                      <CheckCircle2 className="h-3 w-3" /> Checked
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-700">Pending</span>
                  )}
                </td>
                <td className="px-3 py-2 text-slate-500">{it.qcCheckedByName ?? "—"}</td>
                <td className="px-3 py-2 text-slate-400" suppressHydrationWarning>{it.qcCheckedAt ? formatDateTime(it.qcCheckedAt) : "—"}</td>
              </tr>
            ))}
            {visible.length === 0 && (
              <tr>
                <td colSpan={6 + specKeys.length} className="px-3 py-8 text-center text-slate-400">
                  No items match this view.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function Stat({ icon: Icon, label, value, tone }: { icon: React.ComponentType<{ className?: string }>; label: string; value: string; tone: "slate" | "green" | "red" }) {
  const toneClasses = { slate: "text-slate-500", green: "text-green-600", red: "text-red-600" }[tone];
  return (
    <div className="flex items-center gap-2">
      <Icon className={cn("h-4 w-4", toneClasses)} />
      <div>
        <p className="text-xs text-slate-400">{label}</p>
        <p className="text-sm font-semibold text-slate-900">{value}</p>
      </div>
    </div>
  );
}
