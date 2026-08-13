// STUB: real SMS/email notifications would go here (e.g. via Twilio / SendGrid).
// For the prototype we just log — a real implementation would queue and send.
export function notify(to: string, message: string) {
  console.log(`[STUB NOTIFY] to ${to}: ${message}`);
}
