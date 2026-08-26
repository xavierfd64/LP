"use client";

import { useState, type FormEvent } from "react";
import { Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input, Label } from "@/components/ui/input";
import { Alert } from "@/components/ui/alert";
import { lookupTrackingByReferenceAction, type ReferenceLookupResult } from "@/app/actions/reference-lookup";
import { TrackingSnapshotCard } from "./tracking-snapshot-card";

/**
 * Public, login-free "track by reference number" — the homepage entry
 * point for customers with no account (spec: "especially important for
 * customers who were created by Admin/Staff but do not have login
 * credentials"). Requires the reference plus the customer's own email or
 * phone on file as a second factor (enforced server-side in
 * lookupTrackingByReferenceAction) since a bare reference number is
 * short and guessable, unlike a secure /track/[token] link.
 */
export function ReferenceLookupForm() {
  const [reference, setReference] = useState("");
  const [contact, setContact] = useState("");
  const [pending, setPending] = useState(false);
  const [result, setResult] = useState<ReferenceLookupResult | null>(null);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setPending(true);
    const res = await lookupTrackingByReferenceAction(reference, contact);
    setResult(res);
    setPending(false);
  }

  if (result?.ok) {
    return (
      <div className="space-y-4">
        <TrackingSnapshotCard data={result.data} />
        <Button type="button" variant="outline" size="sm" onClick={() => setResult(null)}>
          Look up another
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <form onSubmit={handleSubmit} className="space-y-3">
        <div>
          <Label htmlFor="reference">Reference Number</Label>
          <Input
            id="reference"
            value={reference}
            onChange={(e) => setReference(e.target.value)}
            placeholder="e.g. ORD-2026-0826-0007, QUO-2026-0826-0007"
            required
          />
        </div>
        <div>
          <Label htmlFor="contact">Email or Phone Number on File</Label>
          <Input
            id="contact"
            value={contact}
            onChange={(e) => setContact(e.target.value)}
            placeholder="Used to verify it's really you"
            required
          />
        </div>
        <Button type="submit" disabled={pending} className="w-full">
          <Search className="h-4 w-4" /> {pending ? "Checking..." : "Track Order"}
        </Button>
      </form>

      {result && !result.ok && result.reason === "quotation_pending" && (
        <Alert tone="info">
          Quotation {result.quoteNumber} is currently {result.status.replace(/_/g, " ").toLowerCase()}. Once it&apos;s approved
          and an order is created, full production tracking will be available here.
        </Alert>
      )}
      {result && !result.ok && result.reason === "not_found" && (
        <Alert tone="error">
          We couldn&apos;t find a matching transaction with that reference and contact info. Please double-check both and try
          again, or contact us for assistance.
        </Alert>
      )}
    </div>
  );
}
