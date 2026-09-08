import { randomInt } from "crypto";
import { PASSWORD_REQUIREMENTS } from "@/lib/password-policy";

const UPPER = "ABCDEFGHJKLMNPQRSTUVWXYZ"; // no I/O — avoids visual ambiguity with 1/0
const LOWER = "abcdefghijkmnopqrstuvwxyz"; // no l
const DIGITS = "23456789"; // no 0/1
const SPECIAL = "!@#$%^&*";
const ALL = UPPER + LOWER + DIGITS + SPECIAL;

/**
 * Crypto-random temporary password (Node's `crypto.randomInt`, never
 * `Math.random()`) for admin-created accounts and admin/staff password
 * resets — guaranteed to satisfy lib/password-policy.ts's
 * PASSWORD_REQUIREMENTS by construction (one char from each required
 * class, the rest random from the full alphabet, then shuffled so the
 * required characters aren't always in the same position). 12 characters:
 * comfortably above the 8-char minimum so it reads as a real generated
 * secret, short enough to type from a screen if ever shown directly to an
 * admin (the email-unavailable fallback — see resetUserPasswordAction).
 */
export function generateTemporaryPassword(): string {
  const chars = [
    UPPER[randomInt(UPPER.length)],
    LOWER[randomInt(LOWER.length)],
    DIGITS[randomInt(DIGITS.length)],
    SPECIAL[randomInt(SPECIAL.length)],
  ];
  while (chars.length < 12) {
    chars.push(ALL[randomInt(ALL.length)]);
  }
  // Fisher-Yates shuffle using the same CSPRNG source.
  for (let i = chars.length - 1; i > 0; i--) {
    const j = randomInt(i + 1);
    [chars[i], chars[j]] = [chars[j], chars[i]];
  }
  const password = chars.join("");

  // Belt-and-suspenders: the construction above already guarantees every
  // PASSWORD_REQUIREMENTS rule, but re-check explicitly rather than assume
  // — if the policy ever gains a rule this construction doesn't happen to
  // satisfy, regenerate instead of silently handing out a non-compliant
  // temporary password.
  if (PASSWORD_REQUIREMENTS.some((r) => !r.test(password))) return generateTemporaryPassword();
  return password;
}
