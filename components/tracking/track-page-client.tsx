"use client";

import { useState, type FormEvent } from "react";
import Link from "next/link";
import { Package, MapPin, Search, User, ShieldCheck, Headset } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input, Label } from "@/components/ui/input";
import { Alert } from "@/components/ui/alert";
import { lookupTrackingByReferenceAction, type ReferenceLookupResult } from "@/app/actions/reference-lookup";
import { TrackingSnapshotCard } from "./tracking-snapshot-card";

/**
 * Owns the public reference-number lookup end to end: the hero + form +
 * info cards (narrow layout, matching the approved reference's left
 * panel) versus the result (wider layout, right panel) are two renders of
 * the same client component swapping on local state — never a real
 * navigation, so a result appears the instant the action resolves with no
 * page refresh, and "Back" (inside TrackingSnapshotCard) just clears that
 * state to return here. See ReferenceLookupForm's old doc comment (now
 * folded into this component) for why the contact field, while visually
 * optional per the approved design, still can't be skipped and get a
 * result: a bare reference number is short and guessable, so
 * lookupTrackingByReferenceAction requires it server-side as a second
 * factor — this only adds a clearer client-side prompt for that specific
 * case instead of the generic "not found" message every other failure
 * reason shares (safe to special-case: it reveals nothing about whether
 * the reference itself was valid, since it's checked before any lookup).
 */
export function TrackPageClient({ supportHref }: { supportHref: string | null }) {
  const [reference, setReference] = useState("");
  const [contact, setContact] = useState("");
  const [pending, setPending] = useState(false);
  const [result, setResult] = useState<ReferenceLookupResult | null>(null);
  const [missingContact, setMissingContact] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!contact.trim()) {
      setMissingContact(true);
      setResult(null);
      return;
    }
    setMissingContact(false);
    setPending(true);
    const res = await lookupTrackingByReferenceAction(reference, contact);
    setResult(res);
    setPending(false);
  }

  if (result?.ok) {
    return (
      <main className="mx-auto max-w-3xl px-4 py-8 sm:px-6 sm:py-12">
        <TrackingSnapshotCard data={result.data} supportHref={supportHref} onBack={() => setResult(null)} />
      </main>
    );
  }

  return (
    <main className="mx-auto max-w-lg space-y-6 px-4 py-8 sm:px-6 sm:py-12">
      <div className="flex flex-col items-center text-center">
        <TrackIllustration />
        <h1 className="mt-2 text-2xl font-bold text-slate-900 sm:text-3xl">Track Your Order</h1>
        <p className="mt-2 text-sm text-slate-500">
          Enter your quotation, invoice, job order, or order number to check the latest status — no account required.
        </p>
      </div>

      <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm sm:p-6">
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <Label htmlFor="reference">Reference Number</Label>
            <div className="relative mt-1">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
              <Input
                id="reference"
                value={reference}
                onChange={(e) => setReference(e.target.value)}
                placeholder="e.g. ORD-2026-0826-0007, QUO-2026-0826-0007"
                className="pl-9"
                required
              />
            </div>
          </div>
          <div>
            <Label htmlFor="contact">Email or Phone Number on File (optional)</Label>
            <div className="relative mt-1">
              <User className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
              <Input
                id="contact"
                value={contact}
                onChange={(e) => {
                  setContact(e.target.value);
                  if (missingContact) setMissingContact(false);
                }}
                placeholder="Used to verify it's really you"
                className="pl-9"
              />
            </div>
            <p className="mt-1 text-xs text-slate-400">We use this only to confirm the order belongs to you.</p>
          </div>

          {missingContact && (
            <Alert tone="error">Please also enter the email or phone number on file so we can verify it&apos;s really you.</Alert>
          )}
          {result && !result.ok && result.reason === "quotation_pending" && (
            <Alert tone="info">
              Quotation {result.quoteNumber} is currently {result.status.replace(/_/g, " ").toLowerCase()}. Once it&apos;s
              approved and an order is created, full production tracking will be available here.
            </Alert>
          )}
          {result && !result.ok && result.reason === "not_found" && (
            <Alert tone="error">
              We couldn&apos;t find a matching transaction with that reference and contact info. Please double-check both and
              try again, or contact us for assistance.
            </Alert>
          )}

          <Button type="submit" disabled={pending} className="w-full" size="lg">
            <Search className="h-4 w-4" /> {pending ? "Checking..." : "Track Order"}
          </Button>
        </form>
      </div>

      <div className="flex items-start gap-3 rounded-xl border border-slate-200 bg-white p-4">
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-brand-50">
          <ShieldCheck className="h-4 w-4 text-brand-600" />
        </span>
        <div>
          <p className="text-sm font-semibold text-slate-900">Secure &amp; Private</p>
          <p className="text-xs text-slate-500">Your information is safe with us. We only show order details that match your reference.</p>
        </div>
      </div>

      <div className="rounded-xl border border-slate-200 bg-white p-4 text-center text-sm text-slate-600">
        <p>
          Have an account?{" "}
          <Link href="/login" className="font-medium text-brand-600 underline">
            Sign in
          </Link>{" "}
          for your full order history and rewards.
        </p>
      </div>

      <div className="flex flex-col items-start gap-3 rounded-xl border border-slate-200 bg-white p-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-start gap-3">
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-brand-50">
            <Headset className="h-4 w-4 text-brand-600" />
          </span>
          <div>
            <p className="text-sm font-semibold text-slate-900">Need help tracking your order?</p>
            <p className="text-xs text-slate-500">Our support team is ready to help you.</p>
          </div>
        </div>
        {supportHref ? (
          <a href={supportHref} className="w-full sm:w-auto">
            <Button type="button" variant="outline" className="w-full whitespace-nowrap sm:w-auto">
              Contact Support
            </Button>
          </a>
        ) : (
          <Button type="button" variant="outline" disabled className="w-full whitespace-nowrap sm:w-auto">
            Contact Support
          </Button>
        )}
      </div>
    </main>
  );
}

/** Decorative package + location-pin illustration — a lightweight
 * lucide-icon composition rather than a custom image asset, matching how
 * every other icon-driven surface in this app already works. */
function TrackIllustration() {
  return (
    <div className="relative flex h-28 w-28 items-center justify-center">
      <div className="absolute inset-0 rounded-full bg-brand-50" />
      <div className="absolute h-2 w-2 rounded-full bg-brand-200" style={{ top: "8%", left: "12%" }} />
      <div className="absolute h-1.5 w-1.5 rounded-full bg-brand-200" style={{ top: "18%", right: "10%" }} />
      <div className="absolute h-1.5 w-1.5 rounded-full bg-brand-200" style={{ bottom: "10%", left: "6%" }} />
      <Package className="relative h-12 w-12 text-brand-500" strokeWidth={1.5} />
      <span className="absolute bottom-1 right-1 flex h-8 w-8 items-center justify-center rounded-full bg-brand-600 shadow-md">
        <MapPin className="h-4 w-4 text-white" />
      </span>
    </div>
  );
}
