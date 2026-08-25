"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { NewQuotationModal } from "./new-quotation-modal";

export function NewQuotationTrigger({ canSend }: { canSend: boolean }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button onClick={() => setOpen(true)}>+ New Quotation</Button>
      <NewQuotationModal open={open} onClose={() => setOpen(false)} canSend={canSend} />
    </>
  );
}
