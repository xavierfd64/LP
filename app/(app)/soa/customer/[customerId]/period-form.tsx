"use client";

import { useActionState, useState } from "react";
import { generateStatementAction } from "@/app/actions/soa";
import { Button } from "@/components/ui/button";
import { Input, Label, Select } from "@/components/ui/input";
import { Alert } from "@/components/ui/alert";

const MONTHS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

export function PeriodForm({ customerId }: { customerId: string }) {
  const action = generateStatementAction.bind(null, customerId);
  const [error, formAction, pending] = useActionState(action, undefined);
  const [type, setType] = useState<"monthly" | "custom">("monthly");
  const now = new Date();

  return (
    <form action={formAction} className="space-y-3">
      {error && <Alert tone="error">{error}</Alert>}
      <div>
        <Label htmlFor="periodType">Period</Label>
        <Select id="periodType" name="periodType" value={type} onChange={(e) => setType(e.target.value as "monthly" | "custom")}>
          <option value="monthly">Monthly Statement</option>
          <option value="custom">Custom Date Range</option>
        </Select>
      </div>

      {type === "monthly" ? (
        <div className="grid grid-cols-2 gap-3">
          <div>
            <Label htmlFor="month">Month</Label>
            <Select id="month" name="month" defaultValue={String(now.getMonth() + 1)}>
              {MONTHS.map((m, i) => (
                <option key={m} value={i + 1}>
                  {m}
                </option>
              ))}
            </Select>
          </div>
          <div>
            <Label htmlFor="year">Year</Label>
            <Input id="year" name="year" type="number" defaultValue={now.getFullYear()} />
          </div>
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-3">
          <div>
            <Label htmlFor="startDate">Start Date</Label>
            <Input id="startDate" name="startDate" type="date" required />
          </div>
          <div>
            <Label htmlFor="endDate">End Date</Label>
            <Input id="endDate" name="endDate" type="date" required />
          </div>
        </div>
      )}

      <Button type="submit" disabled={pending}>
        {pending ? "Generating…" : "Generate SOA"}
      </Button>
    </form>
  );
}
