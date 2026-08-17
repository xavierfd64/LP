import Link from "next/link";
import Image from "next/image";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { getBusinessSettings, formatBusinessAddress } from "@/lib/business-settings";
import { ReferenceLookupForm } from "@/components/tracking/reference-lookup-form";

// Anonymous visitors see the public tracking landing page below, so branding
// must be fetched fresh at request time rather than baked in at build time
// (same reasoning as the (auth) layout's business-branding fetch).
export const dynamic = "force-dynamic";

export default async function Home() {
  const session = await auth();
  if (session?.user) {
    switch (session.user.role) {
      case "ADMIN":
        redirect("/admin/dashboard");
      case "PRODUCTION":
        redirect("/production");
      default:
        redirect("/dashboard");
    }
  }

  const settings = await getBusinessSettings();
  const address = formatBusinessAddress(settings);
  const contactBits = [settings.contactNumber, settings.email].filter(Boolean);

  return (
    <div className="min-h-screen bg-slate-50">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-5xl flex-wrap items-center justify-between gap-3 px-4 py-4 sm:px-6">
          <div className="flex items-center gap-3">
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
