/**
 * Minimal, dependency-free User-Agent parsing for security-history
 * records (Sept 8 — User Profile/Progressive Lockout/Security History
 * improvement). Deliberately not a real device-fingerprinting library —
 * good enough to show "Windows / Chrome" in a history table, nothing
 * more precise is needed or attempted.
 *
 * IMPORTANT: a normal web browser does not reliably expose a device's
 * physical MAC address to a web application, and this module makes no
 * attempt to obtain, fake, or imply one. Everything below is derived
 * only from the standard `User-Agent` request header, which is the only
 * device signal legitimately available here.
 */
export type DeviceInfo = {
  deviceType: "mobile" | "tablet" | "desktop" | "unknown";
  os: string;
  browser: string;
  userAgent: string;
};

export function parseDeviceInfo(userAgent: string | null | undefined): DeviceInfo {
  const ua = (userAgent || "").slice(0, 500);

  const isTablet = /iPad|Tablet|(Android(?!.*Mobile))/i.test(ua);
  const isMobile = !isTablet && /Mobi|iPhone|Android/i.test(ua);
  const deviceType: DeviceInfo["deviceType"] = !ua ? "unknown" : isTablet ? "tablet" : isMobile ? "mobile" : "desktop";

  let os = "Unknown OS";
  if (/Windows/i.test(ua)) os = "Windows";
  else if (/iPhone|iPad|iPod/i.test(ua)) os = "iOS";
  else if (/Mac OS X/i.test(ua)) os = "macOS";
  else if (/Android/i.test(ua)) os = "Android";
  else if (/Linux/i.test(ua)) os = "Linux";

  let browser = "Unknown Browser";
  if (/Edg\//i.test(ua)) browser = "Edge";
  else if (/OPR\/|Opera/i.test(ua)) browser = "Opera";
  else if (/Chrome\//i.test(ua) && !/Chromium/i.test(ua)) browser = "Chrome";
  else if (/Firefox\//i.test(ua)) browser = "Firefox";
  else if (/CriOS/i.test(ua)) browser = "Chrome";
  else if (/Safari\//i.test(ua) && !/Chrome/i.test(ua)) browser = "Safari";

  return { deviceType, os, browser, userAgent: ua };
}

export function formatDeviceLabel(info: Pick<DeviceInfo, "os" | "browser">): string {
  return `${info.os} / ${info.browser}`;
}
