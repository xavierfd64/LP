import { requireUser } from "@/lib/session";

/**
 * Document pages (Quotation/Invoice/Job Order print views) — deliberately
 * outside the (app) route group's Shell wrapper, so there's no sidebar/nav
 * to fight with when printing (spec: "no sidebar when printing, no
 * unnecessary web navigation"). Still requires a logged-in session; each
 * page does its own record-level authorization (matching the equivalent
 * interactive detail page) since that varies per document type.
 */
export default async function PrintLayout({ children }: { children: React.ReactNode }) {
  await requireUser();
  return <div className="min-h-screen bg-slate-100 print:bg-white">{children}</div>;
}
