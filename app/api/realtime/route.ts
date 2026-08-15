import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { subscribeUser, type RealtimeEvent } from "@/lib/realtime";
import { triggerResponseReminderSweepIfDue } from "@/lib/response-reminders";
import { triggerFallbackAssignmentSweepIfDue } from "@/lib/auto-assignment";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const session = await auth();
  if (!session?.user) return new Response("Unauthorized", { status: 401 });

  const userId = session.user.id;
  const dbUser = await prisma.user.findUnique({ where: { id: userId }, select: { active: true } });
  if (!dbUser?.active) return new Response("Unauthorized", { status: 401 });

  // No cron/job runner in this stack — piggyback the 24h response-reminder
  // sweep and the MANUAL_WITH_AUTO_FALLBACK assignment sweep on SSE
  // connections (each independently debounced), since every active user
  // keeps one open. Fire-and-forget: never block the connection on it.
  void triggerResponseReminderSweepIfDue();
  void triggerFallbackAssignmentSweepIfDue();

  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    start(controller) {
      const send = (event: RealtimeEvent | { type: "connected" }) => {
        try {
          controller.enqueue(encoder.encode(`data: ${JSON.stringify(event)}\n\n`));
        } catch {
          // controller already closed (client disconnected) — ignore
        }
      };

      send({ type: "connected" });
      const unsubscribe = subscribeUser(userId, send);

      const heartbeat = setInterval(() => {
        try {
          controller.enqueue(encoder.encode(`: heartbeat\n\n`));
        } catch {
          clearInterval(heartbeat);
        }
      }, 20000);

      req.signal.addEventListener("abort", () => {
        clearInterval(heartbeat);
        unsubscribe();
        try {
          controller.close();
        } catch {
          // already closed
        }
      });
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    },
  });
}
