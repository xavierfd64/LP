/**
 * Maps every error code the login page's `?error=` query param can carry —
 * NextAuth's own built-in codes plus our custom ones from lib/auth.ts's
 * signIn callback — to a professional, non-technical message. Never shows
 * a raw OAuth/API error or an unmapped code (spec items 24/26).
 */
const MESSAGES: Record<string, string> = {
  AccountRestricted: "This account cannot sign in with Google or Facebook. Please use your email and password.",
  EmailNotVerified: "Please use a verified email address to sign in with Google.",
  OAuthAccountInactive: "This account is inactive. Please contact support.",
  EmailMismatch: "That account's email doesn't match your account. Nothing was connected — please try again with an account that uses the same email address.",
  NoEmailFromProvider: "We couldn't get an email address from that provider. Please try again or use a different sign-in method.",
  OAuthSignin: "Google or Facebook sign-in is currently unavailable. Please use email/password or try again later.",
  OAuthCallback: "Google or Facebook sign-in is currently unavailable. Please use email/password or try again later.",
  OAuthCreateAccount: "We couldn't create your account with that provider. Please try again or use email/password.",
  Configuration: "Social sign-in is currently unavailable. Please use email/password.",
  AccessDenied: "Sign-in was not completed. Please try again.",
  CredentialsSignin: "Invalid email or password.",
};

export function friendlyAuthError(code: string | undefined): string | undefined {
  if (!code) return undefined;
  return MESSAGES[code] ?? "Something went wrong signing you in. Please try again or use email/password.";
}
