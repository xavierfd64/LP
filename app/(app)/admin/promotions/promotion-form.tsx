"use client";

import { useActionState, useState } from "react";
import { createPromotionAction } from "@/app/actions/pricing";
import { Button } from "@/components/ui/button";
import { Input, Label, Select } from "@/components/ui/input";
import { Alert } from "@/components/ui/alert";

type Service = { id: string; name: string };

export function PromotionForm({ services }: { services: Service[] }) {
  const [error, formAction, pending] = useActionState(createPromotionAction, undefined);
  const [discountType, setDiscountType] = useState<"percent" | "fixed">("percent");

  return (
    <form action={formAction} className="space-y-4">
      {error && <Alert tone="error">{error}</Alert>}
      <div>
        <Label htmlFor="name">Promotion Name *</Label>
        <Input id="name" name="name" required placeholder="e.g. August Sticker Promo" />
      </div>
      <div>
        <Label htmlFor="serviceId">Applicable Service</Label>
        <Select id="serviceId" name="serviceId" defaultValue="">
          <option value="">All services</option>
          {services.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name}
            </option>
          ))}
        </Select>
      </div>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div>
          <Label htmlFor="startDate">Start Date</Label>
          <Input id="startDate" name="startDate" type="date" />
        </div>
        <div>
          <Label htmlFor="endDate">End Date</Label>
          <Input id="endDate" name="endDate" type="date" />
        </div>
        <div>
          <Label htmlFor="minQty">Minimum Quantity</Label>
          <Input id="minQty" name="minQty" type="number" min={1} placeholder="No minimum" />
        </div>
        <div>
          <Label htmlFor="maxQty">Maximum Quantity</Label>
          <Input id="maxQty" name="maxQty" type="number" min={1} placeholder="No maximum" />
        </div>
      </div>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div>
          <Label htmlFor="discountType">Discount Type</Label>
          <Select id="discountType" name="discountType" value={discountType} onChange={(e) => setDiscountType(e.target.value as "percent" | "fixed")}>
            <option value="percent">Percentage off</option>
            <option value="fixed">Fixed amount off</option>
          </Select>
        </div>
        <div>
          <Label htmlFor="discountValue">{discountType === "percent" ? "Percent (%)" : "Amount"}</Label>
          <Input id="discountValue" name="discountValue" type="number" min={0} step="0.01" required />
        </div>
      </div>
      <Button type="submit" disabled={pending}>
        {pending ? "Saving…" : "Create Promotion"}
      </Button>
    </form>
  );
}
