"use server";

import { z } from "zod";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/session";
import { logAudit } from "@/lib/audit";
import { encryptSecret } from "@/lib/email-crypto";

const providerSchema = z.object({
  googleClientId: z.string().optional(),
  googleClientSecret: z.string().optional(),
  facebookClientId: z.string().optional(),
  facebookClientSecret: z.string().optional(),
});

/**
 * Saves Google/Facebook OAuth credentials to BusinessSettings (encrypted
 * at rest, same as the SMTP password / Messenger Page token) — the
 * Admin-facing alternative to setting GOOGLE_CLIENT_ID/SECRET and
 * FACEBOOK_CLIENT_ID/SECRET as environment variables (see lib/auth.ts's
 * resolveOAuthCredentials for the precedence). A blank Client ID field
 * clears that provider's stored Client ID; a blank secret field always
 * means "keep the existing one" — the form never displays it back, so
 * there's no other way to represent "leave unchanged."
 */
export async function updateAuthProviderSettingsAction(_prevState: string | undefined, formData: FormData) {
  const user = await requireRole(["ADMIN"]);

  const parsed = providerSchema.safeParse({
    googleClientId: formData.get("googleClientId") || undefined,
    googleClientSecret: formData.get("googleClientSecret") || undefined,
    facebookClientId: formData.get("facebookClientId") || undefined,
    facebookClientSecret: formData.get("facebookClientSecret") || undefined,
  });
  if (!parsed.success) return parsed.error.issues[0]?.message ?? "Invalid input.";

  const data: Record<string, unknown> = {
    googleClientId: parsed.data.googleClientId || null,
    facebookClientId: parsed.data.facebookClientId || null,
  };
  if (parsed.data.googleClientSecret) {
    data.googleClientSecretEnc = encryptSecret(parsed.data.googleClientSecret);
  }
  if (parsed.data.facebookClientSecret) {
    data.facebookClientSecretEnc = encryptSecret(parsed.data.facebookClientSecret);
  }
  // Clearing the Client ID for a provider also clears its stored secret —
  // otherwise a half-configured, orphaned secret would sit unused in the
  // database indefinitely.
  if (!parsed.data.googleClientId) data.googleClientSecretEnc = null;
  if (!parsed.data.facebookClientId) data.facebookClientSecretEnc = null;

  await prisma.businessSettings.upsert({
    where: { id: "default" },
    create: { id: "default", ...data },
    update: data,
  });

  await logAudit(user.id, "AUTH_PROVIDER_SETTINGS_UPDATED", "BusinessSettings", "default", {
    googleConfigured: !!parsed.data.googleClientId,
    facebookConfigured: !!parsed.data.facebookClientId,
  });

  redirect("/admin/auth-settings");
}
