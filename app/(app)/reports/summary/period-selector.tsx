"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { Select, Input, Label } from "@/components/ui/input";
import type { PeriodType } from "@/lib/transaction-summary";

const TYPE_LABEL: Record<PeriodType, string> = {
  daily: "Daily",
  monthly: "Monthly",
  quarterly: "Quarterly",
  semiannual: "Semi-Annual",
  annual: "Annual",
};

function todayIso() {
  return new Date().toISOString().slice(0, 10);
}
function thisMonthIso() {
  return new Date().toISOString().slice(0, 7);
}

export function PeriodSelector({
  type,
  date,
  month,
  year,
  quarter,
  half,
  basePath = "/reports/summary",
}: {
  type: PeriodType;
  date: string;
  month: string;
  year: number;
  quarter: number;
  half: number;
  /** Aug 20 1st update: the P&L report (/reports/profit-loss) reuses this exact selector rather than a second one. */
  basePath?: string;
}) {
  const router = useRouter();
  const searchParams = useSearchParams();

  function update(next: Record<string, string>) {
    const params = new URLSearchParams(searchParams.toString());
    for (const [k, v] of Object.entries(next)) params.set(k, v);
    router.push(`${basePath}?${params.toString()}`);
  }

  return (
    <div className="flex flex-wrap items-end gap-3">
      <div>
        <Label htmlFor="period-type">Period</Label>
        <Select
          id="period-type"
          value={type}
          onChange={(e) => {
            const t = e.target.value as PeriodType;
            update({
              type: t,
              date: date || todayIso(),
              month: month || thisMonthIso(),
              year: String(year || new Date().getFullYear()),
              quarter: String(quarter || 1),
              half: String(half || 1),
            });
          }}
        >
          {(Object.keys(TYPE_LABEL) as PeriodType[]).map((t) => (
            <option key={t} value={t}>
              {TYPE_LABEL[t]}
            </option>
          ))}
        </Select>
      </div>

      {type === "daily" && (
        <div>
          <Label htmlFor="period-date">Date</Label>
          <Input id="period-date" type="date" defaultValue={date} onChange={(e) => update({ date: e.target.value })} />
        </div>
      )}

      {type === "monthly" && (
        <div>
          <Label htmlFor="period-month">Month</Label>
          <Input id="period-month" type="month" defaultValue={month} onChange={(e) => update({ month: e.target.value })} />
        </div>
      )}

      {type === "quarterly" && (
        <>
          <div>
            <Label htmlFor="period-year">Year</Label>
            <Input
              id="period-year"
              type="number"
              defaultValue={year}
              onChange={(e) => update({ year: e.target.value })}
              className="w-24"
            />
          </div>
          <div>
            <Label htmlFor="period-quarter">Quarter</Label>
            <Select id="period-quarter" defaultValue={String(quarter)} onChange={(e) => update({ quarter: e.target.value })}>
              <option value="1">Q1</option>
              <option value="2">Q2</option>
              <option value="3">Q3</option>
              <option value="4">Q4</option>
            </Select>
          </div>
        </>
      )}

      {type === "semiannual" && (
        <>
          <div>
            <Label htmlFor="period-year-h">Year</Label>
            <Input
              id="period-year-h"
              type="number"
              defaultValue={year}
              onChange={(e) => update({ year: e.target.value })}
              className="w-24"
            />
          </div>
          <div>
            <Label htmlFor="period-half">Half</Label>
            <Select id="period-half" defaultValue={String(half)} onChange={(e) => update({ half: e.target.value })}>
              <option value="1">First Half</option>
              <option value="2">Second Half</option>
            </Select>
          </div>
        </>
      )}

      {type === "annual" && (
        <div>
          <Label htmlFor="period-year-a">Year</Label>
          <Input
            id="period-year-a"
            type="number"
            defaultValue={year}
            onChange={(e) => update({ year: e.target.value })}
            className="w-24"
          />
        </div>
      )}
    </div>
  );
}
