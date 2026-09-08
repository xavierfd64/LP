/**
 * Single source of truth for this app's password policy (Sept 8 — User
 * Management/Password Reset/Login Security improvement) — every place a
 * password is set (self-registration, self-service forgot-password,
 * admin-created account, admin/staff password reset, forced password
 * change) validates against the exact same rules here, and the
 * requirements checklist shown to the user (client-safe, no server-only
 * imports) is generated from this same list, so the UI can never drift
 * from what the server actually enforces.
 *
 * Previously the only rule anywhere in this codebase was "at least 6
 * characters" (registerSchema/resetSchema/updateStaffProfileSchema) —
 * genuinely insufficient, not a policy this replaces "weaker" than what
 * existed. Strengthening it only affects passwords set from here on;
 * already-hashed existing passwords are never touched or re-validated.
 */
export type PasswordRequirement = {
  key: string;
  label: string;
  test: (password: string) => boolean;
};

export const PASSWORD_REQUIREMENTS: PasswordRequirement[] = [
  { key: "length", label: "At least 8 characters", test: (p) => p.length >= 8 },
  { key: "uppercase", label: "Include uppercase and lowercase letters", test: (p) => /[A-Z]/.test(p) && /[a-z]/.test(p) },
  { key: "number", label: "Include a number", test: (p) => /[0-9]/.test(p) },
  { key: "special", label: "Include a special character (e.g. ! @ # $ % ^ & *)", test: (p) => /[^A-Za-z0-9]/.test(p) },
];

/** First unmet requirement's message, or null if the password satisfies every rule. Used inside zod `.refine()` wherever a password is set. */
export function validatePasswordPolicy(password: string): string | null {
  for (const req of PASSWORD_REQUIREMENTS) {
    if (!req.test(password)) return `Password requirement not met: ${req.label.toLowerCase()}.`;
  }
  return null;
}

export function passwordMeetsPolicy(password: string): boolean {
  return validatePasswordPolicy(password) === null;
}
