/**
 * Validates a callbackUrl before ever handing it to signIn's redirectTo —
 * must be a same-origin relative path, never a protocol-relative or
 * absolute URL (open-redirect prevention). Used for "return to the
 * intended page after login" (spec item 33).
 */
export function safeRedirectPath(path: string | null | undefined): string | null {
  if (!path) return null;
  if (!path.startsWith("/") || path.startsWith("//")) return null;
  if (path.includes("://")) return null;
  return path;
}
