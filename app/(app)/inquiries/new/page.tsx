import { requireUser } from "@/lib/session";
import { EditorShell, EditorHeader } from "@/components/documents/editor-shell";
import { InquiryForm } from "./inquiry-form";

export default async function NewInquiryPage() {
  const user = await requireUser();
  const isStaffLike = user.role === "STAFF" || user.role === "ADMIN";

  return (
    <EditorShell className="max-w-3xl">
      <EditorHeader eyebrow="Inquiry" title="New Inquiry" subtitle="Tell us what you need — select a service and describe your requirements." />
      <InquiryForm showCustomerPicker={isStaffLike} />
    </EditorShell>
  );
}
