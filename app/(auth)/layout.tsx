import Image from "next/image";
import { getBusinessSettings } from "@/lib/business-settings";

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
        {settings.logoPath ? (
          <div className="flex h-16 w-16 items-center justify-center rounded-xl bg-white p-2 shadow-lg md:h-24 md:w-24">
            <Image
              src={settings.logoPath}
              alt={settings.businessName}
              width={96}
              height={96}
              className="h-full w-full object-contain"
              unoptimized
            />
          </div>
        ) : (
          <div className="flex h-16 w-16 items-center justify-center rounded-xl bg-white text-2xl font-bold text-brand-600 shadow-lg md:h-24 md:w-24 md:text-4xl">
            {settings.businessName.charAt(0)}
          </div>
        )}
        <div className="text-center">
          <h1 className="text-xl font-bold md:text-3xl">{settings.businessName}</h1>
          {settings.tagline && <p className="mt-1 text-sm text-brand-100 md:text-base">{settings.tagline}</p>}
        </div>
        {settings.description && (
          <p className="hidden max-w-sm text-center text-sm text-brand-100 md:block">{settings.description}</p>
        )}
      </div>

      {/* Form panel */}
      <div className="flex flex-1 items-center justify-center bg-white px-4 py-10 sm:px-6 md:w-1/2">
        <div className="w-full max-w-sm">{children}</div>
      </div>
    </div>
  );
}
