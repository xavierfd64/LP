"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Alert } from "@/components/ui/alert";
import { testMessengerConnectionAction } from "@/app/actions/messenger-settings";
import { CustomerPicker } from "@/components/customers/customer-picker";
import type { CustomerSearchResult } from "@/app/actions/customers";

/** Unlike Test Email (any address), Messenger can only reach a customer who has already connected — so this picks a connected customer rather than taking free-text input. */
export function TestMessengerForm() {
  const [customer, setCustomer] = useState<CustomerSearchResult | null>(null);
  const [pending, setPending] = useState(false);
  const [result, setResult] = useState<{ ok: boolean; error?: string } | null>(null);

  async function handleTest() {
    if (!customer) return;
    setPending(true);
    setResult(null);
    const r = await testMessengerConnectionAction(customer.id);
    setResult(r);
    setPending(false);
  }

  return (
    <div className="space-y-2">
      <p className="text-sm font-medium text-slate-700">Test Messenger Connection</p>
      <div className="max-w-xs">
        <CustomerPicker name="testMessengerCustomerId" onSelect={setCustomer} required={false} />
      </div>
      <Button type="button" onClick={handleTest} disabled={pending || !customer}>
        {pending ? "Sending…" : "Send Test Message"}
      </Button>
      {result?.ok && <Alert tone="success">Test message sent.</Alert>}
      {result && !result.ok && <Alert tone="error">{result.error ?? "Failed to send test message."}</Alert>}
    </div>
  );
}
