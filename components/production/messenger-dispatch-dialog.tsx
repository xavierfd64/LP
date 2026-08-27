"use client";

import { useState } from "react";
import { toDataURL } from "qrcode";
import { Send, Loader2, QrCode, Copy, Check, ExternalLink } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea, Label } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { cn, formatDateTime } from "@/lib/utils";
import {
  getMessengerDispatchContextAction,
  generateTrackingLinkForDispatchAction,
  sendMessengerDispatchAction,
  recordMessengerCopyAction,
  type MessengerDispatchContext,
} from "@/app/actions/messenger-dispatch";
import { QUICK_TEMPLATES, generateDispatchMessage } from "@/lib/messenger-dispatch";

type SendState = "idle" | "sending" | "sent" | "failed" | "skipped" | "duplicate";

/**
 * Kanban "Messenger" button + dispatch dialog (5th update). Self-contained,
 * like RecordPaymentDialog: owns its own open/loading/error state, fetches
 * everything the moment it opens (spec item 24 — "no additional customer
 * lookup should be required"), and never navigates away from the Kanban.
 */
export function MessengerDispatchDialog({ jobOrderId, joNumber }: { jobOrderId: string; joNumber: string }) {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [ctx, setCtx] = useState<MessengerDispatchContext | null>(null);
  const [message, setMessage] = useState("");

  const [genLinkLoading, setGenLinkLoading] = useState(false);
  const [showQr, setShowQr] = useState(false);
  const [qrDataUrl, setQrDataUrl] = useState<string | null>(null);
  const [qrLoading, setQrLoading] = useState(false);

  const [copyState, setCopyState] = useState<"idle" | "copied">("idle");
  const [sendState, setSendState] = useState<SendState>("idle");
  const [sendMessage, setSendMessage] = useState<string | null>(null);

  async function handleOpen() {
    setOpen(true);
    setLoading(true);
    setLoadError(null);
    setSendState("idle");
    setSendMessage(null);
    setShowQr(false);
    setQrDataUrl(null);
    try {
      const data = await getMessengerDispatchContextAction(jobOrderId);
      setCtx(data);
      setMessage(data.generatedMessage);
    } catch (e) {
      setLoadError(e instanceof Error ? e.message : "Failed to load this Job Order's information.");
    } finally {
      setLoading(false);
    }
  }

  function applyTemplate(sentence: string) {
    if (!ctx) return;
    setMessage(
      generateDispatchMessage({
        businessName: ctx.businessName,
        orderNumber: ctx.orderNumber,
        joNumber: ctx.joNumber,
        customerName: ctx.customerName,
        serviceName: ctx.serviceName,
        quantity: ctx.quantity,
        currentStage: ctx.currentStage,
        stepIndex: ctx.stepIndex,
        totalSteps: ctx.totalSteps,
        trackingUrl: ctx.trackingUrl,
        bodySentence: sentence,
      })
    );
  }

  async function handleGenerateLink() {
    if (!ctx) return;
    setGenLinkLoading(true);
    try {
      const { url } = await generateTrackingLinkForDispatchAction(ctx.orderId);
      setCtx({ ...ctx, trackingUrl: url, hasTrackingLink: true });
      setMessage((prev) => (prev.includes(url) ? prev : `${prev}\n\nTrack Your Order:\n${url}`));
    } catch (e) {
      setLoadError(e instanceof Error ? e.message : "Failed to generate a tracking link.");
    } finally {
      setGenLinkLoading(false);
    }
  }

  async function handleToggleQr() {
    if (showQr) {
      setShowQr(false);
      return;
    }
    setShowQr(true);
    if (!ctx?.trackingUrl || qrDataUrl) return;
    setQrLoading(true);
    try {
      const dataUrl = await toDataURL(ctx.trackingUrl, { width: 220, margin: 1 });
      setQrDataUrl(dataUrl);
    } finally {
      setQrLoading(false);
    }
  }

  async function handleCopy() {
    await navigator.clipboard.writeText(message);
    setCopyState("copied");
    setTimeout(() => setCopyState("idle"), 1500);
    if (ctx) await recordMessengerCopyAction(jobOrderId, ctx.currentStage);
  }

  async function handleOpenMessenger() {
    if (!ctx?.openMessengerHref) return;
    await navigator.clipboard.writeText(message).catch(() => {});
    window.open(ctx.openMessengerHref, "_blank", "noopener,noreferrer");
  }

  async function handleSend(force = false) {
    if (!ctx) return;
    setSendState("sending");
    setSendMessage(null);
    const result = await sendMessengerDispatchAction(jobOrderId, message, ctx.currentStage, force);
    if (result.status === "SENT") {
      setSendState("sent");
    } else if (result.status === "FAILED") {
      setSendState("failed");
      // Never surface the raw API error here (spec item 33) — the real
      // reason is still recorded in the audit trail and Messenger Log for
      // Admin to review.
      setSendMessage("Unable to send Messenger update. Please try again or use Copy Message.");
    } else if (result.status === "DUPLICATE_GUARD") {
      setSendState("duplicate");
      setSendMessage(`An update for this stage was already sent ${formatDateTime(result.recentAt)}.`);
    } else {
      setSendState("skipped");
      setSendMessage(result.reason);
    }
  }

  return (
    <>
      <Button
        type="button"
        variant="outline"
        size="sm"
        className="h-7 px-2 text-xs"
        aria-label="Messenger"
        onClick={handleOpen}
      >
        <Send className="h-3.5 w-3.5" />
      </Button>

      {open && (
        <div className="fixed inset-x-0 top-0 h-[100dvh] z-50 flex items-stretch justify-center bg-black/40 sm:items-center sm:p-4">
          <div className="flex h-full w-full flex-col bg-white shadow-xl sm:h-auto sm:max-h-[90dvh] sm:max-w-lg sm:rounded-lg">
            <div className="flex items-start justify-between gap-2 border-b border-slate-100 px-5 py-4">
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <Badge tone="slate">FACEBOOK MESSENGER DISPATCH</Badge>
                  <Badge tone="red">Live Production Status Update</Badge>
                </div>
                <h2 className="mt-1 text-base font-bold text-slate-900">Send Update for {joNumber}</h2>
                <p className="text-xs text-slate-500">
                  Share the latest production stage, order status, and tracking information.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="shrink-0 text-slate-400 hover:text-slate-700"
                aria-label="Close"
              >
                ✕
              </button>
            </div>

            <div className="flex-1 space-y-4 overflow-y-auto px-5 py-4">
              {loading && (
                <div className="flex items-center gap-2 text-sm text-slate-500">
                  <Loader2 className="h-4 w-4 animate-spin" /> Loading transaction details…
                </div>
              )}
              {loadError && <p className="text-sm text-red-600">{loadError}</p>}

              {ctx && (
                <>
                  <div className="rounded-md bg-slate-50 p-3 text-sm">
                    <dl className="grid grid-cols-2 gap-x-3 gap-y-1">
                      <Info label="Job Order" value={ctx.joNumber} />
                      <Info label="Order" value={ctx.orderNumber} />
                      <Info label="Customer" value={ctx.customerName} />
                      <Info label="Service" value={ctx.serviceName} />
                      <Info label="Current Stage" value={ctx.currentStage} />
                      {ctx.totalSteps > 0 && <Info label="Progress" value={`Step ${ctx.stepIndex} of ${ctx.totalSteps}`} />}
                    </dl>
                  </div>

                  <div>
                    <Label>Select Messenger Recipient Target</Label>
                    <div className="rounded-md border border-slate-200 p-3">
                      <div className="flex items-center justify-between">
                        <div>
                          <p className="text-sm font-medium text-slate-900">{ctx.customerName}</p>
                          <p className="text-xs text-slate-500">Send the update to this customer&apos;s Messenger.</p>
                        </div>
                        {ctx.customerConnected ? (
                          <Badge tone="green">Connected</Badge>
                        ) : (
                          <Badge tone="slate">Not Connected</Badge>
                        )}
                      </div>
                      {!ctx.messengerConfigured && (
                        <p className="mt-2 text-xs text-yellow-700">
                          Messenger integration is not configured. You can still copy the message or open Messenger manually.
                        </p>
                      )}
                      {ctx.messengerConfigured && !ctx.customerConnected && (
                        <p className="mt-2 text-xs text-slate-500">
                          This customer hasn&apos;t connected Messenger yet — direct sending isn&apos;t available. Copy the
                          message or open Messenger to continue manually.
                        </p>
                      )}
                    </div>
                  </div>

                  {ctx.recentDispatch && (
                    <p className="rounded-md bg-yellow-50 px-3 py-2 text-xs text-yellow-800">
                      An update for this stage was already {ctx.recentDispatch.status.toLowerCase()} at{" "}
                      {formatDateTime(ctx.recentDispatch.at)}.
                    </p>
                  )}

                  <div>
                    <Label>Quick Message Templates</Label>
                    <div className="flex flex-wrap gap-1.5">
                      {QUICK_TEMPLATES.map((t) => (
                        <button
                          key={t.key}
                          type="button"
                          onClick={() => applyTemplate(t.sentence)}
                          className="rounded-full border border-slate-200 px-2.5 py-1 text-xs text-slate-600 hover:border-brand-400 hover:text-brand-700"
                        >
                          {t.label}
                        </button>
                      ))}
                    </div>
                  </div>

                  <div>
                    <Label htmlFor="dispatch-message">Formatted Messenger Message (editable before sending)</Label>
                    <Textarea
                      id="dispatch-message"
                      rows={10}
                      value={message}
                      onChange={(e) => setMessage(e.target.value)}
                      className="font-mono text-xs"
                    />
                  </div>

                  <div>
                    <Label>Tracking Link</Label>
                    {ctx.trackingUrl ? (
                      <div className="flex items-center justify-between rounded-md border border-slate-200 px-3 py-2 text-xs">
                        <span className="truncate text-slate-600">{ctx.trackingUrl}</span>
                        <Button type="button" size="sm" variant="ghost" onClick={handleToggleQr}>
                          <QrCode className="h-3.5 w-3.5" /> {showQr ? "Hide QR" : "Show QR Code"}
                        </Button>
                      </div>
                    ) : (
                      <div className="flex items-center justify-between rounded-md border border-dashed border-slate-200 px-3 py-2 text-xs text-slate-500">
                        No active tracking link.
                        <Button type="button" size="sm" variant="outline" onClick={handleGenerateLink} disabled={genLinkLoading}>
                          {genLinkLoading ? "Generating…" : "Generate Link"}
                        </Button>
                      </div>
                    )}
                    {showQr && (
                      <div className="mt-2 flex justify-center rounded-md border border-slate-200 p-3">
                        {qrLoading ? (
                          <Loader2 className="h-6 w-6 animate-spin text-slate-400" />
                        ) : qrDataUrl ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img src={qrDataUrl} alt="Tracking link QR code" width={180} height={180} />
                        ) : (
                          <p className="text-xs text-slate-400">Generate a tracking link first.</p>
                        )}
                      </div>
                    )}
                  </div>

                  {sendMessage && (
                    <p
                      className={cn(
                        "text-xs",
                        sendState === "failed" ? "text-red-600" : sendState === "duplicate" ? "text-yellow-700" : "text-slate-500"
                      )}
                    >
                      {sendMessage}
                    </p>
                  )}
                  {sendState === "sent" && <p className="text-xs font-medium text-green-700">Message sent via Messenger.</p>}
                </>
              )}
            </div>

            <div className="flex flex-wrap items-center justify-end gap-2 border-t border-slate-100 px-5 py-3">
              <Button type="button" variant="outline" onClick={() => setOpen(false)}>
                Cancel
              </Button>
              {ctx && (
                <>
                  <Button type="button" variant="outline" onClick={handleCopy}>
                    {copyState === "copied" ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />} Copy Formatted Text
                  </Button>
                  <Button type="button" variant="outline" onClick={handleOpenMessenger} disabled={!ctx.openMessengerHref}>
                    <ExternalLink className="h-4 w-4" /> Open in Messenger
                  </Button>
                  {ctx.messengerConfigured && ctx.customerConnected && (
                    <Button
                      type="button"
                      onClick={() => handleSend(sendState === "duplicate")}
                      disabled={sendState === "sending" || sendState === "sent"}
                    >
                      {sendState === "sending" ? "Sending…" : sendState === "sent" ? "Sent" : sendState === "duplicate" ? "Send Again" : "Send via Messenger"}
                    </Button>
                  )}
                </>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
}

function Info({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-[11px] uppercase tracking-wide text-slate-400">{label}</dt>
      <dd className="truncate font-medium text-slate-900">{value}</dd>
    </div>
  );
}
