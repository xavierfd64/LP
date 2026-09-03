"use client";

import { Modal, ModalHeader, ModalBody } from "@/components/ui/modal";
import { HistoricalOrderForm } from "./new/historical-order-form";

/**
 * "Encode Old Order" (Historical Transaction Encoding, Sept 3) — the
 * controlled counterpart to NewOrderModal for an order that actually
 * happened in the past but was never entered at the time. See
 * HistoricalOrderForm for the reused building blocks.
 */
export function HistoricalOrderModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  return (
    <Modal open={open} onClose={onClose} maxWidthClassName="max-w-4xl">
      <ModalHeader
        title="Encode Old Order"
        subtitle="Record an order that already happened but was never entered into LP System."
        onClose={onClose}
      />
      <ModalBody>
        <HistoricalOrderForm onCancel={onClose} />
      </ModalBody>
    </Modal>
  );
}
