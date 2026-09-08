"use server";

import { generateCaptchaChallenge, type CaptchaChallenge } from "@/lib/captcha";
import { isRateLimited, clientIp } from "@/lib/rate-limit";

// Generous — the login form legitimately calls this on every mount and
// after every failed attempt, so a normal user retrying a few times must
// never be affected. Just caps a script hammering this endpoint purely
// to harvest challenge/token pairs or to load-test it.
const CAPTCHA_GENERATE_IP_LIMIT = 120;
const CAPTCHA_GENERATE_IP_WINDOW_MS = 5 * 60 * 1000;

/**
 * Fetches a fresh math CAPTCHA challenge for the login screen — called on
 * mount and after every failed attempt (app/(auth)/login/login-form.tsx),
 * so the visible question always matches the token about to be
 * submitted. No auth required: this runs before a session exists.
 *
 * Usage is tracked against an IP-keyed bucket (isRateLimited still
 * records every call, even ones under the threshold) so a sustained flood
 * from one source is visible/actionable, but deliberately never refuses
 * to hand out a challenge: this endpoint reveals nothing (the answer is
 * never sent to the client) and costs almost nothing to compute, while
 * refusing it outright would let one abusive client deny the login page
 * entirely to everyone sharing its IP/NAT (an office network, a mobile
 * carrier) — the real gate against brute-forcing stays loginAction's own
 * IP/email rate limits on the actual submitted attempt.
 */
export async function getCaptchaChallengeAction(): Promise<CaptchaChallenge> {
  const ip = await clientIp();
  isRateLimited("captcha-generate-ip", ip, CAPTCHA_GENERATE_IP_LIMIT, CAPTCHA_GENERATE_IP_WINDOW_MS);
  return generateCaptchaChallenge();
}
