import { Lock } from "lucide-react";
import { requireUser } from "@/lib/session";
import { ChangePasswordForm } from "./change-password-form";

export const dynamic = "force-dynamic";

export default async function ChangePasswordPage() {
  // allowMustChangePassword: this IS the page that state is meant to land
  // on — every other page/action redirects here instead (see
  // requireUser()'s doc comment in lib/session.ts).
  await requireUser({ allowMustChangePassword: true });

  return (
    <div className="space-y-5 text-center">
      <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-brand-100 text-brand-600">
        <Lock className="h-6 w-6" />
      </div>
      <div>
        <h1 className="text-xl font-bold text-slate-900">Change Your Password</h1>
        <p className="mt-1 text-sm text-slate-500">
          You are required to change your temporary password before continuing.
        </p>
      </div>
      <ChangePasswordForm />
    </div>
  );
}
