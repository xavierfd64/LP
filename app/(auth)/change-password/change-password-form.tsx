"use client";

import { useActionState, useState } from "react";
import { Eye, EyeOff } from "lucide-react";
import { forceChangePasswordAction } from "@/app/actions/change-password";
import { Button } from "@/components/ui/button";
import { Input, Label } from "@/components/ui/input";
import { Alert } from "@/components/ui/alert";
import { PasswordRequirementsList } from "@/components/auth/password-requirements-list";

function PasswordField({
  id,
  name,
  label,
  autoComplete,
  value,
  onChange,
}: {
  id: string;
  name: string;
  label: string;
  autoComplete: string;
  value?: string;
  onChange?: (v: string) => void;
}) {
  const [visible, setVisible] = useState(false);
  return (
    <div>
      <Label htmlFor={id}>{label}</Label>
      <div className="relative mt-1">
        <Input
          id={id}
          name={name}
          type={visible ? "text" : "password"}
          required
          autoComplete={autoComplete}
          className="pr-10"
          value={value}
          onChange={onChange ? (e) => onChange(e.target.value) : undefined}
        />
        <button
          type="button"
          onClick={() => setVisible((v) => !v)}
          aria-label={visible ? "Hide password" : "Show password"}
          className="absolute inset-y-0 right-0 flex items-center px-3 text-slate-400 hover:text-slate-700"
        >
          {visible ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
        </button>
      </div>
    </div>
  );
}

export function ChangePasswordForm() {
  const [error, formAction, pending] = useActionState(forceChangePasswordAction, undefined);
  const [newPassword, setNewPassword] = useState("");

  return (
    <form action={formAction} className="space-y-4 text-left">
      {error && <Alert tone="error">{error}</Alert>}
      <PasswordField id="currentPassword" name="currentPassword" label="Current/Temporary Password" autoComplete="current-password" />
      <PasswordField id="newPassword" name="newPassword" label="New Password" autoComplete="new-password" value={newPassword} onChange={setNewPassword} />
      <PasswordField id="confirmPassword" name="confirmPassword" label="Confirm New Password" autoComplete="new-password" />
      <PasswordRequirementsList password={newPassword} />
      <Button type="submit" className="w-full" disabled={pending}>
        {pending ? "Updating..." : "Update Password"}
      </Button>
    </form>
  );
}
