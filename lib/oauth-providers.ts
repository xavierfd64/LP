/**
 * Server-only: which OAuth sign-in buttons should render. Google/Facebook
 * only show up once real API credentials are configured — until then the
 * login/register pages fall back to plain email/password only, with the
 * architecture already wired so flipping on the env vars is all it takes
 * (spec: "build the system architecture/settings cleanly so it can be
 * connected without redesigning [it]").
 */
export function availableOAuthProviders() {
  return {
    google: Boolean(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET),
    facebook: Boolean(process.env.FACEBOOK_CLIENT_ID && process.env.FACEBOOK_CLIENT_SECRET),
  };
}
