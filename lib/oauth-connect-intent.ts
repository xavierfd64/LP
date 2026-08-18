/**
 * Just the shared cookie name — kept in its own tiny module (rather than
 * inline in lib/auth.ts or app/actions/customer-profile.ts) so both the
 * action that sets it and the signIn callback that reads it import the
 * exact same constant without either depending on the other's file.
 */
export const OAUTH_CONNECT_INTENT_COOKIE = "oauth_connect_intent";
