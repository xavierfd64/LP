"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { NewOrderModal } from "./new-order-modal";

export function NewOrderTrigger() {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button onClick={() => setOpen(true)}>+ New Order</Button>
      <NewOrderModal open={open} onClose={() => setOpen(false)} />
    </>
  );
}
