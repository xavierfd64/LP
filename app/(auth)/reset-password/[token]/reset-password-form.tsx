"use client";

import { useActionState, useState } from "react";
import { resetPasswordAction } from "@/app/actions/password-reset";
import { Button } from "@/components/ui/button";
import { Input, Label } from "@/components/ui/input";
import { Alert } from "@/components/ui/alert";
import { PasswordRequirementsList } from "@/components/auth/password-requirements-list";

export function ResetPasswordForm({ token }: { token: string }) {
  const [error, formAction, pending] = useActionState(resetPasswordAction, undefined);
  const [password, setPassword] = useState("");

  return (
    <form action={formAction} className="space-y-4">
      <input type="hidden" name="token" value={token} />
      {error && <Alert tone={error.startsWith("Password updated") ? "success" : "error"}>{error}</Alert>}
      <div>
        <Label htmlFor="password">New password</Label>
        <Input
          id="password"
          name="password"
          type="password"
          required
          minLength={8}
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder="At least 8 characters"
        />
      </div>
      {password && <PasswordRequirementsList password={password} />}
      <div>
        <Label htmlFor="confirmPassword">Confirm new password</Label>
        <Input id="confirmPassword" name="confirmPassword" type="password" required minLength={8} placeholder="Re-enter your password" />
      </div>
      <Button type="submit" className="w-full" disabled={pending}>
        {pending ? "Saving..." : "Set new password"}
      </Button>
    </form>
  );
}
