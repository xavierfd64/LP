import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Alert } from "@/components/ui/alert";
import { LoginForm } from "./login-form";

export default async function LoginPage({ searchParams }: PageProps<"/login">) {
  const sp = await searchParams;
  const errorMsg = typeof sp.error === "string" ? sp.error : undefined;

  return (
    <Card>
      <CardHeader>
        <CardTitle>Sign in</CardTitle>
      </CardHeader>
      <CardContent>
        {errorMsg && (
          <div className="mb-4">
            <Alert tone="error">{errorMsg}</Alert>
          </div>
        )}
        <LoginForm />
        <div className="mt-6 rounded-md bg-slate-50 p-3 text-xs text-slate-500">
          <p className="font-medium mb-1">Demo accounts (password: password123)</p>
          <p>Admin: admin@lp.test</p>
          <p>Staff: staff1@lp.test</p>
          <p>Production: prod1@lp.test</p>
          <p>Customer: juan@lp.test</p>
        </div>
      </CardContent>
    </Card>
  );
}
