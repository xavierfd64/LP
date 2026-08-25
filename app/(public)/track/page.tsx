import Link from "next/link";
import { getBusinessSettings, formatBusinessAddress } from "@/lib/business-settings";
import { ReferenceLookupForm } from "@/components/tracking/reference-lookup-form";
import { BrandLogo } from "@/components/branding/brand-logo";

// Same tracking-by-reference content as "/", but deliberately session-free:
// "/" redirects an authenticated visitor to their dashboard, which is
// correct for the root landing page but wrong for the Track Order button
// on /login — clicking it right after logging out could land back on "/"
// while a session cookie was still (or appeared to be) valid, looking like
// an automatic re-login. This page never reads `auth()` at all, so it
// can't redirect based on session state under any circumstance — it is
// always the plain public tracking form, logged in or not.
export const dynamic = "force-dynamic";

export default async function TrackPage() {
  const settings = await getBusinessSettings();
  const address = formatBusinessAddress(settings);
  const contactBits = [settings.contactNumber, settings.email].filter(Boolean);

  return (
    <div className="min-h-screen bg-slate-50">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-5xl flex-wrap items-center justify-between gap-3 px-4 py-4 sm:px-6">
          <div className="flex items-center gap-3">
            <BrandLogo src={settings.logoPath} alt={settings.businessName} size={40} />
            <div>
              <p className="font-bold leading-tight text-slate-900">{settings.businessName}</p>
              {settings.tagline && <p className="text-xs text-slate-500">{settings.tagline}</p>}
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Link href="/login" className="rounded-md px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-100">
              Sign In
            </Link>
            <Link href="/register" className="rounded-md bg-brand-600 px-3 py-2 text-sm font-medium text-white hover:bg-brand-700">
              Create Account
            </Link>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-lg space-y-6 px-4 py-8 sm:px-6 sm:py-12">
        <div className="text-center">
          <h1 className="text-2xl font-bold text-slate-900 sm:text-3xl">Track Your Order</h1>
          <p className="mt-2 text-sm text-slate-500">
            Enter your quotation, invoice, job order, or order number to check the latest status — no account required.
          </p>
        </div>

        <div className="rounded-lg border border-slate-200 bg-white p-4 sm:p-6">
          <ReferenceLookupForm />
        </div>

        <div className="rounded-lg border border-slate-200 bg-white p-4 text-center text-sm text-slate-600">
          <p>
            Have an account?{" "}
            <Link href="/login" className="font-medium text-brand-600 underline">
              Sign in
            </Link>{" "}
            for your full order history and rewards.
          </p>
        </div>

        <footer className="rounded-lg border border-slate-200 bg-white p-4 text-center text-xs text-slate-500">
          <p className="font-medium text-slate-700">Contact Us</p>
          {address && <p>{address}</p>}
          {contactBits.length > 0 && <p>{contactBits.join(" · ")}</p>}
          {!address && contactBits.length === 0 && <p>—</p>}
        </footer>
      </main>
    </div>
  );
}
