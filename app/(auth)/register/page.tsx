import { RegisterForm } from "./register-form";

export default function RegisterPage() {
  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold text-slate-900">Create a customer account</h2>
        <p className="mt-1 text-sm text-slate-500">Sign up to submit inquiries and track your orders.</p>
      </div>
      <RegisterForm />
    </div>
  );
}
