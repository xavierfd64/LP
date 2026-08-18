import Image from "next/image";
import { requireRole } from "@/lib/session";
import { getCurrentCustomer } from "@/lib/current-customer";
import { prisma } from "@/lib/prisma";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Alert } from "@/components/ui/alert";
import { formatDateTime } from "@/lib/utils";
import { availableOAuthProviders } from "@/lib/oauth-providers";
import { friendlyAuthError } from "@/lib/auth-errors";
import { ConnectButton } from "@/components/auth/connect-buttons";
import { ProfileForm } from "./profile-form";
import { SetPasswordForm } from "./set-password-form";

export default async function CustomerProfilePage({ searchParams }: PageProps<"/account/profile">) {
  const authUser = await requireRole(["CUSTOMER"]);
  const sp = await searchParams;
  const errorMsg = friendlyAuthError(typeof sp.error === "string" ? sp.error : undefined);
  const providers = availableOAuthProviders();
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

      {customer.profileImageUrl && (
        <div className="flex items-center gap-3">
          <Image
            src={customer.profileImageUrl}
            alt={customer.name}
            width={56}
            height={56}
            className="h-14 w-14 rounded-full object-cover"
            unoptimized
          />
          <p className="text-sm text-slate-500">Profile photo from your connected account</p>
        </div>
      )}

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
