"use client";

import { useFormStatus } from "react-dom";
import { Loader2 } from "lucide-react";
import { initiateConnectAction } from "@/app/actions/customer-profile";
import { Button } from "@/components/ui/button";
import { GoogleIcon, FacebookIcon } from "@/components/auth/oauth-buttons";

/**
 * "Connect Google/Facebook" from an already-logged-in customer's My
 * Profile page — only rendered for a provider that's both configured and
 * not yet connected on this account. Uses the same real OAuth redirect as
 * sign-in (initiateConnectAction just marks intent first); lib/auth.ts's
 * signIn callback enforces that only a matching-email account can
 * actually connect, so this can never silently switch the session or
 * create a duplicate customer.
 */
export function ConnectButton({ provider }: { provider: "google" | "facebook" }) {
  return (
    <form action={initiateConnectAction.bind(null, provider)}>
      <SubmitButton provider={provider} />
    </form>
  );
}

function SubmitButton({ provider }: { provider: "google" | "facebook" }) {
  const { pending } = useFormStatus();
  const label = provider === "google" ? "Connect Google" : "Connect Facebook";
  const connectingLabel = provider === "google" ? "Connecting to Google..." : "Connecting to Facebook...";
  return (
    <Button type="submit" variant="outline" size="sm" disabled={pending}>
      {pending ? (
        <>
          <Loader2 className="h-3.5 w-3.5 animate-spin" /> {connectingLabel}
        </>
      ) : (
        <>
          {provider === "google" ? <GoogleIcon /> : <FacebookIcon />} {label}
        </>
      )}
    </Button>
  );
}
