import { redirect } from "next/navigation";
import { requireUser } from "@/lib/session";
import { can } from "@/lib/permissions-guard";
import { prisma } from "@/lib/prisma";
import { Card, CardContent } from "@/components/ui/card";
import { formatDateTime } from "@/lib/utils";

/**
 * Read-only visibility into feedback on the Graphic Artist's own design
 * work — reuses the existing Message model's refJobOrderId (the same
 * "Reference Transaction" link Staff already attach messages to
 * elsewhere, see COMMUNICATION_REFERENCE_TRANSACTION) rather than a new,
 * disconnected feedback system. Scoped to job orders this account has (or
 * has had) a design-stage responsibility on — never the full messaging
 * inbox, which needs COMMUNICATION_VIEW, a broader permission this page
 * deliberately doesn't require.
 */
export default async function DesignFeedbackPage() {
  const user = await requireUser();
  if (!["ADMIN", "STAFF"].includes(user.role) || !(await can(user, "DESIGN_VIEW"))) redirect("/dashboard");

  const myJobOrderIds = await prisma.jobOrderStageLog.findMany({
    where: { isDesignStage: true, assignedToId: user.id },
    select: { jobOrderId: true },
    distinct: ["jobOrderId"],
  });
  const jobOrderIds = myJobOrderIds.map((l) => l.jobOrderId);

  const messages = jobOrderIds.length
    ? await prisma.message.findMany({
        where: { refJobOrderId: { in: jobOrderIds } },
        include: { sender: true, refJobOrder: { include: { order: { include: { customer: true } } } } },
        orderBy: { createdAt: "desc" },
        take: 100,
      })
    : [];

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">Feedback</h1>
        <p className="mt-1 text-sm text-slate-500">Feedback and comments on your assigned design work.</p>
      </div>
      <Card>
        <CardContent className="divide-y divide-slate-100 p-0">
          {messages.length === 0 && <p className="px-5 py-10 text-center text-sm text-slate-400">No feedback yet on your design work.</p>}
          {messages.map((m) => (
            <div key={m.id} className="px-5 py-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="text-sm font-semibold text-slate-900">{m.sender.name}</p>
                <p className="text-xs text-slate-400">{formatDateTime(m.createdAt)}</p>
              </div>
              {m.refJobOrder && (
                <p className="text-xs text-slate-400">
                  {m.refJobOrder.joNumber} — {m.refJobOrder.order.customer.name}
                </p>
              )}
              <p className="mt-1 text-sm text-slate-700">{m.body}</p>
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}
