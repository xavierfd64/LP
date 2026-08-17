"use client";

import { Printer } from "lucide-react";
import { Button } from "@/components/ui/button";
import { recordDocumentDownloadAction } from "@/app/actions/public-document";

/** Only ever rendered when the link's accessLevel is VIEW_DOWNLOAD (see [token]/page.tsx) — and recordDocumentDownloadAction re-checks that server-side before allowing the print/save to proceed, so a forged request can't download a View-Only document just because this component isn't rendered client-side. */
export function DownloadPdfButton({ token }: { token: string }) {
  async function handleDownload() {
    const allowed = await recordDocumentDownloadAction(token);
    if (allowed) window.print();
  }

  return (
    <div className="mb-4 flex justify-end gap-2 print:hidden">
      <Button type="button" onClick={handleDownload}>
        <Printer className="mr-1.5 h-4 w-4" />
        Download PDF
      </Button>
    </div>
  );
}
