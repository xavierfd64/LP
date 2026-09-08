"use client";

import { Check } from "lucide-react";
import { PASSWORD_REQUIREMENTS } from "@/lib/password-policy";
import { cn } from "@/lib/utils";

/**
 * Live checklist against the exact same rules the server enforces
 * (lib/password-policy.ts) — used by every "set/change a password" form
 * (Register, Change Your Password, self-service Reset Password) so the
 * displayed requirements can never drift from what's actually validated.
 */
export function PasswordRequirementsList({ password }: { password: string }) {
  return (
    <div className="rounded-md border border-slate-200 bg-slate-50 p-3">
      <p className="mb-1.5 text-xs font-medium text-slate-600">Password Requirements:</p>
      <ul className="space-y-1">
        {PASSWORD_REQUIREMENTS.map((req) => {
          const met = req.test(password);
          return (
            <li key={req.key} className={cn("flex items-center gap-1.5 text-xs", met ? "text-green-700" : "text-slate-500")}>
              <Check className={cn("h-3.5 w-3.5 shrink-0", met ? "opacity-100" : "opacity-30")} />
              {req.label}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
