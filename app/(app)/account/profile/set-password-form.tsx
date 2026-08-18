"use client";

import { useActionState } from "react";
import { setPasswordAction } from "@/app/actions/customer-profile";
import { Button } from "@/components/ui/button";
import { Input, Label } from "@/components/ui/input";
import { Alert } from "@/components/ui/alert";

export function SetPasswordForm() {
  const [message, formAction, pending] = useActionState(setPasswordAction, undefined);
  const success = message?.startsWith("Password set");

  return (
    <form action={formAction} className="space-y-4">
      {message && <Alert tone={success ? "success" : "error"}>{message}</Alert>}
      {!success && (
        <>
          <div>
            <Label htmlFor="sp-password">New password</Label>
            <Input id="sp-password" name="password" type="password" required minLength={6} placeholder="At least 6 characters" />
          </div>
          <div>
            <Label htmlFor="sp-confirm">Confirm password</Label>
            <Input id="sp-confirm" name="confirmPassword" type="password" required minLength={6} placeholder="Re-enter your password" />
          </div>
          <Button type="submit" disabled={pending}>
            {pending ? "Saving..." : "Set Password"}
          </Button>
        </>
      )}
    </form>
  );
}
