"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Search, Plus } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Table, THead, TBody, TR, TH, TD, EmptyState } from "@/components/ui/table";
import { searchCustomersForTransactionAction, type CustomerSearchResult } from "@/app/actions/customers";
import { QuickAddCustomerButton } from "./quick-add-customer-button";

export function CustomersList({
  initialCustomers,
  canCreate,
}: {
  initialCustomers: CustomerSearchResult[];
  canCreate: boolean;
}) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<CustomerSearchResult[] | null>(null);
  const [customers, setCustomers] = useState(initialCustomers);

  useEffect(() => {
    if (!query.trim()) {
      setResults(null);
      return;
    }
    const t = setTimeout(() => {
      searchCustomersForTransactionAction(query).then(setResults);
    }, 250);
    return () => clearTimeout(t);
  }, [query]);

  const rows = results ?? customers;

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 p-4">
        <div className="relative w-full max-w-sm">
          <Search className="absolute left-2 top-2.5 h-4 w-4 text-slate-400" />
          <Input
            placeholder="Search by name, email, contact, Facebook, or Customer ID…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className="pl-8"
          />
        </div>
        {canCreate && (
          <QuickAddCustomerButton
            onCreated={(c) => {
              setCustomers((prev) => [c, ...prev]);
              setQuery("");
            }}
          />
        )}
      </div>

      <Table>
        <THead>
          <TR>
            <TH>Customer ID</TH>
            <TH>Name</TH>
            <TH>Contact</TH>
            <TH>Login Status</TH>
            <TH />
          </TR>
        </THead>
        <TBody>
          {rows.map((c) => (
            <TR key={c.id}>
              <TD className="font-mono text-xs text-slate-500">{c.displayId}</TD>
              <TD className="font-medium text-slate-900">
                {c.name}
                {c.companyName ? ` (${c.companyName})` : ""}
              </TD>
              <TD className="text-sm text-slate-600">
                {[c.email, c.contactNumber].filter(Boolean).join(" · ") || "—"}
              </TD>
              <TD>
                <Badge tone={c.hasLogin ? "green" : "slate"}>{c.hasLogin ? "Activated" : "Not Activated"}</Badge>
              </TD>
              <TD>
                <Link href={`/customers/${c.id}`} className="text-sm font-medium text-brand-600 underline">
                  View
                </Link>
              </TD>
            </TR>
          ))}
        </TBody>
      </Table>
      {rows.length === 0 && (
        <EmptyState label={query.trim() ? "No customers found." : "No customers yet."} />
      )}
    </div>
  );
}
