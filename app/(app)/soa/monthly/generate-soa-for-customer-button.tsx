"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { generateStatementForCustomerAndMonthAction } from "@/app/actions/soa";

export function GenerateSoaForCustomerButton({ customerId, month, year }: { customerId: string; month: number; year: number }) {
  const router = useRouter();
  const [pending, setPending] = useState(false);

  async function handleClick() {
    setPending(true);
    const { statementId } = await generateStatementForCustomerAndMonthAction(customerId, month, year);
    setPending(false);
    router.push(`/soa/view/${statementId}`);
  }

  return (
    <Button type="button" size="sm" variant="outline" onClick={handleClick} disabled={pending}>
      {pending ? "Generating…" : "Generate SOA"}
    </Button>
  );
}
