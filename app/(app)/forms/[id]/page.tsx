import { notFound, redirect } from "next/navigation";
import { requireUser } from "@/lib/session";
import { can } from "@/lib/permissions-guard";
import { prisma } from "@/lib/prisma";
import { formLinkUrl } from "@/lib/customer-form";
import { FormDetailsView } from "./form-details-view";

export default async function FormDetailsPage({ params }: PageProps<"/forms/[id]">) {
  const { id } = await params;
  const user = await requireUser();
  const isStaffLike = user.role === "STAFF" || user.role === "ADMIN";
  if (!isStaffLike) redirect("/dashboard");
  if (user.role === "STAFF" && !(await can(user, "FORM_VIEW"))) redirect("/dashboard");

  const isAdmin = user.role === "ADMIN";
  const canManageLink = isAdmin || (await can(user, "FORM_MANAGE_LINK"));
  const canEdit = isAdmin || (await can(user, "FORM_EDIT"));
  const canReopen = isAdmin || (await can(user, "FORM_REOPEN"));
  const canUnlockOverride = isAdmin || (await can(user, "FORM_ITEM_UNLOCK_OVERRIDE"));

  const form = await prisma.customerForm.findUnique({
    where: { id },
    include: {
      jobOrder: true,
      order: true,
      customer: true,
      createdBy: true,
      lastReopenedBy: true,
      items: { orderBy: { sortOrder: "asc" }, include: { printedBy: true, qcCheckedBy: true } },
      links: { orderBy: { createdAt: "desc" }, include: { createdBy: true } },
      deliveries: { orderBy: { createdAt: "desc" }, include: { deliveredBy: true } },
      additionalOrders: { orderBy: { createdAt: "desc" }, include: { order: true, addedBy: true } },
    },
  });
  if (!form) notFound();

  const [history, files] = await Promise.all([
    prisma.auditLog.findMany({ where: { entityType: "CustomerForm", entityId: form.id }, include: { actor: true }, orderBy: { createdAt: "desc" } }),
    prisma.file.findMany({ where: { jobOrderId: form.jobOrderId }, include: { uploadedBy: true }, orderBy: { createdAt: "desc" } }),
  ]);

  const activeLink = form.links.find((l) => !l.revokedAt) ?? null;

  return (
    <FormDetailsView
      canManageLink={canManageLink}
      canEdit={canEdit}
      canReopen={canReopen}
      canUnlockOverride={canUnlockOverride}
      form={{
        id: form.id,
        title: form.title,
        formType: form.formType,
        instructions: form.instructions,
        status: form.status,
        deadline: form.deadline ? form.deadline.toISOString() : null,
        notes: form.notes,
        submittedAt: form.submittedAt ? form.submittedAt.toISOString() : null,
        lastReopenedAt: form.lastReopenedAt ? form.lastReopenedAt.toISOString() : null,
        lastReopenedByName: form.lastReopenedBy?.name ?? null,
        lastReopenReason: form.lastReopenReason,
        createdByName: form.createdBy.name,
        createdAt: form.createdAt.toISOString(),
        jobOrderId: form.jobOrderId,
        joNumber: form.jobOrder.joNumber,
        jobOrderStatus: form.jobOrder.status,
        orderId: form.orderId,
        orderNumber: form.order.orderNumber,
        customerId: form.customerId,
        customerName: form.customer.name,
        customerEmail: form.customer.email,
        customerContact: form.customer.contactNumber,
      }}
      items={form.items.map((i) => ({
        id: i.id,
        name: i.name,
        qty: i.qty,
        notes: i.notes,
        specs: (i.specs as Record<string, string> | null) ?? {},
        printed: i.printed,
        printedAt: i.printedAt ? i.printedAt.toISOString() : null,
        printedByName: i.printedBy?.name ?? null,
      }))}
      additionalOrders={form.additionalOrders.map((a) => ({ id: a.id, orderNumber: a.order.orderNumber, addedByName: a.addedBy.name, addedAt: a.createdAt.toISOString(), note: a.note }))}
      activeLinkUrl={activeLink ? formLinkUrl(activeLink.token) : null}
      activeLinkExpiresAt={activeLink?.expiresAt ? activeLink.expiresAt.toISOString() : null}
      deliveries={form.deliveries.map((d) => ({
        id: d.id,
        method: d.method,
        recipient: d.recipient,
        deliveredByName: d.deliveredBy?.name ?? "System",
        status: d.status,
        detail: d.detail,
        createdAt: d.createdAt.toISOString(),
      }))}
      history={history.map((h) => ({ id: h.id, action: h.action, actorName: h.actor?.name ?? "System", changes: (h.changes as Record<string, unknown> | null) ?? {}, createdAt: h.createdAt.toISOString() }))}
      files={files.map((f) => ({ id: f.id, filename: f.filename, category: f.category, uploadedByName: f.uploadedBy.name, createdAt: f.createdAt.toISOString() }))}
    />
  );
}
