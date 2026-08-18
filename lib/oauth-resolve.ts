import { prisma } from "@/lib/prisma";
import { linkOrCreateCustomerForUser } from "@/lib/customer-linking";

export type OAuthProvider = "google" | "facebook";
export type ResolveResult =
  | { ok: true; userId: string; created: boolean }
  | { ok: false; reason: "no_email" | "unverified_email" | "inactive" | "non_customer" };

/**
 * Finds-or-creates the internal User for a verified OAuth identity, and
 * rejects the sign-in outright rather than silently no-op'ing when it isn't
 * safe to proceed. Never stores the provider's password (there isn't one)
 * — passwordHash stays null, so an OAuth-only account can only ever sign in
 * through that provider (the Credentials authorize() in lib/auth.ts
 * explicitly rejects null-hash accounts).
 *
 * Security rules enforced here (all called out explicitly in the 6th
 * update spec):
 * - The provider must supply an email, and Google's `email_verified` claim
 *   must not be explicitly false — an unverified email is never trusted
 *   enough to link to an existing account (item 10). Facebook's Graph API
 *   only ever returns an email for confirmed accounts, so there is no
 *   separate flag to check there.
 * - Social sign-in only ever resolves to a CUSTOMER account. If the
 *   matched email belongs to an Admin/Staff/Production user, the sign-in
 *   is rejected — administrative accounts must stay on password auth
 *   (items 19/20), even though the email happens to match.
 *
 * Email is the join key: an existing CUSTOMER User with this email is
 * reused as-is (so a customer who already registered normally, or
 * connected the other OAuth provider, or was created login-free by
 * Staff/Admin, doesn't get a second account) — otherwise a new CUSTOMER
 * User is created and handed to linkOrCreateCustomerForUser, which
 * attaches it to any pre-existing login-free Customer record with the same
 * email rather than duplicating it, preserving that Customer's whole
 * transaction history.
 *
 * Extracted into its own module (rather than living inline in lib/auth.ts)
 * specifically so it's directly unit-testable against the real seeded DB
 * without needing a live Google/Facebook OAuth handshake.
 */
export async function resolveOAuthUser(
  provider: OAuthProvider,
  email: string | null | undefined,
  name: string,
  image: string | null | undefined,
  emailVerified: boolean | undefined
): Promise<ResolveResult> {
  if (!email) return { ok: false, reason: "no_email" };
  if (provider === "google" && emailVerified === false) return { ok: false, reason: "unverified_email" };

  const normalizedEmail = email.toLowerCase();
  const connectedAtField = provider === "google" ? "googleConnectedAt" : "facebookConnectedAt";

  const existing = await prisma.user.findUnique({ where: { email: normalizedEmail } });
  if (existing) {
    if (!existing.active) return { ok: false, reason: "inactive" };
    if (existing.role !== "CUSTOMER") return { ok: false, reason: "non_customer" };
    await prisma.user.update({ where: { id: existing.id }, data: { [connectedAtField]: new Date() } });
    return { ok: true, userId: existing.id, created: false };
  }

  const user = await prisma.user.create({
    data: {
      name: name || normalizedEmail,
      email: normalizedEmail,
      passwordHash: null,
      role: "CUSTOMER",
      [connectedAtField]: new Date(),
    },
  });
  const customer = await linkOrCreateCustomerForUser(user.id, { name: name || normalizedEmail, email: normalizedEmail });
  if (image && !customer.profileImageUrl) {
    await prisma.customer.update({ where: { id: customer.id }, data: { profileImageUrl: image } });
  }
  return { ok: true, userId: user.id, created: true };
}
