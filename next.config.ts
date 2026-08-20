import type { NextConfig } from "next";

/**
 * Scoped to what this app actually needs, verified against the real code
 * (not a generic template) before writing this:
 *  - script-src/style-src need 'unsafe-inline': Next.js's own hydration
 *    bootstrap requires inline <script>, the live theme-override <style>
 *    tag in app/layout.tsx (sourced only from validated hex colors + a
 *    fixed font-key enum, never free-form text — see its own comment) and
 *    several components' inline `style={{...}}` attributes both need it.
 *    A nonce-based CSP would remove this, but that requires forcing
 *    dynamic rendering app-wide (a real architectural change) — out of
 *    scope for this hardening pass; recorded as a follow-up, not silently
 *    dropped. No externally-hosted script/style is ever loaded, so this
 *    still blocks the actual attack this exists to stop: an injected
 *    `<script src="https://attacker...">`.
 *  - img-src allows https: because Business Settings lets an Admin paste
 *    an arbitrary external logo/favicon URL (see isSafeImageUrl in
 *    app/actions/business-settings.ts) — restricting to specific domains
 *    isn't possible without breaking that feature. data: is for the
 *    QR-code image (lib "qrcode" toDataURL) in the Messenger dispatch UI.
 *  - No external script, font, or connect targets exist anywhere in the
 *    app (grepped for external fetch()/<script src>/font hosts — next/font
 *    self-hosts Google Fonts at build time, nothing else reaches out), so
 *    those all stay 'self'-only.
 *  - No <iframe> exists anywhere and nothing requires this app's own pages
 *    (including the public /track and /documents links) to be embeddable
 *    elsewhere, so frame-ancestors/frame-src are both fully locked down.
 */
// React's dev-mode debugging (call-stack reconstruction) genuinely needs
// eval() — Next.js's own CSP guide is explicit that this is dev-only and
// "not required for production... neither React nor Next.js use eval() in
// production by default." Verified empirically: with this omitted, every
// page in dev logged a blocked-eval console error; production must never
// carry this, so it's excluded whenever NODE_ENV is actually "production".
const scriptSrc = process.env.NODE_ENV === "production" ? "script-src 'self' 'unsafe-inline'" : "script-src 'self' 'unsafe-inline' 'unsafe-eval'";

const CSP = [
  "default-src 'self'",
  scriptSrc,
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: https:",
  "font-src 'self'",
  "connect-src 'self'",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-src 'none'",
  "frame-ancestors 'none'",
].join("; ");

const securityHeaders = [
  { key: "Content-Security-Policy", value: CSP },
  { key: "X-Content-Type-Options", value: "nosniff" },
  // Belt-and-suspenders alongside frame-ancestors above — older browsers
  // that don't honor CSP frame-ancestors still respect this.
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
];

// Only ever sent in production, and only meaningful over an actual HTTPS
// connection (browsers ignore HSTS received over plain HTTP by spec) — kept
// out of dev explicitly rather than relying on that alone, so a local
// `npm run dev` over http://localhost is never affected either way.
if (process.env.NODE_ENV === "production") {
  securityHeaders.push({ key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains" });
}

const nextConfig: NextConfig = {
  experimental: {
    serverActions: {
      // Chat attachments allow up to 10MB (see ATTACHMENT_MAX_BYTES in
      // app/actions/messages.ts) — the default 1MB Server Action body limit
      // would reject those uploads with a raw framework error before our
      // own size-limit message ever runs.
      bodySizeLimit: "12mb",
    },
    // proxy.ts (our auth middleware, matched on nearly every route) has its
    // own independent 10MB default body cap — found by bisection: raising
    // serverActions.bodySizeLimit alone didn't move a hard failure that sat
    // exactly at 10MB regardless. Both limits need enough headroom above
    // ATTACHMENT_MAX_BYTES, since a chat send request passes through the
    // proxy before it ever reaches the Server Action.
    proxyClientMaxBodySize: 12 * 1024 * 1024,
  },
  async headers() {
    return [{ source: "/:path*", headers: securityHeaders }];
  },
};

export default nextConfig;
