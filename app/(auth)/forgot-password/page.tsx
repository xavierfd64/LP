import { ForgotPasswordForm } from "./forgot-password-form";

export default function ForgotPasswordPage() {
  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold text-slate-900">Reset your password</h2>
        <p className="mt-1 text-sm text-slate-500">
          Enter your account email and we&apos;ll send you a link to reset your password.
        </p>
      </div>
      <ForgotPasswordForm />
    </div>
  );
}
