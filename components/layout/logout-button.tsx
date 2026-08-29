"use client";

import { LogOut, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { LogoutForm } from "./logout-form";

/**
 * See LogoutForm for why this is a native form POST (not a Server Action)
 * and how the pending state is made to paint before the browser proceeds
 * with that native submission.
 */
export function LogoutButton() {
  return (
    <LogoutForm>
      {(pending) => (
        // Icon-only below sm: (the header row is already full on ~320px
        // screens with the nav toggle, notification bell, and this button —
        // the full "Sign out" label reappears once there's room).
        <Button type="submit" variant="outline" size="sm" className="px-2 sm:px-3" aria-label="Sign out" disabled={pending}>
          {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <LogOut className="h-4 w-4 sm:hidden" />}
          <span className="hidden sm:inline">{pending ? "Signing out…" : "Sign out"}</span>
        </Button>
      )}
    </LogoutForm>
  );
}
