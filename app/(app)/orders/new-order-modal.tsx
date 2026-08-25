"use client";

import { Modal, ModalHeader, ModalBody } from "@/components/ui/modal";
import { OrderForm } from "./new/order-form";

/**
 * "New Order" as a dialogue box (Aug 25 update 1) — reuses the exact same
 * OrderForm the dedicated /orders/new page renders (Source picker,
 * customer/quotation search, line items, discount/tax, payment terms),
 * only reached differently. On success the form's own server action still
 * redirects to the new order's detail page, closing this dialogue.
 */
export function NewOrderModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  return (
    <Modal open={open} onClose={onClose} maxWidthClassName="max-w-4xl">
      <ModalHeader title="New Order" subtitle="Create a new order. You can create an order from an approved quotation." onClose={onClose} />
      <ModalBody>
        <OrderForm onCancel={onClose} />
      </ModalBody>
    </Modal>
  );
}
