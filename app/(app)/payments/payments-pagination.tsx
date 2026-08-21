import Link from "next/link";

/**
 * Real pagination controls — plain links that set ?page=N against the same
 * query string (search/status/period preserved), so navigating a page is a
 * normal server-rendered request through getPaginatedPayments()'s
 * skip/take, never a client-side slice of an already-fetched list.
 */
export function PaymentsPagination({
  page,
  totalPages,
  total,
  pageSize,
  searchParams,
}: {
  page: number;
  totalPages: number;
  total: number;
  pageSize: number;
  searchParams: Record<string, string | string[] | undefined>;
}) {
  function hrefFor(p: number) {
    const params = new URLSearchParams();
    for (const [k, v] of Object.entries(searchParams)) {
      if (k === "page") continue;
      if (typeof v === "string" && v) params.set(k, v);
    }
    params.set("page", String(p));
    return `/payments?${params.toString()}`;
  }

  if (total === 0) return null;

  const start = (page - 1) * pageSize + 1;
  const end = Math.min(page * pageSize, total);

  // Compact page list: always show first/last, a window around the
  // current page, and "…" for gaps — avoids rendering 40+ page links.
  const pages: (number | "gap")[] = [];
  for (let p = 1; p <= totalPages; p++) {
    if (p === 1 || p === totalPages || Math.abs(p - page) <= 1) pages.push(p);
    else if (pages[pages.length - 1] !== "gap") pages.push("gap");
  }

  return (
    <div className="flex flex-col items-center justify-between gap-3 border-t border-slate-100 px-4 py-3 sm:flex-row">
      <p className="text-sm text-slate-500">
        Showing {start}–{end} of {total} payments
      </p>
      <div className="flex items-center gap-1">
        <Link
          href={hrefFor(Math.max(1, page - 1))}
          aria-disabled={page === 1}
          className={`rounded-md px-2.5 py-1.5 text-sm font-medium ${page === 1 ? "pointer-events-none text-slate-300" : "text-slate-600 hover:bg-slate-100"}`}
        >
          ‹ Previous
        </Link>
        {pages.map((p, i) =>
          p === "gap" ? (
            <span key={`gap-${i}`} className="px-1.5 text-sm text-slate-400">
              …
            </span>
          ) : (
            <Link
              key={p}
              href={hrefFor(p)}
              className={`min-w-[2rem] rounded-md px-2.5 py-1.5 text-center text-sm font-medium ${
                p === page ? "bg-brand-600 text-white" : "text-slate-600 hover:bg-slate-100"
              }`}
            >
              {p}
            </Link>
          )
        )}
        <Link
          href={hrefFor(Math.min(totalPages, page + 1))}
          aria-disabled={page === totalPages}
          className={`rounded-md px-2.5 py-1.5 text-sm font-medium ${page === totalPages ? "pointer-events-none text-slate-300" : "text-slate-600 hover:bg-slate-100"}`}
        >
          Next ›
        </Link>
      </div>
    </div>
  );
}
