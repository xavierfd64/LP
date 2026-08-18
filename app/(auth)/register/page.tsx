import Link from "next/link";
import { RegisterForm } from "./register-form";
import { OAuthButtons, OrDivider } from "@/components/auth/oauth-buttons";
import { availableOAuthProviders } from "@/lib/oauth-providers";

export default async function RegisterPage({ searchParams }: PageProps<"/register">) {
  const sp = await searchParams;
  const providers = await availableOAuthProviders();
  const hasOAuth = providers.google || providers.facebook;
  const callbackUrl = typeof sp.callbackUrl === "string" ? sp.callbackUrl : undefined;
  const loginHref = callbackUrl ? `/login?callbackUrl=${encodeURIComponent(callbackUrl)}` : "/login";

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold text-slate-900">Create your account</h2>
        <p className="mt-1 text-sm text-slate-500">Sign up to submit inquiries and track your orders.</p>
      </div>
      <OAuthButtons google={providers.google} facebook={providers.facebook} callbackUrl={callbackUrl} />
      {hasOAuth && <OrDivider />}
      <RegisterForm callbackUrl={callbackUrl} />
      <p className="text-center text-sm text-slate-500">
        Already have an account?{" "}
        <Link href={loginHref} className="font-medium text-brand-600 underline hover:text-brand-700">
          Sign In
        </Link>
      </p>

      <p className="text-center text-xs text-slate-400">
        Just checking on an order?{" "}
        <Link href="/" className="font-medium text-brand-600 underline hover:text-brand-700">
          Track Your Order
        </Link>{" "}
        — no account needed.
      </p>
    </div>
  );
}
