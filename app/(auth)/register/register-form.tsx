"use client";

import { useActionState } from "react";
import { registerAction } from "@/app/actions/auth";
import { Button } from "@/components/ui/button";
import { Input, Label } from "@/components/ui/input";
import { Alert } from "@/components/ui/alert";

export function RegisterForm() {
  const [error, formAction, pending] = useActionState(registerAction, undefined);

  return (
    <form action={formAction} className="space-y-4">
      {error && <Alert tone={error.startsWith("Account created") ? "success" : "error"}>{error}</Alert>}
      <div>
        <Label htmlFor="name">Full name</Label>
        <Input id="name" name="name" required placeholder="Juan Dela Cruz" />
      </div>
      <div>
        <Label htmlFor="email">Email</Label>
        <Input id="email" name="email" type="email" required placeholder="you@company.com" />
      </div>
      <div>
        <Label htmlFor="phone">Phone (optional)</Label>
        <Input id="phone" name="phone" placeholder="0917-000-0000" />
      </div>
      <div>
        <Label htmlFor="companyName">Company (optional)</Label>
        <Input id="companyName" name="companyName" placeholder="Your business name" />
      </div>
      <div>
        <Label htmlFor="password">Password</Label>
        <Input id="password" name="password" type="password" required minLength={6} placeholder="At least 6 characters" />
      </div>
      <Button type="submit" className="w-full" disabled={pending}>
        {pending ? "Creating account..." : "Create account"}
      </Button>
    </form>
  );
}
