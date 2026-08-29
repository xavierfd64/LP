import Link from "next/link";
import { PackageSearch } from "lucide-react";

export function LinkUnavailable() {
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-6 text-center">
      <PackageSearch className="mx-auto mb-2 h-8 w-8 text-slate-300" />
      <p className="font-medium text-slate-900">This tracking link is no longer available.</p>
      <p className="mt-1 text-sm text-slate-500">Please contact us for assistance, or track another order below.</p>
      <Link href="/track" className="mt-3 inline-block text-sm font-medium text-brand-600 underline">
        Track Your Order
      </Link>
    </div>
  );
}
