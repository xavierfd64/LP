import { runResponseReminderSweep } from "@/lib/response-reminders";

export const dynamic = "force-dynamic";

/**
 * Dedicated endpoint for a real external scheduler (platform cron, GitHub
 * Actions schedule, system crontab hitting this URL, etc.) to trigger the
 * 24h no-response reminder sweep on a precise cadence — the SSE route's
 * opportunistic trigger (lib/response-reminders.ts) covers the common case
 * without any setup, but only runs when someone has the app open. Protected
 * by a shared secret since it has no user session to check; unset
 * CRON_SECRET disables the route entirely rather than leaving it open.
 */
export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    return Response.json({ error: "CRON_SECRET is not configured." }, { status: 501 });
  }

  const provided = new URL(req.url).searchParams.get("secret") ?? req.headers.get("x-cron-secret");
  if (provided !== secret) {
    return new Response("Unauthorized", { status: 401 });
  }

  const sent = await runResponseReminderSweep();
  return Response.json({ ok: true, remindersSent: sent });
}
