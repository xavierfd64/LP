"use client";

import { oauthSignInAction } from "@/app/actions/auth";
import { Button } from "@/components/ui/button";

/** Renders only the providers actually configured — see lib/oauth-providers.ts. Both call the same signIn("google"/"facebook") entry point; account resolution/linking happens server-side in lib/auth.ts's jwt callback. */
export function OAuthButtons({ google, facebook }: { google: boolean; facebook: boolean }) {
  if (!google && !facebook) return null;

  return (
    <div className="space-y-2">
      {google && (
        <form action={oauthSignInAction.bind(null, "google")}>
          <Button type="submit" variant="outline" className="w-full">
            Continue with Google
          </Button>
        </form>
      )}
      {facebook && (
        <form action={oauthSignInAction.bind(null, "facebook")}>
          <Button type="submit" variant="outline" className="w-full">
            Continue with Facebook
          </Button>
        </form>
      )}
      <div className="relative py-1 text-center">
        <div className="absolute inset-x-0 top-1/2 border-t border-slate-200" />
        <span className="relative bg-white px-2 text-xs text-slate-400">or</span>
      </div>
    </div>
  );
}
