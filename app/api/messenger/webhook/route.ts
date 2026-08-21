import { createHmac, timingSafeEqual } from "crypto";
import { getBusinessSettings } from "@/lib/business-settings";
import { decryptSecret } from "@/lib/email-crypto";
import { handleMessengerOptin } from "@/lib/messenger";

export const dynamic = "force-dynamic";

/**
 * Meta's webhook subscription handshake — GET with hub.mode=subscribe,
 * hub.verify_token, hub.challenge. Meta requires the raw challenge string
 * echoed back verbatim on success.
 */
export async function GET(req: Request) {
  const settings = await getBusinessSettings();
  const { searchParams } = new URL(req.url);
  const mode = searchParams.get("hub.mode");
  const token = searchParams.get("hub.verify_token");
  const challenge = searchParams.get("hub.challenge");

  if (mode === "subscribe" && settings.messengerVerifyToken && token === settings.messengerVerifyToken) {
    return new Response(challenge ?? "", { status: 200 });
  }
  return new Response("Forbidden", { status: 403 });
}

function verifySignature(raw: string, header: string | null, appSecret: string): boolean {
  if (!header?.startsWith("sha256=")) return false;
  const expected = createHmac("sha256", appSecret).update(raw).digest("hex");
  const provided = header.slice("sha256=".length);
  try {
    return timingSafeEqual(Buffer.from(expected, "hex"), Buffer.from(provided, "hex"));
  } catch {
    return false;
  }
}

type MessengerEvent = {
  sender?: { id?: string };
  optin?: { ref?: string };
  referral?: { ref?: string };
};
type MessengerEntry = { messaging?: MessengerEvent[] };

/**
 * Receives opt-in events after a customer taps the m.me deep link and
 * messages the Page — matches the PSID Meta hands us to the pending
 * MessengerConnection by its ref code (see lib/messenger.ts). Verifies the
 * request really came from Meta via X-Hub-Signature-256 whenever an App
 * Secret is configured; without one, the request is processed unverified
 * (same honest-stub tradeoff as the rest of this integration — real,
 * working code, gated on credentials this environment can't obtain itself).
 *
 * SECURITY NOTE (hardening pass #2, finding H3): this fail-open-when-
 * unconfigured behavior is a deliberately accepted trade-off for Messenger
 * specifically — the worst case is a forged opt-in event linking an
 * arbitrary PSID to a connection ref an attacker would already need to
 * know, with no financial or customer-data impact, and forcing this
 * fail-closed would break Messenger for any deployment that hasn't set an
 * App Secret yet. This pattern must NOT be reused for a future payment
 * webhook, where the same gap would mean a forged "payment succeeded"
 * event could be accepted if the secret were ever missing. See
 * lib/webhook-security.ts for the fail-closed pattern (mandatory secret,
 * timestamp/replay checks, persisted idempotency, one transaction) that a
 * real payment webhook handler must use instead.
 */
export async function POST(req: Request) {
  const raw = await req.text();
  const settings = await getBusinessSettings();

  if (settings.messengerAppSecretEnc) {
    const signature = req.headers.get("x-hub-signature-256");
    if (!verifySignature(raw, signature, decryptSecret(settings.messengerAppSecretEnc))) {
      return new Response("Invalid signature", { status: 401 });
    }
  }

  const body = JSON.parse(raw || "{}") as { entry?: MessengerEntry[] };
  for (const entry of body.entry ?? []) {
    for (const event of entry.messaging ?? []) {
      const psid = event.sender?.id;
      const ref = event.optin?.ref ?? event.referral?.ref;
      if (psid && ref) await handleMessengerOptin(psid, ref);
    }
  }

  return Response.json({ ok: true });
}
