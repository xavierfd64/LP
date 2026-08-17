import { runStatementScheduleSweep } from "@/lib/statement-schedule-sweep";

export const dynamic = "force-dynamic";

/** Dedicated endpoint for a real external scheduler — mirrors GET /api/cron/response-reminders. The SSE route's opportunistic trigger covers the common case; this is for precise timing. Same CRON_SECRET gate. */
export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    return Response.json({ error: "CRON_SECRET is not configured." }, { status: 501 });
  }

  const provided = new URL(req.url).searchParams.get("secret") ?? req.headers.get("x-cron-secret");
  if (provided !== secret) {
    return new Response("Unauthorized", { status: 401 });
  }

  const sent = await runStatementScheduleSweep();
  return Response.json({ ok: true, statementsSent: sent });
}
