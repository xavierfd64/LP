import nodemailer from "nodemailer";
import { prisma } from "@/lib/prisma";
import { getBusinessSettings } from "@/lib/business-settings";
import { decryptSecret } from "@/lib/email-crypto";
import {
  EMAIL_EVENTS,
  NON_EMAIL_TYPES,
  renderTemplate,
  defaultSubjectFor,
  defaultBodyFor,
  type EmailEventKey,
  type EmailVariables,
} from "@/lib/email-events";

/**
 * Fixed host/port for the three "one-click" providers — Admin only supplies
 * the mailbox address + App Password. CUSTOM_SMTP reads every field from
 * Business Settings. Real Google/Microsoft OAuth (registering an app,
 * running a consent flow, refreshing tokens) is out of scope here — it
 * needs credentials this system has no way to obtain on its own. App
 * Password is one of the mechanisms the spec explicitly allows, and is
 * what actually works for SMTP against all three providers today.
 */
function providerHost(provider: string): { host: string; port: number; secure: boolean } {
  switch (provider) {
    case "GMAIL":
      return { host: "smtp.gmail.com", port: 465, secure: true };
    case "YAHOO":
      return { host: "smtp.mail.yahoo.com", port: 465, secure: true };
    case "OUTLOOK":
      return { host: "smtp.office365.com", port: 587, secure: false };
    default:
      throw new Error("Unknown provider");
  }
}

export type ResolvedEmailTransport = {
  transporter: nodemailer.Transporter;
  fromAddress: string;
  fromName: string;
};

const SMTP_TIMEOUTS = {
  // Nodemailer's own defaults (2min connect / 10min socket) leave a "Test
  // Email Connection" click stuck on "Sending..." for far too long against
  // a blocked or unreachable host — common on hosts that silently drop
  // outbound SMTP on some plans/ports rather than refusing the connection.
  // Fail fast with a clear, classified error instead (see classifyEmailError).
  connectionTimeout: 10_000,
  greetingTimeout: 10_000,
  socketTimeout: 15_000,
};

/**
 * Builds a nodemailer transporter from the currently-saved Business
 * Settings — or, when the GMAIL provider is selected and
 * EMAIL_GMAIL_APP_PASSWORD is set, straight from the environment instead.
 * That env path is the "secure environment configuration" mechanism: the
 * App Password is never typed into the Admin UI, never persisted to the
 * database, and never leaves the server process — it only ever comes from
 * whatever secret-store mechanism the hosting platform provides (Render's
 * environment variables, a local gitignored .env, etc.), and this function
 * never returns it to any caller. Throws with a clear message if nothing is
 * configured yet — callers decide whether that's fatal (Test Email) or just
 * a skip (a queued send).
 */
export async function resolveEmailTransport(): Promise<ResolvedEmailTransport> {
  const settings = await getBusinessSettings();

  const envGmailPassword = process.env.EMAIL_GMAIL_APP_PASSWORD;
  if (settings.emailProvider === "GMAIL" && envGmailPassword) {
    const address = process.env.EMAIL_GMAIL_ADDRESS || settings.emailSenderAddress;
    if (!address) {
      throw new Error("Set EMAIL_GMAIL_ADDRESS, or a Sender / Login Email in Business Settings, alongside EMAIL_GMAIL_APP_PASSWORD.");
    }
    return {
      transporter: nodemailer.createTransport({
        host: "smtp.gmail.com",
        port: 465,
        secure: true,
        auth: { user: address, pass: envGmailPassword },
        ...SMTP_TIMEOUTS,
      }),
      fromAddress: address,
      fromName: settings.emailSenderName || settings.businessName,
    };
  }

  if (!settings.emailProvider || !settings.emailSenderAddress || !settings.emailSmtpPasswordEnc) {
    throw new Error("Email is not configured yet. Set a provider and credentials in Business Settings, or set EMAIL_GMAIL_APP_PASSWORD.");
  }
  const password = decryptSecret(settings.emailSmtpPasswordEnc);

  const conn =
    settings.emailProvider === "CUSTOM_SMTP"
      ? {
          host: settings.emailSmtpHost ?? "",
          port: settings.emailSmtpPort ?? 587,
          secure: settings.emailSmtpSecure,
        }
      : providerHost(settings.emailProvider);

  if (settings.emailProvider === "CUSTOM_SMTP" && !conn.host) {
    throw new Error("Custom SMTP host is not set.");
  }

  const transporter = nodemailer.createTransport({
    host: conn.host,
    port: conn.port,
    secure: conn.secure,
    auth: { user: settings.emailSmtpUsername || settings.emailSenderAddress, pass: password },
    ...SMTP_TIMEOUTS,
  });

  return {
    transporter,
    fromAddress: settings.emailSenderAddress,
    fromName: settings.emailSenderName || settings.businessName,
  };
}

/**
 * Turns a raw nodemailer/Node network error into a specific, actionable
 * message — never the generic "something went wrong," and never anything
 * that could contain the password (nodemailer's connection/auth errors
 * never include the credential value itself, only the fact that auth
 * failed). Distinguishing "can't reach the server" from "wrong
 * credentials" is the whole point: a stuck timeout and a rejected login
 * need completely different fixes, and this is what actually lets Admin
 * (or whoever's debugging the deploy) tell them apart instead of guessing.
 */
