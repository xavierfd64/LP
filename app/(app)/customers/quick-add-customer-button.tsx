"use client";

import { useState } from "react";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { QuickAddCustomerModal } from "@/components/customers/customer-picker";
import type { CustomerSearchResult } from "@/app/actions/customers";

export function QuickAddCustomerButton({ onCreated }: { onCreated: (c: CustomerSearchResult) => void }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button onClick={() => setOpen(true)}>
        <Plus className="h-4 w-4" /> New Customer
      </Button>
      {open && (
        <QuickAddCustomerModal
          initialName=""
          onClose={() => setOpen(false)}
          onCreated={(c) => {
            onCreated(c);
            setOpen(false);
          }}
        />
      )}
    </>
  );
}
