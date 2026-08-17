"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Alert } from "@/components/ui/alert";
import { generateAllStatementsForMonthAction } from "@/app/actions/soa";

export function GenerateAllButton({ month, year }: { month: number; year: number }) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [result, setResult] = useState<number | null>(null);

  async function handleClick() {
    setPending(true);
    const { created } = await generateAllStatementsForMonthAction(month, year);
    setPending(false);
    setResult(created);
    router.refresh();
  }

  return (
    <div className="flex flex-col items-end gap-2">
      <Button type="button" onClick={handleClick} disabled={pending}>
        {pending ? "Generating…" : "Generate All"}
      </Button>
      {result !== null && <Alert tone="success">Generated {result} statement{result === 1 ? "" : "s"}.</Alert>}
    </div>
  );
}
