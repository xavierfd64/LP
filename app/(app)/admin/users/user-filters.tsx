"use client";

import { useEffect, useState } from "react";
import { useRouter, useSearchParams, usePathname } from "next/navigation";
import { Search } from "lucide-react";
import { Input, Select } from "@/components/ui/input";
import { Button } from "@/components/ui/button";

const ROLE_OPTIONS = [
  { value: "ADMIN", label: "Admin" },
  { value: "STAFF", label: "Staff" },
  { value: "PRODUCTION", label: "Production" },
  { value: "CUSTOMER", label: "Customer" },
];

/** Search + Role + Status toolbar for /admin/users (Sept 8) — same URL-searchParams-driven pattern as ListFilters/PaymentFilters. */
export function UserFilters({ q, role, status }: { q: string; role: string; status: string }) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [query, setQuery] = useState(q);

  function pushParams(next: Record<string, string>) {
    const params = new URLSearchParams(searchParams.toString());
    for (const [k, v] of Object.entries(next)) {
      if (v) params.set(k, v);
      else params.delete(k);
    }
    params.delete("page");
    router.push(`${pathname}?${params.toString()}`);
  }

  useEffect(() => {
    if (query === q) return;
    const t = setTimeout(() => pushParams({ q: query }), 300);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query, q]);

  return (
    <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center">
      <div className="relative flex-1 sm:max-w-xs">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
        <Input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search name, email, or role..." className="pl-9" />
      </div>
      <Select value={role} onChange={(e) => pushParams({ role: e.target.value })} className="sm:w-40">
        <option value="">All Roles</option>
        {ROLE_OPTIONS.map((r) => (
          <option key={r.value} value={r.value}>
            {r.label}
          </option>
        ))}
      </Select>
      <Select value={status} onChange={(e) => pushParams({ status: e.target.value })} className="sm:w-40">
        <option value="">All Status</option>
        <option value="active">Active</option>
        <option value="inactive">Inactive</option>
      </Select>
      {(q || role || status) && (
        <Button type="button" variant="outline" onClick={() => router.push(pathname)}>
          Reset
        </Button>
      )}
    </div>
  );
}
