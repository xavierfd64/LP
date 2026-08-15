import Image from "next/image";
import { getBusinessSettings } from "@/lib/business-settings";

/**
 * Subtle branded strip for transaction-facing pages (Quotations, Orders,
 * Payments) — logo, business name, and contact info, all sourced from the
 * centralized BusinessSettings so it reflects admin changes automatically
 * with no per-page hard-coding. Deliberately compact: one row, no call to
 * action, so it doesn't compete with the transaction content below it.
 */
export async function TransactionBrandHeader() {
  const settings = await getBusinessSettings();
  const contactBits = [settings.contactNumber, settings.email].filter(Boolean);

  return (
    <div className="flex items-center gap-3 rounded-md border border-slate-100 bg-slate-50 px-4 py-2">
      {settings.logoPath ? (
        <Image
          src={settings.logoPath}
          alt={settings.businessName}
          width={28}
          height={28}
          className="h-7 w-7 shrink-0 rounded object-contain"
          unoptimized
        />
      ) : (
        <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded bg-brand-600 text-xs font-bold text-white">
          {settings.businessName.charAt(0)}
        </div>
      )}
      <div className="min-w-0 leading-tight">
        <p className="truncate text-sm font-semibold text-slate-900">{settings.businessName}</p>
        {contactBits.length > 0 && <p className="truncate text-xs text-slate-500">{contactBits.join(" · ")}</p>}
      </div>
    </div>
  );
}
