/**
 * Progressive failed-login lockout state machine (Sept 8 — User Profile/
 * Progressive Lockout/Security History improvement). Pure functions only
 * — no Prisma/DB access here — so the escalation rules can be reasoned
 * about (and unit-tested) independently of where they're enforced. The
 * actual enforcement point is lib/auth.ts's Credentials authorize()
 * callback, the one place every credential check flows through.
 *
 * Escalation (business rule, exactly as specified):
 *   2 failed attempts  -> 30-minute lock  (stage 0 -> 1)
 *   2 more failures    -> 1-hour lock     (stage 1 -> 2)
 *   2 more failures    -> 5-hour lock     (stage 2 -> 3)
 *   1 final attempt    -> succeed: fully reset
 *                         fail:    24-hour block (stage 3 -> 4)
 *   24-hour block expires with no admin action -> next attempt starts a
 *   completely fresh cycle (stage 4 -> 0), not a 5th timed stage.
 *
 * A locked/blocked account rejects login attempts outright (checked by
 * the caller via isCurrentlyLocked before calling nextStateAfterFailedLogin)
 * — those rejected attempts never themselves advance the counters, since
 * the account is already exactly as locked as it's going to get.
 *
 * CAPTCHA failures deliberately never reach this module at all — see
 * app/actions/auth.ts's loginAction for why (a wrong CAPTCHA answer says
 * nothing about whether the password was even attempted, and counting it
 * here would let anyone lock a victim out just by submitting bad CAPTCHA
 * answers against their email, which is easier than guessing a password).
 */

export const LOCKOUT_DURATIONS_MS: Record<1 | 2 | 3 | 4, number> = {
  1: 30 * 60 * 1000,
  2: 60 * 60 * 1000,
  3: 5 * 60 * 60 * 1000,
  4: 24 * 60 * 60 * 1000,
};

export type LockoutState = {
  failedLoginCount: number;
  lockoutStage: number;
  lockedUntil: Date | null;
};

export type LockoutEvent =
  | "FAILED_NO_LOCK"
  | "LOCKOUT_30M"
  | "LOCKOUT_1H"
  | "LOCKOUT_5H"
  | "BLOCKED_24H";

export function isCurrentlyLocked(state: LockoutState, now: Date = new Date()): boolean {
  return !!state.lockedUntil && state.lockedUntil.getTime() > now.getTime();
}

export function resetLockoutState(): LockoutState {
  return { failedLoginCount: 0, lockoutStage: 0, lockedUntil: null };
}

/**
 * Called only when the account was NOT currently locked at the moment of
 * this attempt (caller already checked isCurrentlyLocked) and the
 * password just submitted turned out to be wrong. Returns the next state
 * to persist and which event happened, for audit logging.
 */
export function nextStateAfterFailedLogin(state: LockoutState, now: Date = new Date()): { state: LockoutState; event: LockoutEvent } {
  // Stage 3's 5-hour lock has already expired (or this account never
  // needed to be told twice) — this is the one allowed final attempt.
  // Any failure here goes straight to the terminal 24-hour block.
  if (state.lockoutStage === 3) {
    return {
      state: { failedLoginCount: 0, lockoutStage: 4, lockedUntil: new Date(now.getTime() + LOCKOUT_DURATIONS_MS[4]) },
      event: "BLOCKED_24H",
    };
  }

  // A fully-expired 24-hour block starts a fresh cycle rather than trying
  // to resume mid-escalation — there is no stage 5.
  const effectiveStage = state.lockoutStage === 4 ? 0 : state.lockoutStage;
  const baseCount = effectiveStage === state.lockoutStage ? state.failedLoginCount : 0;
  const newCount = baseCount + 1;

  if (newCount < 2) {
    return { state: { failedLoginCount: newCount, lockoutStage: effectiveStage, lockedUntil: null }, event: "FAILED_NO_LOCK" };
  }

  const newStage = (effectiveStage + 1) as 1 | 2 | 3;
  const event: LockoutEvent = newStage === 1 ? "LOCKOUT_30M" : newStage === 2 ? "LOCKOUT_1H" : "LOCKOUT_5H";
  return {
    state: { failedLoginCount: 0, lockoutStage: newStage, lockedUntil: new Date(now.getTime() + LOCKOUT_DURATIONS_MS[newStage]) },
    event,
  };
}

function formatRemaining(lockedUntil: Date, now: Date): string {
  const ms = Math.max(0, lockedUntil.getTime() - now.getTime());
  const minutes = Math.ceil(ms / 60000);
  if (minutes <= 1) return "1 minute";
  if (minutes < 60) return `${minutes} minutes`;
  const hours = Math.round(minutes / 60);
  return hours <= 1 ? "1 hour" : `${hours} hours`;
}

/** The exact user-facing message for a currently-locked/blocked account — never reveals the internal stage number or attempt counters. */
export function lockoutMessage(stage: number, lockedUntil: Date, now: Date = new Date()): string {
  if (stage >= 4) {
    return "Your account has been blocked for 24 hours due to repeated failed login attempts. Please contact an administrator.";
  }
  return `Too many failed login attempts. Your account is temporarily locked. Please try again in ${formatRemaining(lockedUntil, now)}.`;
}
