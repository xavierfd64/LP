import type { NextConfig } from "next";

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
};

export default nextConfig;
