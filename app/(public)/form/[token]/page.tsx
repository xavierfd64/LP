import { resolvePublicCustomerForm } from "@/lib/customer-form";
import { getBusinessSettings, formatBusinessAddress } from "@/lib/business-settings";
import { CustomerFormView } from "./customer-form-view";

export default async function CustomerFormPage({ params }: PageProps<"/form/[token]">) {
  const { token } = await params;
  const [result, settings] = await Promise.all([resolvePublicCustomerForm(token), getBusinessSettings()]);

  if (!result.ok) {
    return (
      <div className="mx-auto max-w-lg p-6">
        <div className="rounded-lg border border-slate-200 bg-white p-6 text-center">
          <p className="font-medium text-slate-900">This form link is no longer available.</p>
          <p className="mt-1 text-sm text-slate-500">Please contact us for assistance.</p>
        </div>
      </div>
    );
  }

  const { form } = result;
  const specFields = Array.isArray(form.jobOrder.service?.specFields) ? (form.jobOrder.service!.specFields as string[]) : [];

  return (
    <CustomerFormView
      token={token}
      business={{
        name: settings.businessName,
        tagline: settings.tagline,
        logoPath: settings.logoPath,
        address: formatBusinessAddress(settings),
        contactNumber: settings.contactNumber,
        email: settings.email,
      }}
      form={{
        id: form.id,
        title: form.title,
        instructions: form.instructions,
        status: form.status,
        deadline: form.deadline ? form.deadline.toISOString() : null,
        notes: form.notes,
        submittedAt: form.submittedAt ? form.submittedAt.toISOString() : null,
        lastReopenedAt: form.lastReopenedAt ? form.lastReopenedAt.toISOString() : null,
        formType: form.formType,
        joNumber: form.jobOrder.joNumber,
        orderNumber: form.jobOrder.order.orderNumber,
        customerName: form.customer.name,
        customerEmail: form.customer.email,
        customerContact: form.customer.contactNumber,
        orderDate: form.jobOrder.createdAt.toISOString(),
        dueDate: form.jobOrder.deadline ? form.jobOrder.deadline.toISOString() : null,
      }}
      specFields={specFields}
      items={form.items.map((i) => ({
        id: i.id,
        name: i.name,
        qty: i.qty,
        notes: i.notes ?? "",
        specs: (i.specs as Record<string, string> | null) ?? {},
        printed: i.printed,
      }))}
    />
  );
}
