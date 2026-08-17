"use client";

import { Printer } from "lucide-react";
import { Button } from "@/components/ui/button";

/** Browser-native print / Save-as-PDF — no PDF-generation dependency needed, and it's what "print or saved as PDF" means in practice for a document this simple. Hidden in the printed output itself via print:hidden. */
export function PrintButton() {
  return (
    <div className="mb-4 flex justify-end gap-2 print:hidden">
      <Button type="button" onClick={() => window.print()}>
        <Printer className="mr-1.5 h-4 w-4" />
        Print / Save as PDF
      </Button>
    </div>
  );
}
