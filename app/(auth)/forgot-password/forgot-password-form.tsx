"use client";

import { useActionState } from "react";
import Link from "next/link";
import { requestPasswordResetAction } from "@/app/actions/password-reset";
import { Button } from "@/components/ui/button";
import { Input, Label } from "@/components/ui/input";
import { Alert } from "@/components/ui/alert";

const SENT_PREFIX = "If an account exists";

export function ForgotPasswordForm() {
  const [message, formAction, pending] = useActionState(requestPasswordResetAction, undefined);
  const sent = message?.startsWith(SENT_PREFIX);

  return (
    <form action={formAction} className="space-y-4">
      {message && <Alert tone={sent ? "success" : "error"}>{message}</Alert>}
      {!sent && (
        <>
          <div>
            <Label htmlFor="email">Email</Label>
            <Input id="email" name="email" type="email" required placeholder="you@company.com" />
          </div>
          <Button type="submit" className="w-full" disabled={pending}>
            {pending ? "Sending..." : "Send reset link"}
          </Button>
        </>
      )}
      <p className="text-center text-sm text-slate-500">
        <Link href="/login" className="font-medium text-brand-600 underline hover:text-brand-700">
          Back to Sign In
        </Link>
      </p>
    </form>
  );
}
