import { notFound, redirect } from "next/navigation";
import Link from "next/link";
import { requireUser } from "@/lib/session";
import { can } from "@/lib/permissions-guard";
import { prisma } from "@/lib/prisma";
import { QcChecklistView } from "./qc-checklist-view";

export default async function QcChecklistPage({ params, searchParams }: PageProps<"/job-orders/[id]/qc-checklist">) {
  const { id } = await params;
  const sp = await searchParams;
  const user = await requireUser();
  const isStaffLike = user.role === "STAFF" || user.role === "ADMIN";
  const canMark = user.role === "PRODUCTION" || (isStaffLike && (await can(user, "PRODUCTION_MARK_COMPLETE")));
  if (!canMark) redirect(`/job-orders/${id}`);

  const jo = await prisma.jobOrder.findUnique({
    where: { id },
    include: {
      order: { include: { customer: true } },
      stageLogs: { where: { status: "IN_PROGRESS" }, orderBy: { createdAt: "desc" }, take: 1, include: { assignedTo: true } },
      customerForm: { include: { items: { orderBy: { sortOrder: "asc" }, include: { qcCheckedBy: true } } } },
    },
  });
  if (!jo) notFound();
  if (jo.status !== "QC") redirect(`/job-orders/${id}`);
  if (!jo.customerForm || jo.customerForm.items.length === 0) redirect(`/job-orders/${id}`);

  const errorMsg = typeof sp.error === "string" ? sp.error : undefined;

  return (
    <div className="mx-auto max-w-6xl space-y-4">
      <nav className="text-xs text-slate-400">
        <Link href="/production" className="hover:underline">Production</Link> ›{" "}
        <Link href="/job-orders" className="hover:underline">Job Orders</Link> ›{" "}
        <Link href={`/job-orders/${jo.id}`} className="hover:underline">{jo.joNumber}</Link> › QC Checklist
      </nav>
      <QcChecklistView
        jobOrder={{
          id: jo.id,
          joNumber: jo.joNumber,
          productType: jo.productType,
          customerName: jo.order.customer.name,
          quantity: jo.quantity,
          deadline: jo.deadline ? jo.deadline.toISOString() : null,
          startedAt: jo.stageLogs[0]?.createdAt ? jo.stageLogs[0].createdAt.toISOString() : null,
          assignedToName: jo.stageLogs[0]?.assignedTo?.name ?? null,
        }}
        items={jo.customerForm.items.map((i) => ({
          id: i.id,
          name: i.name,
          qty: i.qty,
          specs: (i.specs as Record<string, string> | null) ?? {},
          qcChecked: i.qcChecked,
          qcCheckedAt: i.qcCheckedAt ? i.qcCheckedAt.toISOString() : null,
          qcCheckedByName: i.qcCheckedBy?.name ?? null,
        }))}
        currentUserName={user.name ?? "You"}
        errorMsg={errorMsg}
      />
    </div>
  );
}
