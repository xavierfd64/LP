"use client";

import { useFormStatus } from "react-dom";
import { Loader2 } from "lucide-react";
import { oauthSignInAction } from "@/app/actions/auth";
import { Button } from "@/components/ui/button";

/** Renders only the providers actually configured — see lib/oauth-providers.ts. Both call the same signIn("google"/"facebook") entry point; account resolution/linking happens server-side in lib/auth.ts's signIn callback. */
export function OAuthButtons({ google, facebook, callbackUrl }: { google: boolean; facebook: boolean; callbackUrl?: string }) {
  if (!google && !facebook) return null;

  return (
    <div className="space-y-2">
      {google && (
        <form action={oauthSignInAction.bind(null, "google", callbackUrl)}>
          <ProviderButton icon={<GoogleIcon />} label="Continue with Google" connectingLabel="Connecting to Google..." />
        </form>
      )}
      {facebook && (
        <form action={oauthSignInAction.bind(null, "facebook", callbackUrl)}>
          <ProviderButton icon={<FacebookIcon />} label="Continue with Facebook" connectingLabel="Connecting to Facebook..." />
        </form>
      )}
    </div>
  );
}

/** Divider — kept as its own export so callers can place it wherever the OR sits relative to the email/password form, since login and sign-up use opposite orderings (spec items 2/3/16/17). */
export function OrDivider() {
  return (
    <div className="relative py-1 text-center">
      <div className="absolute inset-x-0 top-1/2 border-t border-slate-200" />
      <span className="relative bg-white px-2 text-xs text-slate-400">or</span>
    </div>
  );
}

/** useFormStatus only reports the pending state of its own enclosing <form>, so this must be a child of each provider's form — gives an accurate "Connecting to Google..." for that button alone, and disabling on pending blocks a repeated click from firing a second auth request (spec item 32). */
function ProviderButton({ icon, label, connectingLabel }: { icon: React.ReactNode; label: string; connectingLabel: string }) {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" variant="outline" className="w-full justify-center gap-3" disabled={pending}>
      {pending ? (
        <>
          <Loader2 className="h-4 w-4 animate-spin" /> {connectingLabel}
        </>
      ) : (
        <>
          {icon} {label}
        </>
      )}
    </Button>
  );
}

function GoogleIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 18 18" aria-hidden="true">
      <path
        fill="#4285F4"
        d="M17.64 9.2c0-.64-.06-1.25-.16-1.84H9v3.48h4.84a4.14 4.14 0 0 1-1.8 2.72v2.26h2.9c1.7-1.57 2.7-3.88 2.7-6.62z"
      />
      <path
        fill="#34A853"
        d="M9 18c2.43 0 4.47-.8 5.96-2.18l-2.9-2.26c-.8.54-1.84.86-3.06.86-2.35 0-4.34-1.59-5.05-3.72H.94v2.33A9 9 0 0 0 9 18z"
      />
      <path fill="#FBBC05" d="M3.95 10.7A5.4 5.4 0 0 1 3.67 9c0-.59.1-1.17.28-1.7V4.97H.94A9 9 0 0 0 0 9c0 1.45.35 2.83.94 4.03z" />
      <path
        fill="#EA4335"
        d="M9 3.58c1.32 0 2.51.45 3.44 1.35l2.58-2.58C13.46.89 11.43 0 9 0A9 9 0 0 0 .94 4.97L3.67 7.3C4.38 5.17 6.37 3.58 9 3.58z"
      />
    </svg>
  );
}

function FacebookIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 18 18" aria-hidden="true">
      <circle cx="9" cy="9" r="9" fill="#1877F2" />
      <path
        fill="#fff"
        d="M12.1 9.5h-1.9V15H8.1V9.5H6.7V7.7h1.4V6.4c0-1.4.8-2.6 2.7-2.6.8 0 1.4.1 1.4.1v1.7h-.9c-.8 0-1 .4-1 1.1v1h2z"
      />
    </svg>
  );
}
