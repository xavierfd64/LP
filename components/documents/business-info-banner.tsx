import { getBusinessSettings, formatBusinessAddress } from "@/lib/business-settings";
import { BrandLogo } from "@/components/branding/brand-logo";

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
      <BrandLogo src={settings.logoPath} alt={settings.businessName} size={40} />
      <div className="min-w-0 text-sm">
        <p className="font-semibold text-slate-900">{settings.businessName}</p>
        <p className="truncate text-xs text-slate-500">{[address, ...contactBits].filter(Boolean).join(" · ") || "—"}</p>
      </div>
    </div>
  );
}
