"use client";

import { useRouter } from "next/navigation";
import { Input, Label, Select } from "@/components/ui/input";

const MONTHS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

export function MonthYearForm({ month, year }: { month: number; year: number }) {
  const router = useRouter();

  function update(next: { month?: number; year?: number }) {
    const params = new URLSearchParams({ month: String(next.month ?? month), year: String(next.year ?? year) });
    router.push(`/soa/monthly?${params.toString()}`);
  }

  return (
    <div className="flex flex-wrap items-end gap-3">
      <div>
        <Label htmlFor="month">Month</Label>
        <Select id="month" value={month} onChange={(e) => update({ month: Number(e.target.value) })}>
          {MONTHS.map((m, i) => (
            <option key={m} value={i + 1}>
              {m}
            </option>
          ))}
        </Select>
      </div>
      <div>
        <Label htmlFor="year">Year</Label>
        <Input id="year" type="number" className="w-24" value={year} onChange={(e) => update({ year: Number(e.target.value) })} />
      </div>
    </div>
  );
}
