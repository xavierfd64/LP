"use client";

import { useRouter } from "next/navigation";
import { CustomerPicker } from "@/components/customers/customer-picker";

export function SoaLookup() {
  const router = useRouter();
  return (
    <div>
      <CustomerPicker name="customerId" required={false} onSelect={(c) => router.push(`/soa/customer/${c.id}`)} />
    </div>
  );
}
