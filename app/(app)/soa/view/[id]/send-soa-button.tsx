"use client";

import { useState } from "react";
import { Mail } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Alert } from "@/components/ui/alert";
import { sendStatementEmailAction } from "@/app/actions/soa";

export function SendSoaButton({ statementId }: { statementId: string }) {
  const [pending, setPending] = useState(false);
  const [sent, setSent] = useState(false);

  async function handleSend() {
    setPending(true);
    await sendStatementEmailAction(statementId);
    setPending(false);
    setSent(true);
  }

  return (
    <div className="space-y-2">
      <Button type="button" onClick={handleSend} disabled={pending}>
        <Mail className="mr-1.5 h-4 w-4" />
        {pending ? "Sending…" : "Send SOA Email"}
      </Button>
      {sent && <Alert tone="success">Queued — check the Email Log for delivery status. (Only sends if Email Notifications are enabled.)</Alert>}
    </div>
  );
}
