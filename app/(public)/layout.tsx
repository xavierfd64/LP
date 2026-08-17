/**
 * Login-free public pages (Customer Order Tracking, and — separately —
 * Document Sharing) — deliberately outside both (app)'s Shell and
 * (print)'s requireUser() gate. Authorization here is entirely
 * token-based, enforced by each page itself; there is no session check at
 * this layout level on purpose.
 */
export default function PublicLayout({ children }: { children: React.ReactNode }) {
  return <div className="min-h-screen bg-slate-50">{children}</div>;
}
