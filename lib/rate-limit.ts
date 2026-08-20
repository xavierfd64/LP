import { headers } from "next/headers";

type Entry = { count: number; resetAt: number };
type Store = Map<string, Entry>;

/**
 * Best-effort, in-memory, single-instance rate limiter — generalizes the
 * same pragmatic pattern already used by `app/actions/reference-lookup.ts`
 * (a Map keyed by a bucket+key, count/reset-at, no external dependency).
 * This project has no Redis or other distributed store in its dependencies,
 * so this is the safest practical mechanism available without introducing
 * new production infrastructure — it resets on redeploy/restart and does
 * not share state across horizontally-scaled instances. That's an accepted
 * limitation (see the security hardening report), not something invented
 * here to look more robust than it is.
 */
function getStore(bucket: string): Store {
  const g = globalThis as unknown as Record<string, Store | undefined>;
  const key = `__rateLimit_${bucket}`;
  if (!g[key]) g[key] = new Map();
  return g[key]!;
}

/** Returns true if `key` has exceeded `limit` attempts within the trailing `windowMs` for this `bucket`. Every call counts as an attempt, including ones that turn out rate-limited. */
export function isRateLimited(bucket: string, key: string, limit: number, windowMs: number): boolean {
  const store = getStore(bucket);
  const now = Date.now();
  const entry = store.get(key);
  if (!entry || entry.resetAt < now) {
    store.set(key, { count: 1, resetAt: now + windowMs });
    return false;
  }
  entry.count += 1;
  return entry.count > limit;
}

/**
 * Best-effort caller IP from standard proxy headers — Render (and most
 * platforms) sit behind a reverse proxy, so `x-forwarded-for` carries the
 * real client address; this is naturally spoofable by a direct caller that
 * skips the proxy, which only matters for a rate limiter as "an attacker
 * can churn their own claimed IP to dodge the IP-keyed limit" — the
 * account/email-keyed limit below doesn't depend on this and still holds.
 * Falls back to a constant when neither header is present (e.g. local dev
 * with no proxy in front) — everyone shares one bucket in that case, which
 * is fine for a dev environment.
 */
export async function clientIp(): Promise<string> {
  const h = await headers();
  const forwarded = h.get("x-forwarded-for");
  if (forwarded) return forwarded.split(",")[0].trim();
  const real = h.get("x-real-ip");
  if (real) return real;
  return "unknown";
}