export function classifyEmailError(e: unknown): string {
  const err = e as { code?: string; responseCode?: number; command?: string; message?: string } | undefined;
  switch (err?.code) {
    case "ETIMEDOUT":
    case "ESOCKET":
    case "ECONNECTION":
      return `Could not reach the mail server (${err.code}). Double-check the host and port, and confirm your hosting provider allows outbound SMTP traffic on that port — some platforms block it.`;
    case "ECONNREFUSED":
      return "The mail server refused the connection. Double-check the host and port.";
    case "EDNS":
      return "Could not resolve the mail server's hostname. Double-check the SMTP host.";
    case "EAUTH":
      return "Authentication failed. Double-check the email address and App Password.";
    case "EENVELOPE":
      return "The mail server rejected the sender or recipient address.";
    default:
      return err?.message ?? "Unknown error.";
  }
}

export type TestEmailResult = { ok: boolean; error?: string };

/**
 * "Test Email Connection" — verifies SMTP host/port/TLS/authentication
 * only (nodemailer's SMTP handshake + AUTH command), never sends a
 * message. Kept as a distinct action from sendTestEmail below per spec:
 * connection testing and actually sending a message are different
 * operations, and neither should ever be confused with — or trigger — a
 * real business notification (Quotation/Payment/SOA/Order/Production).
 */
export async function testEmailConnection(): Promise<TestEmailResult> {
  try {
    const { transporter } = await resolveEmailTransport();
    await transporter.verify();
    await prisma.businessSettings.update({
      where: { id: "default" },
      data: { emailLastTestAt: new Date(), emailLastTestOk: true },
    });
    return { ok: true };
  } catch (e) {
    await prisma.businessSettings
      .update({ where: { id: "default" }, data: { emailLastTestAt: new Date(), emailLastTestOk: false } })
      .catch(() => {});
    return { ok: false, error: classifyEmailError(e) };
  }
}

/** "Send Test Email" — actually delivers one message to the given recipient, for confirming end-to-end delivery once the connection itself tests OK. */
export async function sendTestEmail(toAddress: string): Promise<TestEmailResult> {
  try {
    const { transporter, fromAddress, fromName } = await resolveEmailTransport();
    await transporter.sendMail({
      from: `"${fromName}" <${fromAddress}>`,
      to: toAddress,
      subject: "Test Email Connection",
      text: "This is a test email from your business management system's Email Settings. If you received this, your email connection is working.",
    });
    await prisma.businessSettings.update({
      where: { id: "default" },
      data: { emailLastTestAt: new Date(), emailLastTestOk: true },
    });
    return { ok: true };
  } catch (e) {
    await prisma.businessSettings
      .update({ where: { id: "default" }, data: { emailLastTestAt: new Date(), emailLastTestOk: false } })
      .catch(() => {});
    return { ok: false, error: classifyEmailError(e) };
  }
}

async function getTemplate(key: EmailEventKey): Promise<{ subject: string; bodyHtml: string }> {
  const row = await prisma.emailTemplate.findUnique({ where: { key } });
  if (row) return { subject: row.subject, bodyHtml: row.bodyHtml };
  return { subject: defaultSubjectFor(key), bodyHtml: defaultBodyFor(key) };
}

async function attemptSend(logId: string, toAddress: string, subject: string, bodyHtml: string) {
  await prisma.emailLog.update({ where: { id: logId }, data: { status: "SENDING" } });
  try {
    const { transporter, fromAddress, fromName } = await resolveEmailTransport();
    await transporter.sendMail({
      from: `"${fromName}" <${fromAddress}>`,
      to: toAddress,
      subject,
      html: bodyHtml.replace(/\n/g, "<br/>"),
      text: bodyHtml,
    });
    await prisma.emailLog.update({
      where: { id: logId },
      data: { status: "SENT", sentAt: new Date(), attemptCount: { increment: 1 } },
    });
  } catch (e) {
    await prisma.emailLog.update({
      where: { id: logId },
      data: {
        status: "FAILED",
        failureReason: classifyEmailError(e),
        attemptCount: { increment: 1 },
      },
    });
  }
}

/**
 * The single funnel every module sends email through — called centrally
 * from lib/notifications.ts (so every existing notifyUser/notifyCustomer/
 * notifyStaff call site becomes email-capable automatically) plus directly
 * from the new SOA actions. Never throws: a misconfigured or down email
 * provider must never break the business transaction that triggered it.
 */
export async function sendEmailEvent(
  eventType: string,
  recipientEmail: string | null | undefined,
  vars: EmailVariables,
  related?: { type: string; id: string }
): Promise<void> {
  if (NON_EMAIL_TYPES.has(eventType)) return;
  if (!(eventType in EMAIL_EVENTS)) return;
  const key = eventType as EmailEventKey;

  const settings = await getBusinessSettings();
  if (!settings.emailEnabled) return;

  const overrides = (settings.emailEventSettings ?? {}) as Record<string, boolean>;
  if (overrides[key] === false) return;

  // No email on file — per spec, don't attempt to send, and never fail the
  // underlying transaction. Once an email is added, the next event sends
  // normally; there is no separate "resend" needed for this case.
  if (!recipientEmail) return;

  const fullVars: EmailVariables = {
    business_name: settings.businessName,
    business_phone: settings.contactNumber ?? "",
    business_email: settings.email ?? "",
    ...vars,
  };

  const template = await getTemplate(key);
  const subject = renderTemplate(template.subject, fullVars);
  const bodyHtml = renderTemplate(template.bodyHtml, fullVars);

  const log = await prisma.emailLog.create({
    data: {
      recipientEmail,
      subject,
      bodyHtml,
      eventType: key,
      relatedType: related?.type,
      relatedId: related?.id,
      status: "QUEUED",
    },
  });

  // No real background worker in this stack (same constraint as the
  // response-reminder/auto-assignment sweeps) — attempt the send inline,
  // right after queuing, so the EmailLog row still gives an accurate
  // queued -> sending -> sent/failed trail even though there's no gap
  // between "queued" and "attempted" in practice.
  await attemptSend(log.id, recipientEmail, subject, bodyHtml);
}
