import Link from "next/link";
import {
  Package,
  Wallet,
  FileText,
  MessageCircle,
  Gift,
  ChevronRight,
  CheckCircle2,
  Circle,
  Loader2,
  CalendarClock,
  Send,
  Receipt,
  CreditCard,
  ClipboardList,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge, StatusBadge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { formatCurrency, formatDate, cn } from "@/lib/utils";
import { approveQuotationAction } from "@/app/actions/quotations";
import { ChatOpenButton } from "./chat-open-button";
import { getBusinessSettings } from "@/lib/business-settings";
import { messengerOptinLink } from "@/lib/messenger";
import { prisma } from "@/lib/prisma";
import {
  getCustomerKpis,
  getCustomerActiveOrders,
  getCustomerRecentTransactions,
  getCustomerPaymentSummary,
  getCustomerQuotationsAwaitingAction,
  getCustomerUpcomingDeadlines,
} from "@/lib/customer-dashboard-data";

const BALANCE_TONE: Record<string, "green" | "yellow" | "red"> = { CURRENT: "green", DUE: "yellow", OVERDUE: "red" };

/**
 * The redesigned Customer Portal dashboard (8th update, Reference A) — a
 * greeting header, 5 KPI cards, Active Orders with real production-stage
 * progress, Recent Transactions, Payment Summary, Quotations Awaiting
 * Action, Upcoming Deadlines, and Quick Actions. Every number comes from
 * lib/customer-dashboard-data.ts, which itself reuses the SOA balance
 * calculation and the tracking-page stage-derivation rather than computing
 * either a second time.
 */
export async function CustomerDashboard({ customerId, name }: { customerId: string; name: string }) {
  const businessSettings = await getBusinessSettings();
  const [kpis, activeOrders, transactions, paymentSummary, quotationsAwaiting, deadlines, messengerLink, messengerConnection] = await Promise.all([
    getCustomerKpis(customerId),
    getCustomerActiveOrders(customerId),
    getCustomerRecentTransactions(customerId),
    getCustomerPaymentSummary(customerId),
    getCustomerQuotationsAwaitingAction(customerId),
    getCustomerUpcomingDeadlines(customerId),
    businessSettings.messengerEnabled ? messengerOptinLink(customerId) : Promise.resolve(null),
    businessSettings.messengerEnabled ? prisma.messengerConnection.findUnique({ where: { customerId } }) : Promise.resolve(null),
  ]);

  const firstName = name.split(" ")[0] || name;
  const today = new Date().toLocaleDateString("en-PH", { weekday: "long", month: "long", day: "numeric", year: "numeric" });

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Welcome back, {firstName}! 👋</h1>
          <p className="mt-1 text-sm text-slate-500">Here&apos;s an update on your orders and account.</p>
        </div>
        <p className="text-sm text-slate-500">Today · {today}</p>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
        <CustomerKpiCard icon={Package} label="Active Orders" value={kpis.activeOrders} href="/orders" linkLabel="View all" />
        <CustomerKpiCard
          icon={Wallet}
          label="Outstanding Balance"
          value={formatCurrency(kpis.outstandingBalance)}
          href="/payments"
          linkLabel="View SOA"
          tone={kpis.outstandingBalance > 0 ? "attention" : undefined}
        />
        <CustomerKpiCard icon={FileText} label="Pending Quotations" value={kpis.pendingQuotations} href="/quotations" linkLabel="Review" />
        <CustomerKpiCard icon={MessageCircle} label="Unread Messages" value={kpis.unreadMessages} onOpenChat linkLabel="Open Chat" />
        <CustomerKpiCard icon={Gift} label="Reward Points" value={kpis.rewardPoints} href="/account/rewards" linkLabel="View Rewards" />
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle>Active Orders</CardTitle>
            <Link href="/orders" className="text-xs font-medium text-brand-600 hover:underline">
              View all
            </Link>
          </CardHeader>
          <CardContent className="space-y-3">
            {activeOrders.length === 0 && (
              <EmptyState title="No Active Orders" detail="You don't have any active orders right now." />
            )}
            {activeOrders.map((o) => (
              <Link
                key={o.id}
                href={`/orders/${o.id}`}
                className="block rounded-lg border border-slate-100 p-3 transition-colors hover:border-brand-200 hover:bg-brand-50/30"
              >
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <p className="font-medium text-slate-900">{o.orderNumber}</p>
                    {o.productType && <p className="text-xs text-slate-500">{o.productType}</p>}
                  </div>
                  <div className="flex items-center gap-1.5">
                    <StatusBadge status={o.paymentStatus} />
                    <StatusBadge status={o.status} />
                  </div>
                </div>
                {o.stageSteps.length > 0 && (
                  <div className="mt-2 flex flex-wrap items-center gap-1">
                    {o.stageSteps.map((s, i) => (
                      <div key={s.label} className="flex items-center gap-1">
                        {i > 0 && <span className="h-px w-3 bg-slate-200" />}
                        {s.state === "done" ? (
                          <CheckCircle2 className="h-3.5 w-3.5 text-brand-600" />
                        ) : s.state === "current" ? (
                          <Loader2 className="h-3.5 w-3.5 animate-spin text-brand-600" />
                        ) : (
                          <Circle className="h-3.5 w-3.5 text-slate-300" />
                        )}
                        <span className={cn("text-[11px]", s.state === "upcoming" ? "text-slate-400" : "font-medium text-slate-700")}>
                          {s.label}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </Link>
            ))}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle>Recent Transactions</CardTitle>
          </CardHeader>
          <CardContent className="space-y-1">
            {transactions.length === 0 && (
              <EmptyState title="No Recent Transactions" detail="Your recent transactions will appear here." />
            )}
            {transactions.map((t) => (
              <Link
                key={`${t.type}-${t.reference}-${t.date.toISOString()}`}
                href={t.href}
                className="flex items-center justify-between gap-2 rounded-md px-2 py-2 text-sm hover:bg-slate-50"
              >
                <div className="flex items-center gap-2.5">
                  <TransactionIcon type={t.type} />
                  <div>
                    <p className="font-medium text-slate-900">{t.reference}</p>
                    <p className="text-xs text-slate-400">{t.type} · {formatDate(t.date)}</p>
                  </div>
                </div>
                <div className="text-right">
                  {t.amount !== null && <p className="text-sm text-slate-700">{formatCurrency(t.amount)}</p>}
                  <StatusBadge status={t.status} />
                </div>
              </Link>
            ))}
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Payment Summary</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {paymentSummary.totalOutstanding <= 0 ? (
              <EmptyState title="No Outstanding Balance" detail="Your account is fully paid." />
            ) : (
              <>
                <div className="flex items-center justify-between">
                  <p className="text-sm text-slate-500">Total Outstanding</p>
                  <p className="text-xl font-bold text-slate-900">{formatCurrency(paymentSummary.totalOutstanding)}</p>
                </div>
                <div className="flex items-center justify-between text-sm">
                  <p className="text-slate-500">Status</p>
                  <Badge tone={BALANCE_TONE[paymentSummary.status]}>{paymentSummary.status}</Badge>
                </div>
                {paymentSummary.overdueAmount > 0 && (
                  <div className="flex items-center justify-between text-sm">
                    <p className="text-slate-500">Overdue</p>
                    <p className="font-medium text-red-700">{formatCurrency(paymentSummary.overdueAmount)}</p>
                  </div>
                )}
              </>
            )}
            <Link href="/payments" className="flex items-center gap-1 text-sm font-medium text-brand-600 hover:underline">
              View Statement of Account <ChevronRight className="h-3.5 w-3.5" />
            </Link>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Quotations Awaiting Your Action</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {quotationsAwaiting.length === 0 && (
              <EmptyState title="No Pending Quotations" detail="You don't have any quotations awaiting action." />
            )}
            {quotationsAwaiting.map((q) => {
              const approve = approveQuotationAction.bind(null, q.id);
              return (
                <div key={q.id} className="rounded-lg border border-slate-100 p-3">
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <p className="font-medium text-slate-900">{q.quoteNumber}</p>
                      <p className="text-xs text-slate-500">{q.productSummary}</p>
                    </div>
                    <p className="text-sm font-semibold text-slate-900">{formatCurrency(q.total)}</p>
                  </div>
                  <div className="mt-2 flex items-center gap-2">
                    <Link href={`/quotations/${q.id}`}>
                      <Button type="button" variant="outline" size="sm">
                        View Quotation
                      </Button>
                    </Link>
                    <form action={approve}>
                      <Button type="submit" size="sm">
                        Approve
                      </Button>
                    </form>
                  </div>
                </div>
              );
            })}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Upcoming Deadlines</CardTitle>
        </CardHeader>
        <CardContent>
          {deadlines.length === 0 ? (
            <p className="py-1 text-sm text-slate-400">Nothing upcoming right now.</p>
          ) : (
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
              {deadlines.map((d) => (
                <Link
                  key={`${d.label}-${d.detail}`}
                  href={d.href}
                  className={cn(
                    "flex items-center gap-2.5 rounded-md border px-3 py-2 text-sm hover:bg-slate-50",
                    d.tone === "amber" ? "border-amber-200 bg-amber-50/50" : "border-slate-100"
                  )}
                >
                  <CalendarClock className={cn("h-4 w-4 shrink-0", d.tone === "amber" ? "text-amber-600" : "text-slate-400")} />
                  <div className="min-w-0">
                    <p className="font-medium text-slate-900">{d.label} — {formatDate(d.date)}</p>
                    <p className="truncate text-xs text-slate-500">{d.detail}</p>
                  </div>
                </Link>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {messengerLink && (
        <Card>
          <CardHeader>
            <CardTitle>Order Updates via Messenger</CardTitle>
          </CardHeader>
          <CardContent>
            {messengerConnection?.connected ? (
              <p className="text-sm font-medium text-green-700">Connected — you&apos;ll receive order updates on Messenger.</p>
            ) : (
              <>
                <p className="mb-2 text-sm text-slate-500">
                  Get order, payment, and delivery updates on Facebook Messenger, in addition to email and your account.
                </p>
                <a href={messengerLink} target="_blank" rel="noreferrer">
                  <Button type="button" variant="outline">Connect Messenger</Button>
                </a>
              </>
            )}
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Quick Actions</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6">
            <QuickActionTile icon={Send} label="New Inquiry" href="/inquiries/new" />
            <QuickActionTile icon={ClipboardList} label="Request Quotation" href="/inquiries/new" />
            <QuickActionTile icon={Package} label="Track Order" href="/" />
            <QuickActionTile icon={CreditCard} label="Make a Payment" href="/payments" />
            <QuickActionTile icon={Receipt} label="View SOA" href="/payments" />
            <QuickActionTile icon={MessageCircle} label="Chat with Us" onOpenChat />
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

function TransactionIcon({ type }: { type: "Quotation" | "Order" | "Invoice" | "Payment" }) {
  const Icon = type === "Payment" ? CreditCard : type === "Quotation" ? FileText : Receipt;
  return (
    <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-slate-100 text-slate-500">
      <Icon className="h-4 w-4" />
    </div>
  );
}

function CustomerKpiCard({
  icon: Icon,
  label,
  value,
  href,
  linkLabel,
  tone,
  onOpenChat,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: string | number;
  href?: string;
  linkLabel: string;
  tone?: "attention";
  onOpenChat?: boolean;
}) {
  const body = (
    <Card className={cn("h-full transition-shadow hover:shadow-md", tone === "attention" && "border-red-200")}>
      <CardContent className="space-y-2 py-4">
        <div className="flex items-center gap-2">
          <div className={cn("flex h-9 w-9 shrink-0 items-center justify-center rounded-lg", tone === "attention" ? "bg-red-50 text-red-600" : "bg-brand-50 text-brand-600")}>
            <Icon className="h-4.5 w-4.5" />
          </div>
          <p className="text-xs font-medium text-slate-500">{label}</p>
        </div>
        <p className={cn("text-xl font-bold sm:text-2xl", tone === "attention" ? "text-red-700" : "text-slate-900")}>{value}</p>
        <p className="text-xs font-medium text-brand-600">{linkLabel} →</p>
      </CardContent>
    </Card>
  );

  if (onOpenChat) {
    return (
      <ChatOpenButton>
        {body}
      </ChatOpenButton>
    );
  }

  return <Link href={href ?? "#"}>{body}</Link>;
}

function QuickActionTile({
  icon: Icon,
  label,
  href,
  onOpenChat,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  href?: string;
  onOpenChat?: boolean;
}) {
  const content = (
    <div className="flex h-full flex-col items-center justify-center gap-2 rounded-lg border border-slate-100 px-2 py-4 text-center hover:border-brand-200 hover:bg-brand-50/30">
      <Icon className="h-5 w-5 text-brand-600" />
      <span className="text-xs font-medium text-slate-700">{label}</span>
    </div>
  );

  if (onOpenChat) {
    return <ChatOpenButton>{content}</ChatOpenButton>;
  }

  return <Link href={href ?? "#"}>{content}</Link>;
}

function EmptyState({ title, detail }: { title: string; detail: string }) {
  return (
    <div className="rounded-md border border-dashed border-slate-200 px-4 py-6 text-center">
      <p className="text-sm font-medium text-slate-700">{title}</p>
      <p className="mt-0.5 text-xs text-slate-400">{detail}</p>
    </div>
  );
}
