import { createCipheriv, createDecipheriv, randomBytes, scryptSync } from "crypto";

/**
 * Encrypts the SMTP password at rest (BusinessSettings.emailSmtpPasswordEnc)
 * with AES-256-GCM. The key is derived from AUTH_SECRET/NEXTAUTH_SECRET —
 * already a required server-only secret in this app (used by next-auth) —
 * rather than asking for a brand-new env var most deployments would forget
 * to set. Server-only module (uses Node's `crypto`); never imported from a
 * Client Component.
 */
function deriveKey(): Buffer {
  const secret = process.env.AUTH_SECRET || process.env.NEXTAUTH_SECRET;
  if (!secret) throw new Error("AUTH_SECRET/NEXTAUTH_SECRET must be set to store email credentials.");
  return scryptSync(secret, "lp-email-credentials", 32);
}

export function encryptSecret(plaintext: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", deriveKey(), iv);
  const encrypted = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const authTag = cipher.getAuthTag();
  return [iv.toString("base64"), authTag.toString("base64"), encrypted.toString("base64")].join(".");
}

export function decryptSecret(stored: string): string {
  const [ivB64, tagB64, dataB64] = stored.split(".");
  const decipher = createDecipheriv("aes-256-gcm", deriveKey(), Buffer.from(ivB64, "base64"));
  decipher.setAuthTag(Buffer.from(tagB64, "base64"));
  const decrypted = Buffer.concat([decipher.update(Buffer.from(dataB64, "base64")), decipher.final()]);
  return decrypted.toString("utf8");
}
