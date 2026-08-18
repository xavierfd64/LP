import Link from "next/link";
import { PackageX } from "lucide-react";
import { Button } from "@/components/ui/button";

/**
 * Global fallback for notFound() calls across the app — most notably when a
 * notification's linked record (an SOA, quotation, order, etc.) has since
 * been deleted or revoked. Spec: never a raw database error, always a
 * friendly message ("This item is no longer available").
 */
export default function NotFound() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-slate-50 px-4 text-center">
      <PackageX className="h-12 w-12 text-slate-300" />
      <h1 className="mt-4 text-xl font-bold text-slate-900">This item is no longer available.</h1>
      <p className="mt-2 max-w-sm text-sm text-slate-500">
        It may have been removed, revoked, or the link may be out of date. If you think this is a mistake, please
        contact us.
      </p>
      <Link href="/" className="mt-6">
        <Button type="button">Back to Home</Button>
      </Link>
    </div>
  );
}
