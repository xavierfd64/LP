import Link from "next/link";
import { BrandLogo } from "@/components/branding/brand-logo";

/**
 * Shared by /track and /track/[token] — the public tracking pages both
 * carry the exact same top bar (dynamic business branding + Sign In/Create
 * Account), so it's defined once rather than duplicated per page.
 */
export function TrackHeader({
  businessName,
  tagline,
  logoPath,
}: {
  businessName: string;
  tagline: string | null;
  logoPath: string | null;
}) {
  return (
    <header className="border-b border-slate-200 bg-white">
      <div className="mx-auto flex max-w-5xl flex-wrap items-center justify-between gap-3 px-4 py-4 sm:px-6">
        <div className="flex items-center gap-3">
          <BrandLogo src={logoPath} alt={businessName} size={40} />
          <div>
            <p className="font-bold leading-tight text-slate-900">{businessName}</p>
            {tagline && <p className="text-xs text-slate-500">{tagline}</p>}
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
  );
}
