import { ShieldCheck, Clock, Award } from "lucide-react";
import { getBusinessSettings } from "@/lib/business-settings";
import { BrandLogo } from "@/components/branding/brand-logo";

// Login/register show admin-configured branding (name/logo/tagline). Force
// dynamic rendering so that data is always fetched fresh at request time —
// otherwise Next.js would statically prerender these pages at build time
// (baking in whatever branding existed then) and, in deploy pipelines where
// the database isn't up yet during `next build`, the prerender would fail.
export const dynamic = "force-dynamic";

export default async function AuthLayout({ children }: { children: React.ReactNode }) {
  const settings = await getBusinessSettings();

  return (
    <div className="flex min-h-screen flex-1 flex-col md:flex-row">
      {/* Branding panel — full-width banner on mobile, left column from md up */}
      <div className="flex flex-col items-center justify-center gap-4 bg-brand-600 px-6 py-10 text-white md:w-1/2 md:px-12 md:py-12">
        <div className="flex h-16 w-16 items-center justify-center rounded-xl bg-white p-2 shadow-lg md:h-24 md:w-24">
          <BrandLogo src={settings.logoPath} alt={settings.businessName} size={64} rounded="rounded" className="h-full w-full !bg-transparent text-brand-600" />
        </div>
        <div className="text-center">
          <h1 className="text-xl font-bold md:text-3xl">{settings.businessName}</h1>
          {settings.tagline && <p className="mt-1 text-sm text-brand-100 md:text-base">{settings.tagline}</p>}
        </div>
        {settings.description && (
          <p className="hidden max-w-sm text-center text-sm text-brand-100 md:block">{settings.description}</p>
        )}

        {/* Compact value-prop bullets per Reference B's login panel — generic,
            non-fake supporting copy (not business figures), hidden on mobile
            where the banner is already competing with the form for space. */}
        <ul className="mt-2 hidden w-full max-w-xs flex-col gap-3 text-sm text-brand-50 md:flex">
          <li className="flex items-center gap-2.5">
            <ShieldCheck className="h-4 w-4 shrink-0" /> Quality printing for every job
          </li>
          <li className="flex items-center gap-2.5">
            <Clock className="h-4 w-4 shrink-0" /> Real-time order &amp; production status
          </li>
          <li className="flex items-center gap-2.5">
            <Award className="h-4 w-4 shrink-0" /> Reliable service, every time
          </li>
        </ul>
      </div>

      {/* Form panel */}
      <div className="flex flex-1 items-center justify-center bg-slate-50 px-4 py-10 sm:px-6 md:w-1/2">
        <div className="w-full max-w-sm rounded-xl border border-slate-200 bg-white p-6 shadow-sm sm:p-8">{children}</div>
      </div>
    </div>
  );
}
