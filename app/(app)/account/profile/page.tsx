import { requireUser } from "@/lib/session";
import { getCurrentCustomer } from "@/lib/current-customer";
import { prisma } from "@/lib/prisma";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Alert } from "@/components/ui/alert";
import { formatDate } from "@/lib/utils";
import { BrandLogo } from "@/components/branding/brand-logo";
import { formatDateTime } from "@/lib/utils";
import { availableOAuthProviders } from "@/lib/oauth-providers";
import { friendlyAuthError } from "@/lib/auth-errors";
import { ConnectButton } from "@/components/auth/connect-buttons";
import { ChangePasswordForm } from "@/app/(auth)/change-password/change-password-form";
import { SecurityHistoryTable } from "@/components/auth/security-history-table";
import { getSecurityHistory } from "@/lib/security-history";
import { ProfileForm } from "./profile-form";
import { SetPasswordForm } from "./set-password-form";
import { StaffProfileForm } from "./staff-profile-form";

export default async function ProfilePage({ searchParams }: PageProps<"/account/profile">) {
  const authUser = await requireUser();
  const sp = await searchParams;
  const errorMsg = friendlyAuthError(typeof sp.error === "string" ? sp.error : undefined);

  if (authUser.role !== "CUSTOMER") {
    return <StaffAdminProductionProfile userId={authUser.id} role={authUser.role} errorMsg={errorMsg} searchParams={sp} />;
  }

  const providers = await availableOAuthProviders();
  const [customer, user] = await Promise.all([
    getCurrentCustomer(authUser.id),
    prisma.user.findUniqueOrThrow({ where: { id: authUser.id } }),
  ]);

  return (
    <div className="max-w-2xl space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">My Profile</h1>
        <p className="mt-1 text-sm text-slate-500">Update your contact information and manage how you sign in.</p>
      </div>

      {errorMsg && <Alert tone="error">{errorMsg}</Alert>}

      <div className="flex flex-wrap items-center gap-3 rounded-lg border border-slate-200 bg-white p-4">
        <BrandLogo src={customer.profileImageUrl} alt={customer.name} size={56} rounded="rounded-full" imgClassName="object-cover" />
        <div className="flex-1">
          <p className="font-semibold text-slate-900">{customer.name}</p>
          <p className="text-xs text-slate-500">Customer ID: {customer.displayId} · Customer since {formatDate(customer.createdAt)}</p>
        </div>
        <Badge tone={user.active ? "green" : "slate"}>{user.active ? "Active" : "Inactive"}</Badge>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Profile Information</CardTitle>
        </CardHeader>
        <CardContent>
          <ProfileForm
            name={customer.name}
            companyName={customer.companyName}
            email={customer.email}
            contactNumber={customer.contactNumber}
            address={customer.address}
            facebookUrl={customer.facebookUrl}
          />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Login &amp; Security</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <p className="text-xs text-slate-400">Sign-in email: {user.email}</p>

          <MethodRow
            label="Email / Password"
            connected={!!user.passwordHash}
            detail={user.passwordHash ? "You can sign in with your email and password." : "Not set up yet."}
          />
          <MethodRow
            label="Google"
            connected={!!user.googleConnectedAt}
            detail={user.googleConnectedAt ? `Connected ${formatDateTime(user.googleConnectedAt)}` : "Not connected."}
            action={!user.googleConnectedAt && providers.google ? <ConnectButton provider="google" /> : undefined}
          />
          <MethodRow
            label="Facebook"
            connected={!!user.facebookConnectedAt}
            detail={user.facebookConnectedAt ? `Connected ${formatDateTime(user.facebookConnectedAt)}` : "Not connected."}
            action={!user.facebookConnectedAt && providers.facebook ? <ConnectButton provider="facebook" /> : undefined}
          />

          {!user.passwordHash && (
            <div className="border-t border-slate-100 pt-3">
              <p className="mb-2 text-sm font-medium text-slate-700">Set a password</p>
              <p className="mb-3 text-xs text-slate-500">
                Add an email/password sign-in method alongside your connected account — no password is required to keep using
                Google or Facebook.
              </p>
              <SetPasswordForm />
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function MethodRow({
  label,
  connected,
  detail,
  action,
}: {
  label: string;
  connected: boolean;
  detail: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-slate-100 px-3 py-2">
      <div>
        <p className="text-sm font-medium text-slate-900">{label}</p>
        <p className="text-xs text-slate-500">{detail}</p>
      </div>
      <div className="flex items-center gap-2">
        {action}
        {connected ? <Badge tone="green">Connected</Badge> : <Badge tone="slate">Not Connected</Badge>}
      </div>
    </div>
  );
}

/**
 * Self-profile view for STAFF/ADMIN/PRODUCTION (Sept 8 — User Profile/
 * Progressive Lockout/Security History improvement) — these roles never
 * had a "My Profile" page before this. Follows the same Card/Badge
 * layout language as the customer view above rather than a new design.
 * Personal Information -> Password -> Login/Security History, per spec.
 */
async function StaffAdminProductionProfile({
  userId,
  role,
  errorMsg,
  searchParams,
}: {
  userId: string;
  role: string;
  errorMsg: string | undefined;
  searchParams: Record<string, string | string[] | undefined>;
}) {
  const shPage = Math.max(1, Number(typeof searchParams.shPage === "string" ? searchParams.shPage : "1") || 1);
  const [user, history] = await Promise.all([
    prisma.user.findUniqueOrThrow({ where: { id: userId } }),
    getSecurityHistory(userId, { page: shPage, pageSize: 10 }),
  ]);

  return (
    <div className="max-w-2xl space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">My Profile</h1>
        <p className="mt-1 text-sm text-slate-500">Manage your personal information, password, and login security.</p>
      </div>

      {errorMsg && <Alert tone="error">{errorMsg}</Alert>}

      <div className="flex flex-wrap items-center gap-3 rounded-lg border border-slate-200 bg-white p-4">
        <div className="flex h-14 w-14 items-center justify-center rounded-full bg-brand-100 text-lg font-semibold text-brand-700">
          {user.name.slice(0, 1).toUpperCase()}
        </div>
        <div className="flex-1">
          <p className="font-semibold text-slate-900">{user.name}</p>
          <p className="text-xs text-slate-500">
            {user.title ? `${user.title} · ` : ""}Member since {formatDate(user.createdAt)}
          </p>
        </div>
        <Badge tone="purple">{role}</Badge>
        <Badge tone={user.active ? "green" : "slate"}>{user.active ? "Active" : "Inactive"}</Badge>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Personal Information</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <p className="text-xs text-slate-400">
            Sign-in email: {user.email} — contact an administrator to change your email or role.
          </p>
          <StaffProfileForm name={user.name} phone={user.phone} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Password</CardTitle>
        </CardHeader>
        <CardContent>
          <ChangePasswordForm />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Login &amp; Security History</CardTitle>
        </CardHeader>
        <CardContent>
          <SecurityHistoryTable events={history.events} />
          {history.totalPages > 1 && (
            <div className="mt-3 flex items-center justify-between text-xs text-slate-500">
              <span>
                Page {history.page} of {history.totalPages}
              </span>
              <div className="flex gap-2">
                {history.page > 1 && (
                  <a className="underline" href={`/account/profile?shPage=${history.page - 1}`}>
                    Previous
                  </a>
                )}
                {history.page < history.totalPages && (
                  <a className="underline" href={`/account/profile?shPage=${history.page + 1}`}>
                    Next
                  </a>
                )}
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
