import { createCipheriv, createDecipheriv, randomBytes, scryptSync } from "crypto";

/**
 * Encrypts integration secrets at rest (SMTP password, OAuth client
 * secrets, Messenger Page token/App secret) with AES-256-GCM.
 *
 * Key separation (security hardening pass #2, finding M1): the encryption
 * key is a DEDICATED secret (INTEGRATION_ENCRYPTION_KEY), never the same
 * value as AUTH_SECRET/NEXTAUTH_SECRET — that secret's job is JWT/session
 * signing, an unrelated cryptographic purpose, and reusing it here meant
 * anyone who obtained AUTH_SECRET (e.g. to forge a session) could also
 * decrypt every stored integration credential with the same value.
 *
 * Migration safety: every value this module has ever encrypted was written
 * under the OLD AUTH_SECRET-derived key with a fixed salt, using the
 * 3-part `iv.tag.data` format. Introducing a new key/salt combination can't
 * silently re-key existing rows, so the stored format now carries an
 * explicit version tag: new encryptions always use a 4-part `v2.iv.tag.data`
 * format under the dedicated key when INTEGRATION_ENCRYPTION_KEY is set;
 * decryptSecret() recognizes both formats and picks the matching
 * key/salt, so every previously-stored secret keeps decrypting exactly as
 * before with zero manual data migration required. Existing settings
 * re-encrypt under the new key automatically the next time an admin saves
 * that settings form (SMTP password, OAuth secret, Messenger token) — no
 * forced action needed, but doing so once INTEGRATION_ENCRYPTION_KEY is set
 * is how a row actually moves off the legacy key.
 *
 * If INTEGRATION_ENCRYPTION_KEY is NOT set (not yet configured in this
 * environment), encryption falls back to the legacy AUTH_SECRET-derived
 * key so nothing breaks — this is reported as a MANUAL ACTION REQUIRED
 * item, not silently treated as fixed. Server-only module (uses Node's
 * `crypto`); never imported from a Client Component.
 */
function deriveKey(version: "legacy" | "v2"): Buffer {
  if (version === "v2") {
    const dedicated = process.env.INTEGRATION_ENCRYPTION_KEY;
    if (!dedicated) throw new Error("INTEGRATION_ENCRYPTION_KEY must be set to use v2 encryption.");
    return scryptSync(dedicated, "lp-integration-secrets-v2", 32);
  }
  const secret = process.env.AUTH_SECRET || process.env.NEXTAUTH_SECRET;
  if (!secret) throw new Error("AUTH_SECRET/NEXTAUTH_SECRET must be set to store email credentials.");
  return scryptSync(secret, "lp-email-credentials", 32);
}

export function encryptSecret(plaintext: string): string {
  const hasDedicatedKey = Boolean(process.env.INTEGRATION_ENCRYPTION_KEY);
  const version = hasDedicatedKey ? "v2" : "legacy";
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", deriveKey(version), iv);
  const encrypted = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const authTag = cipher.getAuthTag();
  const parts = [iv.toString("base64"), authTag.toString("base64"), encrypted.toString("base64")];
  return version === "v2" ? ["v2", ...parts].join(".") : parts.join(".");
}

export function decryptSecret(stored: string): string {
  const segments = stored.split(".");
  const [version, ivB64, tagB64, dataB64] = segments.length === 4 ? (segments as [string, string, string, string]) : ["legacy", ...segments] as [string, string, string, string];
  const decipher = createDecipheriv("aes-256-gcm", deriveKey(version === "v2" ? "v2" : "legacy"), Buffer.from(ivB64, "base64"));
  decipher.setAuthTag(Buffer.from(tagB64, "base64"));
  const decrypted = Buffer.concat([decipher.update(Buffer.from(dataB64, "base64")), decipher.final()]);
  return decrypted.toString("utf8");
}
