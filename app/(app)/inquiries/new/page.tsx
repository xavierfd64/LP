import { redirect } from "next/navigation";
import { MessageSquarePlus } from "lucide-react";
import { requireUser } from "@/lib/session";
import { getCurrentCustomer } from "@/lib/current-customer";
import { BusinessInfoBanner } from "@/components/documents/business-info-banner";
import { EditorShell, EditorHeader } from "@/components/documents/editor-shell";
import { InquiryForm } from "./inquiry-form";

export default async function NewInquiryPage() {
  const user = await requireUser();
  // Aug 22 3rd update — Inquiries are submitted by Customers only. Admin/
  // Staff review customer inquiries and create Quotations directly; they
  // no longer have a route into this form.
  if (user.role !== "CUSTOMER") redirect("/inquiries");
  const customer = await getCurrentCustomer(user.id);

  return (
    <EditorShell className="max-w-3xl">
      <EditorHeader
        eyebrow="Inquiry"
        title={
          <span className="flex items-center gap-2">
            <MessageSquarePlus className="h-6 w-6 text-brand-600" />
            New Inquiry
          </span>
        }
        subtitle="Tell us what you need — select a service and describe your requirements."
      />
      <BusinessInfoBanner />
      <InquiryForm
        customer={{ name: customer.name, email: customer.email, contactNumber: customer.contactNumber, displayId: customer.displayId }}
      />
    </EditorShell>
  );
}
