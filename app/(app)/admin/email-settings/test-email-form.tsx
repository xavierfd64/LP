"use client";

import { useState } from "react";
import { Input, Label } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Alert } from "@/components/ui/alert";
import { testEmailConnectionAction, sendTestEmailAction } from "@/app/actions/email-settings";
import type { TestEmailResult } from "@/lib/email";

/**
 * Two distinct actions per spec: "Test Email Connection" verifies SMTP
 * host/port/TLS/auth only (no recipient, nothing sent) and "Send Test
 * Email" actually delivers a message to a chosen address. Kept separate so
 * a connection check is never mistaken for — or accidentally sends — a
 * real message, and so a plain "yes, this can log in" check doesn't
 * require typing a recipient first.
 */
export function TestEmailForm() {
  const [connPending, setConnPending] = useState(false);
  const [connResult, setConnResult] = useState<TestEmailResult | null>(null);

  const [recipient, setRecipient] = useState("");
  const [sendPending, setSendPending] = useState(false);
  const [sendResult, setSendResult] = useState<TestEmailResult | null>(null);

  async function handleTestConnection() {
    setConnPending(true);
    setConnResult(null);
    const r = await testEmailConnectionAction();
    setConnResult(r);
    setConnPending(false);
  }

  async function handleSendTest() {
    setSendPending(true);
    setSendResult(null);
    const r = await sendTestEmailAction(recipient);
    setSendResult(r);
    setSendPending(false);
  }

  return (
    <div className="space-y-4">
      <div className="space-y-2">
        <Label>Test Email Connection</Label>
        <p className="text-xs text-slate-400">Checks the host, port, TLS, and authentication — sends nothing.</p>
        <Button type="button" onClick={handleTestConnection} disabled={connPending}>
          {connPending ? "Testing…" : "Test Email Connection"}
        </Button>
        {connResult?.ok && <Alert tone="success">Email connection successful.</Alert>}
        {connResult && !connResult.ok && (
          <Alert tone="error">Email connection failed.{connResult.error ? ` ${connResult.error}` : ""}</Alert>
        )}
      </div>

      <div className="space-y-2 border-t border-slate-100 pt-4">
        <Label htmlFor="test-recipient">Send Test Email</Label>
        <p className="text-xs text-slate-400">Actually delivers a test message to confirm end-to-end sending.</p>
        <div className="flex flex-wrap items-center gap-2">
          <Input
            id="test-recipient"
            type="email"
            placeholder="you@example.com"
            value={recipient}
            onChange={(e) => setRecipient(e.target.value)}
            className="max-w-xs"
          />
          <Button type="button" variant="outline" onClick={handleSendTest} disabled={sendPending || !recipient}>
            {sendPending ? "Sending…" : "Send Test Email"}
          </Button>
        </div>
        {sendResult?.ok && <Alert tone="success">Test email sent.</Alert>}
        {sendResult && !sendResult.ok && (
          <Alert tone="error">Send failed.{sendResult.error ? ` ${sendResult.error}` : ""}</Alert>
        )}
      </div>
    </div>
  );
}
