import Link from "next/link";
import { AlertTriangle, ChevronRight, CheckCircle2 } from "lucide-react";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { SectionHeader } from "./section-header";
import { cn } from "@/lib/utils";
import type { NeedsAttentionItem } from "@/lib/dashboard-data";

/** Spec item 13 — the "what needs my attention" section, first in the information hierarchy (item 36). */
export function NeedsAttention({ items }: { items: NeedsAttentionItem[] }) {
  return (
    <Card>
      <CardHeader>
        <SectionHeader title="Needs Attention" />
      </CardHeader>
      <CardContent className="space-y-1">
        {items.length === 0 ? (
          <div className="flex items-center gap-2 py-2 text-sm text-slate-500">
            <CheckCircle2 className="h-4 w-4 text-green-600" /> Everything is up to date.
          </div>
        ) : (
          items.map((item) => (
            <Link
              key={item.label}
              href={item.href}
              className="flex items-center justify-between rounded-md px-2 py-1.5 text-sm hover:bg-slate-50"
            >
              <span className="flex items-center gap-2">
                <AlertTriangle className={cn("h-3.5 w-3.5 shrink-0", item.tone === "red" ? "text-red-600" : "text-amber-500")} />
                <span className="text-slate-700">{item.label}</span>
              </span>
              <ChevronRight className="h-4 w-4 shrink-0 text-slate-300" />
            </Link>
          ))
        )}
      </CardContent>
    </Card>
  );
}
