import Link from "next/link";
import { PackageSearch } from "lucide-react";
import { getBusinessSettings, formatBusinessAddress } from "@/lib/business-settings";
import { getPublicOrderTrackingAction } from "@/app/actions/public-tracking";
import { TrackingView } from "./tracking-view";
import { BrandLogo } from "@/components/branding/brand-logo";

export default async function OrderTrackingPage({ params }: PageProps<"/track/[token]">) {
  const { token } = await params;
  const [settings, result] = await Promise.all([getBusinessSettings(), getPublicOrderTrackingAction(token)]);
  const address = formatBusinessAddress(settings);
  const contactBits = [settings.contactNumber, settings.email].filter(Boolean);

  return (
    <div className="mx-auto max-w-lg space-y-4 p-4 sm:p-6">
      <header className="flex items-center gap-3 rounded-lg border border-slate-200 bg-white p-4">
        <BrandLogo src={settings.logoPath} alt={settings.businessName} size={44} />
        <div className="min-w-0">
          <p className="font-bold text-slate-900">{settings.businessName}</p>
          {settings.tagline && <p className="text-xs text-slate-500">{settings.tagline}</p>}
        </div>
      </header>

      {result.ok ? (
        <TrackingView token={token} initial={result.data} />
      ) : (
        <div className="rounded-lg border border-slate-200 bg-white p-6 text-center">
          <PackageSearch className="mx-auto mb-2 h-8 w-8 text-slate-300" />
          <p className="font-medium text-slate-900">This tracking link is no longer available.</p>
          <p className="mt-1 text-sm text-slate-500">Please contact us for assistance, or track another order below.</p>
          <Link href="/track" className="mt-3 inline-block text-sm font-medium text-brand-600 underline">
            Track Your Order
          </Link>
        </div>
      )}

      <footer className="rounded-lg border border-slate-200 bg-white p-4 text-center text-xs text-slate-500">
        <p className="font-medium text-slate-700">Contact Us</p>
        {address && <p>{address}</p>}
        {contactBits.length > 0 && <p>{contactBits.join(" · ")}</p>}
        {!address && contactBits.length === 0 && <p>—</p>}
      </footer>
    </div>
  );
}
