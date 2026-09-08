"use client";

import { useActionState, useEffect, useState } from "react";
import Link from "next/link";
import { Eye, EyeOff, RefreshCw } from "lucide-react";
import { loginAction } from "@/app/actions/auth";
import { getCaptchaChallengeAction } from "@/app/actions/captcha";
import { Button } from "@/components/ui/button";
import { Input, Label } from "@/components/ui/input";
import { Alert } from "@/components/ui/alert";
import { LoginLoadingScreen } from "@/components/auth/login-loading-screen";

export function LoginForm({
  callbackUrl,
  businessName,
  tagline,
  logoPath,
}: {
  callbackUrl?: string;
  businessName: string;
  tagline: string | null;
  logoPath: string | null;
}) {
  const [error, formAction, pending] = useActionState(loginAction, undefined);
  const [showPassword, setShowPassword] = useState(false);
  const [captcha, setCaptcha] = useState<{ question: string; token: string } | null>(null);
  const [captchaAnswer, setCaptchaAnswer] = useState("");

  async function refreshCaptcha() {
    setCaptcha(await getCaptchaChallengeAction());
    setCaptchaAnswer("");
  }

  // A fresh challenge is required whenever the previous one was already
  // consumed by a failed attempt — a stale token would otherwise still
  // pass verification until its 5-minute expiry, which is fine for the
  // token itself but confusing for the visible question shown (Sept 8:
  // "refresh/retry should generate an appropriate new challenge").
  useEffect(() => {
    refreshCaptcha();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [error]);

  return (
    <>
      {pending && <LoginLoadingScreen businessName={businessName} tagline={tagline} logoPath={logoPath} />}
      <form action={formAction} className="space-y-4">
        {callbackUrl && <input type="hidden" name="callbackUrl" value={callbackUrl} />}
        {error && <Alert tone="error">{error}</Alert>}
        <div>
          <Label htmlFor="email">Email</Label>
          <Input id="email" name="email" type="email" required placeholder="you@company.com" />
        </div>
        <div>
          <div className="flex items-center justify-between">
            <Label htmlFor="password" className="mb-0">
              Password
            </Label>
            <Link href="/forgot-password" className="text-xs font-medium text-brand-600 underline hover:text-brand-700">
              Forgot password?
            </Link>
          </div>
          <div className="relative mt-1">
            <Input
              id="password"
              name="password"
              type={showPassword ? "text" : "password"}
              required
              placeholder="••••••••"
              className="pr-10"
            />
            <button
              type="button"
              onClick={() => setShowPassword((v) => !v)}
              aria-label={showPassword ? "Hide password" : "Show password"}
              className="absolute inset-y-0 right-0 flex items-center px-3 text-slate-400 hover:text-slate-700"
            >
              {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
            </button>
          </div>
        </div>
        <div>
          <Label htmlFor="captchaAnswer">Security Check</Label>
          <input type="hidden" name="captchaToken" value={captcha?.token ?? ""} />
          <div className="flex items-center gap-2">
            <span className="whitespace-nowrap text-sm text-slate-600">
              Solve: {captcha?.question ?? "…"} =
            </span>
            <Input
              id="captchaAnswer"
              name="captchaAnswer"
              type="text"
              inputMode="numeric"
              required
              className="w-20"
              value={captchaAnswer}
              onChange={(e) => setCaptchaAnswer(e.target.value)}
            />
            <button
              type="button"
              onClick={refreshCaptcha}
              aria-label="Get a new security check"
              className="rounded p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700"
            >
              <RefreshCw className="h-4 w-4" />
            </button>
          </div>
        </div>
        <Button type="submit" className="w-full" disabled={pending || !captcha}>
          {pending ? "Signing in..." : "Sign in"}
        </Button>
      </form>
    </>
  );
}
