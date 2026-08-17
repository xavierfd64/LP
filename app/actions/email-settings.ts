"use server";

import { z } from "zod";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/session";
import { logAudit } from "@/lib/audit";
import { encryptSecret } from "@/lib/email-crypto";
import { sendTestEmail } from "@/lib/email";
import { EMAIL_EVENTS, type EmailEventKey } from "@/lib/email-events";

const providerSchema = z.object({
  emailProvider: z.enum(["GMAIL", "YAHOO", "OUTLOOK", "CUSTOM_SMTP"]),
  emailSenderName: z.string().optional(),
  emailSenderAddress: z.string().email("Enter a valid sender email."),
  emailSmtpUsername: z.string().optional(),
  emailSmtpPassword: z.string().optional(),
  emailSmtpHost: z.string().optional(),
  emailSmtpPort: z.coerce.number().optional(),
  emailSmtpSecure: z.coerce.boolean().optional(),
});

/** Master switch — kept as its own tiny action so toggling it never risks touching (or requiring re-entry of) the credential fields. */
export async function toggleEmailMasterSwitchAction(enabled: boolean) {
  const user = await requireRole(["ADMIN"]);
  await prisma.businessSettings.upsert({
    where: { id: "default" },
    create: { id: "default", emailEnabled: enabled },
    update: { emailEnabled: enabled },
  });
  await logAudit(user.id, "EMAIL_MASTER_SWITCH_CHANGED", "BusinessSettings", "default", { enabled });
  redirect("/admin/email-settings");
}

export async function updateEmailProviderAction(_prevState: string | undefined, formData: FormData) {
  const user = await requireRole(["ADMIN"]);

  const parsed = providerSchema.safeParse({
    emailProvider: formData.get("emailProvider"),
    emailSenderName: formData.get("emailSenderName") || undefined,
    emailSenderAddress: formData.get("emailSenderAddress"),
    emailSmtpUsername: formData.get("emailSmtpUsername") || undefined,
    emailSmtpPassword: formData.get("emailSmtpPassword") || undefined,
    emailSmtpHost: formData.get("emailSmtpHost") || undefined,
    emailSmtpPort: formData.get("emailSmtpPort") || undefined,
    emailSmtpSecure: formData.get("emailSmtpSecure") === "on",
  });
  if (!parsed.success) return parsed.error.issues[0]?.message ?? "Invalid input.";

  if (parsed.data.emailProvider === "CUSTOM_SMTP" && !parsed.data.emailSmtpHost) {
    return "Custom SMTP requires a host.";
  }

  const data: Record<string, unknown> = {
    emailProvider: parsed.data.emailProvider,
    emailSenderName: parsed.data.emailSenderName || null,
    emailSenderAddress: parsed.data.emailSenderAddress,
    emailSmtpUsername: parsed.data.emailSmtpUsername || null,
    emailSmtpHost: parsed.data.emailProvider === "CUSTOM_SMTP" ? parsed.data.emailSmtpHost : null,
    emailSmtpPort: parsed.data.emailProvider === "CUSTOM_SMTP" ? parsed.data.emailSmtpPort : null,
    emailSmtpSecure: parsed.data.emailProvider === "CUSTOM_SMTP" ? !!parsed.data.emailSmtpSecure : true,
  };

  // Only overwrite the stored (encrypted) password if a new one was
  // actually entered — the form never displays the existing one, so
  // leaving the field blank means "keep what's already saved."
  if (parsed.data.emailSmtpPassword) {
    data.emailSmtpPasswordEnc = encryptSecret(parsed.data.emailSmtpPassword);
  }

  await prisma.businessSettings.upsert({
    where: { id: "default" },
    create: { id: "default", ...data },
    update: data,
  });

  await logAudit(user.id, "EMAIL_PROVIDER_UPDATED", "BusinessSettings", "default", {
    emailProvider: parsed.data.emailProvider,
  });

  redirect("/admin/email-settings");
}

export async function updateEmailEventSettingAction(key: string, enabled: boolean) {
  const user = await requireRole(["ADMIN"]);
  if (!(key in EMAIL_EVENTS)) throw new Error("Unknown email event.");

  const settings = await prisma.businessSettings.findUnique({ where: { id: "default" } });
  const current = (settings?.emailEventSettings as Record<string, boolean>) ?? {};
  const next = { ...current, [key]: enabled };

  await prisma.businessSettings.upsert({
    where: { id: "default" },
    create: { id: "default", emailEventSettings: next },
    update: { emailEventSettings: next },
  });

  await logAudit(user.id, "EMAIL_EVENT_SETTING_CHANGED", "BusinessSettings", "default", { key, enabled });
  redirect("/admin/email-settings");
}

export type TestEmailResult = { ok: boolean; error?: string };

export async function testEmailConnectionAction(recipient: string): Promise<TestEmailResult> {
  await requireRole(["ADMIN"]);
  if (!recipient || !recipient.includes("@")) return { ok: false, error: "Enter a valid test recipient email." };
  return sendTestEmail(recipient);
}

const templateSchema = z.object({
  subject: z.string().min(1, "Subject is required."),
  bodyHtml: z.string().min(1, "Body is required."),
});

export async function saveEmailTemplateAction(key: string, _prevState: string | undefined, formData: FormData) {
  const user = await requireRole(["ADMIN"]);
  if (!(key in EMAIL_EVENTS)) return "Unknown email event.";

  const parsed = templateSchema.safeParse({
    subject: formData.get("subject"),
    bodyHtml: formData.get("bodyHtml"),
  });
  if (!parsed.success) return parsed.error.issues[0]?.message ?? "Invalid input.";

  await prisma.emailTemplate.upsert({
    where: { key },
    create: { key, subject: parsed.data.subject, bodyHtml: parsed.data.bodyHtml },
    update: { subject: parsed.data.subject, bodyHtml: parsed.data.bodyHtml },
  });

  await logAudit(user.id, "EMAIL_TEMPLATE_UPDATED", "EmailTemplate", key as EmailEventKey, {});
  redirect("/admin/email-settings/templates");
}
