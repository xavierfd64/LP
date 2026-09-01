import { getBusinessSettings, formatBusinessAddress } from "@/lib/business-settings";
import { documentQrDataUrl } from "@/lib/qr-code";
import { PrintButton } from "./print-button";
import { BrandLogo } from "@/components/branding/brand-logo";

/**
 * Shared layout for the Quotation/Invoice/Job Order document pages
 * (app/(print)/**) — same header, branding, typography, and footer across
 * all three, only the title and body content differ. Branding is read live
 * from Business Settings on every render (no hard-coded business identity),
 * so an Admin's changes to name/logo/address/contact propagate immediately.
 * Deliberately outside the app Shell (see app/(print)/layout.tsx) — no
 * sidebar or nav to fight with when printing.
 */
export async function DocumentShell({
  title,
  documentNumber,
  qrPath,
  children,
  headerAction,
}: {
  title: string;
  documentNumber?: string;
  /** Internal app path this document's own detail page lives at (e.g. `/orders/{id}`) — when set, a QR code linking straight there renders next to the document number, same placement the "New Reference Number + QR Code" reference illustration shows. Omit for document types that don't have (or shouldn't expose) a QR yet. */
  qrPath?: string;
  children: React.ReactNode;
  /** Overrides the default "Print / Save as PDF" button — used by the public document-sharing page, where printing is only offered for View + Download links (enforced server-side, not just by omitting this). Pass `null` to show nothing. */
  headerAction?: React.ReactNode | null;
}) {
  const settings = await getBusinessSettings();
  const address = formatBusinessAddress(settings);
  const contactBits = [settings.contactNumber, settings.email].filter(Boolean);
  const qrDataUrl = qrPath ? await documentQrDataUrl(qrPath) : null;

  return (
    <div className="mx-auto max-w-3xl bg-white p-6 text-slate-900 sm:p-10 print:max-w-none print:p-0">
      {headerAction === undefined ? <PrintButton /> : headerAction}

      <header className="flex flex-col gap-4 border-b-2 border-brand-600 pb-6 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex items-start gap-3">
          <BrandLogo src={settings.logoPath} alt={settings.businessName} size={64} />
          <div className="min-w-0">
            <p className="text-lg font-bold text-slate-900">{settings.businessName}</p>
            {settings.tagline && <p className="text-sm text-slate-500">{settings.tagline}</p>}
            {address && <p className="mt-1 text-xs text-slate-500">{address}</p>}
            {contactBits.length > 0 && <p className="text-xs text-slate-500">{contactBits.join(" · ")}</p>}
          </div>
        </div>
        <div className="flex shrink-0 items-start gap-3 sm:justify-end">
          <div className="text-left sm:text-right">
            <p className="text-2xl font-bold uppercase tracking-wide text-brand-700">{title}</p>
            {documentNumber && <p className="text-sm text-slate-500">{documentNumber}</p>}
          </div>
          {qrDataUrl && (
            // eslint-disable-next-line @next/next/no-img-element -- a data: URI, not an optimizable remote asset
            <div className="shrink-0 text-center print:break-inside-avoid">
              <img src={qrDataUrl} alt={`QR code for ${documentNumber ?? title}`} width={72} height={72} className="rounded border border-slate-200" />
              <p className="mt-1 text-[9px] leading-tight text-slate-400">Scan to view</p>
            </div>
          )}
        </div>
      </header>

      <main className="space-y-6 py-6">{children}</main>

      <footer className="break-inside-avoid border-t border-slate-200 pt-4 text-center text-xs text-slate-400">
        {settings.businessName}
        {settings.tagline ? ` · ${settings.tagline}` : ""} — Generated {new Date().toLocaleString("en-PH")}
      </footer>
    </div>
  );
}

/** A labeled two-column meta block (e.g. "Quotation Number" / "QT-2026-0001") — used for the transaction-info and customer-info panels every document type shows. */
export function DocumentField({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div>
      <p className="text-[11px] font-medium uppercase tracking-wide text-slate-400">{label}</p>
      <p className="text-sm text-slate-900">{value || "—"}</p>
    </div>
  );
}

export function DocumentSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="break-inside-avoid">
      <h2 className="mb-2 text-xs font-semibold uppercase tracking-wide text-brand-700">{title}</h2>
      {children}
    </section>
  );
}
