"use server";

import { generateCaptchaChallenge, type CaptchaChallenge } from "@/lib/captcha";

/** Fetches a fresh math CAPTCHA challenge for the login screen — called on mount and after every failed attempt (app/(auth)/login/login-form.tsx), so the visible question always matches the token about to be submitted. No auth required: this runs before a session exists. */
export async function getCaptchaChallengeAction(): Promise<CaptchaChallenge> {
  return generateCaptchaChallenge();
}
