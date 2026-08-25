"use client";

import { Modal, ModalHeader, ModalBody } from "@/components/ui/modal";
import { QuotationForm } from "./new/quotation-form";

/**
 * "New Quotation" as a dialogue box (Aug 25 update 1) — reuses the exact
 * same QuotationForm the dedicated /quotations/new page renders, so every
 * existing behavior (customer/service search, line items, discount/tax,
 * preview, draft/send) stays identical; only how you reach the form
 * changes. On success the form's own server action still redirects to the
 * new quotation's detail page, which naturally closes this dialogue by
 * navigating away — no separate "refresh the list" wiring needed.
 */
export function NewQuotationModal({ open, onClose, canSend }: { open: boolean; onClose: () => void; canSend: boolean }) {
  return (
    <Modal open={open} onClose={onClose} maxWidthClassName="max-w-4xl">
      <ModalHeader title="New Quotation" subtitle="Prepare a quotation for customer approval." onClose={onClose} />
      <ModalBody>
        <QuotationForm canSend={canSend} onCancel={onClose} />
      </ModalBody>
    </Modal>
  );
}
