"use client";

import { useState } from "react";
import { Input, Label } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Alert } from "@/components/ui/alert";
import { testEmailConnectionAction } from "@/app/actions/email-settings";

export function TestEmailForm() {
  const [recipient, setRecipient] = useState("");
  const [pending, setPending] = useState(false);
  const [result, setResult] = useState<{ ok: boolean; error?: string } | null>(null);

  async function handleTest() {
    setPending(true);
    setResult(null);
    const r = await testEmailConnectionAction(recipient);
    setResult(r);
    setPending(false);
  }

  return (
    <div className="space-y-2">
      <Label htmlFor="test-recipient">Test Email Connection</Label>
      <div className="flex flex-wrap items-center gap-2">
        <Input
          id="test-recipient"
          type="email"
          placeholder="you@example.com"
          value={recipient}
          onChange={(e) => setRecipient(e.target.value)}
          className="max-w-xs"
        />
        <Button type="button" onClick={handleTest} disabled={pending || !recipient}>
          {pending ? "Sending…" : "Test Email Connection"}
        </Button>
      </div>
      {result?.ok && <Alert tone="success">Email connection successful.</Alert>}
      {result && !result.ok && (
        <Alert tone="error">Email connection failed. Please check your configuration.{result.error ? ` (${result.error})` : ""}</Alert>
      )}
    </div>
  );
}
