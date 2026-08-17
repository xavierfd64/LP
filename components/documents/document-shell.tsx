import Image from "next/image";
import { getBusinessSettings, formatBusinessAddress } from "@/lib/business-settings";
import { PrintButton } from "./print-button";

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
  children,
}: {
  title: string;
  documentNumber?: string;
  children: React.ReactNode;
}) {
  const settings = await getBusinessSettings();
  const address = formatBusinessAddress(settings);
  const contactBits = [settings.contactNumber, settings.email].filter(Boolean);

  return (
    <div className="mx-auto max-w-3xl bg-white p-6 text-slate-900 sm:p-10 print:max-w-none print:p-0">
      <PrintButton />

      <header className="flex flex-col gap-4 border-b-2 border-brand-600 pb-6 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex items-start gap-3">
          {settings.logoPath ? (
            <Image
              src={settings.logoPath}
              alt={settings.businessName}
              width={64}
              height={64}
              className="h-16 w-16 shrink-0 object-contain"
              unoptimized
            />
          ) : (
            <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded bg-brand-600 text-2xl font-bold text-white">
              {settings.businessName.charAt(0)}
            </div>
          )}
          <div className="min-w-0">
            <p className="text-lg font-bold text-slate-900">{settings.businessName}</p>
            {settings.tagline && <p className="text-sm text-slate-500">{settings.tagline}</p>}
            {address && <p className="mt-1 text-xs text-slate-500">{address}</p>}
            {contactBits.length > 0 && <p className="text-xs text-slate-500">{contactBits.join(" · ")}</p>}
          </div>
        </div>
        <div className="shrink-0 text-left sm:text-right">
          <p className="text-2xl font-bold uppercase tracking-wide text-brand-700">{title}</p>
          {documentNumber && <p className="text-sm text-slate-500">{documentNumber}</p>}
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
