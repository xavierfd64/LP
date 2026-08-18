import { checkPasswordResetToken } from "@/lib/password-reset";
import { Alert } from "@/components/ui/alert";
import { ResetPasswordForm } from "./reset-password-form";

const REASON_MESSAGE: Record<string, string> = {
  not_found: "This reset link is invalid.",
  used: "This reset link has already been used.",
  expired: "This reset link has expired.",
  inactive: "This account is inactive. Please contact support.",
};

export default async function ResetPasswordPage({ params }: PageProps<"/reset-password/[token]">) {
  const { token } = await params;
  const check = await checkPasswordResetToken(token);

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold text-slate-900">Set a new password</h2>
        <p className="mt-1 text-sm text-slate-500">Choose a new password for your account.</p>
      </div>
      {check.ok ? (
        <ResetPasswordForm token={token} />
      ) : (
        <Alert tone="error">{REASON_MESSAGE[check.reason]} Please request a new reset link.</Alert>
      )}
    </div>
  );
}
