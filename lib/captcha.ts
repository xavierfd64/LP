import { randomInt, createHmac, timingSafeEqual } from "crypto";

/**
 * Simple math CAPTCHA for the login screen (Sept 8 — User Management/
 * Password Reset/Login Security improvement) — deliberately weak by
 * design (spec: "keep it simple enough for legitimate customers and
 * staff... do not make the CAPTCHA unnecessarily difficult"), meant to
 * filter naive scripted login floods, not defeat a targeted attacker.
 *
 * Stateless by construction, matching this app's existing session/rate-
 * limit architecture (no Redis or other shared store in its
 * dependencies — see lib/rate-limit.ts's own doc comment): the challenge
 * (operands, operator, expiry) travels in a token signed with an HMAC
 * over AUTH_SECRET/NEXTAUTH_SECRET, so the server can re-derive and
 * verify the expected answer from the token alone without keeping any
 * server-side session for it. The precomputed ANSWER is never included
 * in the token or sent to the client — only the operands (which a human
 * is already shown and expected to add/subtract themselves) — so nothing
 * in the page source or API response leaks the expected result; only the
 * signature ties a specific challenge to its expiry and prevents
 * tampering (an attacker changing the operands without the server
 * secret invalidates the signature).
 */
function secret(): string {
  const s = process.env.AUTH_SECRET || process.env.NEXTAUTH_SECRET;
  if (!s) throw new Error("AUTH_SECRET/NEXTAUTH_SECRET must be set to use the login CAPTCHA.");
  return s;
}

const CAPTCHA_TTL_MS = 5 * 60 * 1000;

function sign(payload: string): string {
  return createHmac("sha256", secret()).update(payload).digest("hex");
}

export type CaptchaChallenge = { question: string; token: string };

/** A fresh challenge — call again for "refresh" (spec: "refresh/retry should generate an appropriate new challenge"). */
export function generateCaptchaChallenge(): CaptchaChallenge {
  const useSubtraction = randomInt(2) === 0;
  let a = randomInt(1, 13);
  let b = randomInt(1, 13);
  if (useSubtraction && a < b) [a, b] = [b, a]; // keep subtraction non-negative
  const op = useSubtraction ? "-" : "+";
  const expiresAt = Date.now() + CAPTCHA_TTL_MS;

  const payload = `${a}.${b}.${op}.${expiresAt}`;
  const token = `${payload}.${sign(payload)}`;

  return { question: `${a} ${op} ${b}`, token };
}

/** Server-side verification — recomputes the expected answer from the signed operands rather than trusting anything the client sent beyond the token+answer. Rejects a tampered, expired, or malformed token. */
export function verifyCaptcha(token: string, submittedAnswer: number): boolean {
  const parts = token.split(".");
  if (parts.length !== 5) return false;
  const [aStr, bStr, op, expiresAtStr, providedSig] = parts;

  const payload = `${aStr}.${bStr}.${op}.${expiresAtStr}`;
  const expectedSig = sign(payload);
  // Constant-time comparison — this is a low-stakes deterrent, not a
  // cryptographic access boundary, but there's no reason to accept a
  // timing side-channel when comparing hex digests is this cheap.
  const sigBuf = Buffer.from(providedSig, "hex");
  const expectedBuf = Buffer.from(expectedSig, "hex");
  if (sigBuf.length !== expectedBuf.length || !timingSafeEqual(sigBuf, expectedBuf)) return false;

  const expiresAt = Number(expiresAtStr);
  if (!Number.isFinite(expiresAt) || Date.now() > expiresAt) return false;

  const a = Number(aStr);
  const b = Number(bStr);
  if (!Number.isFinite(a) || !Number.isFinite(b)) return false;
  const expectedAnswer = op === "-" ? a - b : a + b;

  return submittedAnswer === expectedAnswer;
}
