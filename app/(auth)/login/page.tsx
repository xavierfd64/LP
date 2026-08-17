import { Alert } from "@/components/ui/alert";
import { LoginForm } from "./login-form";
import { OAuthButtons } from "@/components/auth/oauth-buttons";
import { availableOAuthProviders } from "@/lib/oauth-providers";

export default async function LoginPage({ searchParams }: PageProps<"/login">) {
  const sp = await searchParams;
  const errorMsg = typeof sp.error === "string" ? sp.error : undefined;
  const providers = availableOAuthProviders();

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold text-slate-900">Welcome back</h2>
        <p className="mt-1 text-sm text-slate-500">Sign in to continue to your account.</p>
      </div>

      {errorMsg && <Alert tone="error">{errorMsg}</Alert>}

      <OAuthButtons google={providers.google} facebook={providers.facebook} />

      <LoginForm />

      <div className="rounded-md bg-slate-50 p-3 text-xs text-slate-500">
        <p className="mb-1 font-medium">Demo accounts (password: password123)</p>
        <p>Admin: admin@lp.test</p>
        <p>Staff: staff1@lp.test</p>
        <p>Production: prod1@lp.test</p>
        <p>Customer: juan@lp.test</p>
      </div>
    </div>
  );
}
