import { createHmac, timingSafeEqual } from "crypto";

/**
 * Reference implementation of the fail-closed webhook-verification pattern
 * every FUTURE financially-relevant webhook (a payment gateway's
 * "payment succeeded" callback, most obviously) must follow — security
 * hardening pass #2, findings H3/section 16-18.
 *
 * This module is not imported anywhere yet. There is no payment gateway
 * integrated in this codebase. It exists so the correct pattern is
 * established in code, not just described in an audit document, before
 * that integration is built.
 *
 * The existing Messenger webhook (app/api/messenger/webhook/route.ts) was
 * the precedent that surfaced this finding: it verifies its HMAC signature
 * only when an App Secret happens to be configured, and processes the
 * event unverified otherwise. That is an accepted, low-stakes trade-off
 * for Messenger specifically (worst case: a forged opt-in event links an
 * arbitrary PSID to a connection ref the attacker would already need to
 * know — no financial or customer-data impact), and is deliberately left
 * unchanged here per this pass's "do not break Messenger" constraint. It
 * must NOT be copied for a payment webhook, where the same fail-open gap
 * would mean a forged "payment succeeded" event could be accepted outright
 * if the signing secret were ever missing or misconfigured.
 *
 * Required pattern for a future payment webhook handler:
 *   1. verifyWebhookSignature() below — REQUIRES a configured secret;
 *      throws (never silently passes) if the secret is missing. Missing
 *      secret = reject the request, not "process unverified."
 *   2. Validate a timestamp/nonce from the provider's payload against a
 *      tolerance window (e.g. reject anything older than 5 minutes) —
 *      provider-specific, implement alongside the real integration.
 *   3. isEventAlreadyProcessed() / markEventProcessed() below — a
 *      persisted, unique-constrained record of provider event IDs, checked
 *      BEFORE any side effect runs. A payment provider is expected to
 *      redeliver the same event; processing it twice must be impossible,
 *      not just unlikely.
 *   4. Every state change (Payment created/updated, Order/SOA effects)
 *      happens inside one `prisma.$transaction`, the same discipline
 *      already used by confirmPaymentAction and autoCreateJobOrderForOrder
 *      elsewhere in this codebase — never partially applied.
 */

export class WebhookVerificationError extends Error {}

/**
 * Verifies an HMAC-SHA256 webhook signature against a REQUIRED secret.
 * Throws WebhookVerificationError — never returns `true` — if the secret
 * is missing, empty, the signature header is absent/malformed, or the
 * computed digest doesn't match. There is no "unverified but allowed"
 * path here by design: a future caller integrating a payment provider
 * must supply a real secret before this ever returns.
 */
export function verifyWebhookSignature(params: {
  rawBody: string;
  signatureHeader: string | null;
  secret: string | undefined | null;
  /** e.g. "sha256=" for Meta-style headers, "" if the provider sends a bare hex digest. */
  headerPrefix?: string;
}): true {
  const { rawBody, signatureHeader, secret, headerPrefix = "" } = params;

  if (!secret) {
    throw new WebhookVerificationError(
      "Webhook signing secret is not configured — refusing to process an unverifiable event. Configure the provider's signing secret before this webhook can accept traffic."
    );
  }
  if (!signatureHeader || !signatureHeader.startsWith(headerPrefix)) {
    throw new WebhookVerificationError("Missing or malformed webhook signature header.");
  }

  const provided = signatureHeader.slice(headerPrefix.length);
  const expected = createHmac("sha256", secret).update(rawBody).digest("hex");

  let valid: boolean;
  try {
    valid = timingSafeEqual(Buffer.from(expected, "hex"), Buffer.from(provided, "hex"));
  } catch {
    valid = false; // length mismatch, non-hex payload, etc. — never treat as valid
  }
  if (!valid) throw new WebhookVerificationError("Webhook signature verification failed.");

  return true;
}

/**
 * Idempotency check against a persisted, provider-issued event ID.
 * `WebhookEvent` does not exist as a schema model yet (no payment gateway
 * is integrated) — this is the intended shape for when one is: a table
 * with a UNIQUE constraint on (provider, providerEventId), checked and
 * inserted inside the same transaction that records the resulting payment,
 * so a redelivered event is rejected by the database itself under
 * concurrent delivery, not just by an application-level check that could
 * race. Left unimplemented (not a stub that silently "passes") so it's
 * never accidentally imported and trusted before the real table exists.
 */
export function isEventAlreadyProcessed(): never {
  throw new Error(
    "isEventAlreadyProcessed() is a documented pattern, not a working implementation — add a WebhookEvent model (provider, providerEventId UNIQUE, processedAt) and check/insert it inside the same $transaction as the payment write when the real payment webhook is built."
  );
}
