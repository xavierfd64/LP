import Image from "next/image";
import { getBusinessSettings, formatBusinessAddress } from "@/lib/business-settings";

/**
 * Compact "Business Information" header for the Quotation/Order/Job Order
 * preparation screens (distinct from DocumentShell's full print header) —
 * same centralized Business Settings source, so branding changes propagate
 * everywhere without hard-coding.
 */
export async function BusinessInfoBanner() {
  const settings = await getBusinessSettings();
  const address = formatBusinessAddress(settings);
  const contactBits = [settings.contactNumber, settings.email].filter(Boolean);

  return (
    <div className="flex items-center gap-3 rounded-lg border border-slate-200 bg-slate-50 p-3">
      {settings.logoPath ? (
        <Image
          src={settings.logoPath}
          alt={settings.businessName}
          width={40}
          height={40}
          className="h-10 w-10 shrink-0 object-contain"
          unoptimized
        />
      ) : (
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded bg-brand-600 text-lg font-bold text-white">
          {settings.businessName.charAt(0)}
        </div>
      )}
      <div className="min-w-0 text-sm">
        <p className="font-semibold text-slate-900">{settings.businessName}</p>
        <p className="truncate text-xs text-slate-500">{[address, ...contactBits].filter(Boolean).join(" · ") || "—"}</p>
      </div>
    </div>
  );
}
