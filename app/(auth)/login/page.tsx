import Link from "next/link";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { LoginForm } from "./login-form";
import { OAuthButtons, OrDivider } from "@/components/auth/oauth-buttons";
import { availableOAuthProviders } from "@/lib/oauth-providers";
import { friendlyAuthError } from "@/lib/auth-errors";

export default async function LoginPage({ searchParams }: PageProps<"/login">) {
  const sp = await searchParams;
  const rawError = typeof sp.error === "string" ? sp.error : undefined;
  const errorMsg = friendlyAuthError(rawError);
  const providers = await availableOAuthProviders();
  // Set by proxy.ts when an unauthenticated visit to a protected page was
  // redirected here — carried through sign-in so the customer lands back
  // where they meant to go instead of always the dashboard (spec item 33).
  const callbackUrl = typeof sp.callbackUrl === "string" ? sp.callbackUrl : undefined;
  const registerHref = callbackUrl ? `/register?callbackUrl=${encodeURIComponent(callbackUrl)}` : "/register";

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold text-slate-900">Welcome back</h2>
        <p className="mt-1 text-sm text-slate-500">Sign in to continue to your account.</p>
      </div>

      {errorMsg && <Alert tone="error">{errorMsg}</Alert>}

      <LoginForm callbackUrl={callbackUrl} />

      {(providers.google || providers.facebook) && (
        <>
          <OrDivider />
          <OAuthButtons google={providers.google} facebook={providers.facebook} callbackUrl={callbackUrl} />
        </>
      )}

      <p className="text-center text-sm text-slate-500">
        Don&apos;t have an account?{" "}
        <Link href={registerHref} className="font-medium text-brand-600 underline hover:text-brand-700">
          Sign Up
        </Link>
      </p>

      <div className="rounded-md border border-slate-200 bg-white p-3 text-center">
        <p className="text-sm text-slate-500">Don&apos;t want to log in?</p>
        {/* /track, not "/" — "/" redirects an authenticated visitor to their
            dashboard, which from the login page (right after a logout) could
            look like an automatic re-login. /track never checks session. */}
        <Link href="/track">
          <Button type="button" variant="outline" className="mt-2 w-full">
            Track Your Order
          </Button>
        </Link>
        <p className="mt-1 text-xs text-slate-400">No account needed — enter your order, quotation, job order, or invoice number.</p>
      </div>

      {process.env.NODE_ENV !== "production" && (
        <div className="rounded-md bg-slate-50 p-3 text-xs text-slate-500">
          <p className="mb-1 font-medium">Demo accounts (password: password123)</p>
          <p>Admin: admin@lp.test</p>
          <p>Staff: staff1@lp.test</p>
          <p>Production: prod1@lp.test</p>
          <p>Customer: juan@lp.test</p>
        </div>
      )}
    </div>
  );
}
