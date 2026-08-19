"use server";

import { z } from "zod";
import { redirect } from "next/navigation";
import { updateTag } from "next/cache";
import { prisma } from "@/lib/prisma";
import { BUSINESS_SETTINGS_TAG } from "@/lib/business-settings";
import { requireRole } from "@/lib/session";
import { logAudit } from "@/lib/audit";
import { encryptSecret } from "@/lib/email-crypto";
import { sendTestMessengerMessage } from "@/lib/messenger";
import { MESSENGER_CATEGORIES, type MessengerCategory } from "@/lib/messenger-events";

/** Master switch — its own tiny action so toggling it never risks touching (or requiring re-entry of) the Page credentials, mirroring toggleEmailMasterSwitchAction. */
export async function toggleMessengerMasterSwitchAction(enabled: boolean) {
  const user = await requireRole(["ADMIN"]);
  await prisma.businessSettings.upsert({
    where: { id: "default" },
    create: { id: "default", messengerEnabled: enabled },
    update: { messengerEnabled: enabled },
  });
  updateTag(BUSINESS_SETTINGS_TAG);
  await logAudit(user.id, "MESSENGER_MASTER_SWITCH_CHANGED", "BusinessSettings", "default", { enabled });
  redirect("/admin/messenger-settings");
}

const providerSchema = z.object({
  messengerPageId: z.string().min(1, "Page ID is required."),
  messengerVerifyToken: z.string().min(1, "Verify Token is required."),
  messengerPageAccessToken: z.string().optional(),
  messengerAppSecret: z.string().optional(),
});

export async function updateMessengerProviderAction(_prevState: string | undefined, formData: FormData) {
  const user = await requireRole(["ADMIN"]);

  const parsed = providerSchema.safeParse({
    messengerPageId: formData.get("messengerPageId"),
    messengerVerifyToken: formData.get("messengerVerifyToken"),
    messengerPageAccessToken: formData.get("messengerPageAccessToken") || undefined,
    messengerAppSecret: formData.get("messengerAppSecret") || undefined,
  });
  if (!parsed.success) return parsed.error.issues[0]?.message ?? "Invalid input.";

  const data: Record<string, unknown> = {
    messengerPageId: parsed.data.messengerPageId,
    messengerVerifyToken: parsed.data.messengerVerifyToken,
  };
  // Only overwrite stored secrets if a new value was actually entered — the
  // form never displays them back, so a blank field means "keep as-is."
  if (parsed.data.messengerPageAccessToken) {
    data.messengerPageAccessTokenEnc = encryptSecret(parsed.data.messengerPageAccessToken);
  }
  if (parsed.data.messengerAppSecret) {
    data.messengerAppSecretEnc = encryptSecret(parsed.data.messengerAppSecret);
  }

  await prisma.businessSettings.upsert({
    where: { id: "default" },
    create: { id: "default", ...data },
    update: data,
  });
  updateTag(BUSINESS_SETTINGS_TAG);

  await logAudit(user.id, "MESSENGER_PROVIDER_UPDATED", "BusinessSettings", "default", { messengerPageId: parsed.data.messengerPageId });
  redirect("/admin/messenger-settings");
}

export async function updateMessengerEventSettingAction(category: MessengerCategory, enabled: boolean) {
  const user = await requireRole(["ADMIN"]);
  if (!MESSENGER_CATEGORIES.some((c) => c.key === category)) throw new Error("Unknown Messenger category.");

  const settings = await prisma.businessSettings.findUnique({ where: { id: "default" } });
  const current = (settings?.messengerEventSettings as Record<string, boolean>) ?? {};
  const next = { ...current, [category]: enabled };

  await prisma.businessSettings.upsert({
    where: { id: "default" },
    create: { id: "default", messengerEventSettings: next },
    update: { messengerEventSettings: next },
  });
  updateTag(BUSINESS_SETTINGS_TAG);

  await logAudit(user.id, "MESSENGER_EVENT_SETTING_CHANGED", "BusinessSettings", "default", { category, enabled });
  redirect("/admin/messenger-settings");
}

export type TestMessengerResult = { ok: boolean; error?: string };

/** Unlike email's arbitrary test recipient, a Messenger test can only go to a customer who has already connected — there's no equivalent of "type any address in." */
export async function testMessengerConnectionAction(customerId: string): Promise<TestMessengerResult> {
  await requireRole(["ADMIN"]);
  if (!customerId) return { ok: false, error: "Select a connected customer to test with." };
  return sendTestMessengerMessage(customerId);
}
