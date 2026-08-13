import { requireUser } from "@/lib/session";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import Link from "next/link";

export default async function DashboardPage() {
  const user = await requireUser();

  const links =
    user.role === "CUSTOMER"
      ? [
          { href: "/inquiries", label: "My Inquiries" },
          { href: "/quotations", label: "My Quotations" },
          { href: "/orders", label: "My Orders" },
          { href: "/account/rewards", label: "My Rewards" },
        ]
      : [
          { href: "/inquiries", label: "Inquiries" },
          { href: "/quotations", label: "Quotations" },
          { href: "/orders", label: "Orders" },
          { href: "/inventory", label: "Inventory" },
          { href: "/payments", label: "Payments" },
        ];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">Welcome, {user.name}</h1>
        <p className="text-sm text-slate-500">Here&apos;s a quick jump-off point.</p>
      </div>
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
        {links.map((l) => (
          <Link key={l.href} href={l.href}>
            <Card className="transition-shadow hover:shadow-md">
              <CardContent className="py-6 text-center font-medium text-slate-800">{l.label}</CardContent>
            </Card>
          </Link>
        ))}
      </div>
    </div>
  );
}
