/**
 * Curated IANA timezone list for the Business Settings selector — not
 * exhaustive (Intl.supportedValuesOf('timeZone') would give hundreds), but
 * covers the Philippines (this app's primary market, given its PHP
 * currency and Filipino sample data) plus enough other major zones for a
 * business with customers/vendors elsewhere. The stored value is always
 * validated against Intl's real timezone database server-side (see
 * app/actions/business-settings.ts), not against this list — so an
 * existing value not in this curated set still displays/saves correctly.
 */
export const BUSINESS_TIMEZONES: { value: string; label: string }[] = [
  { value: "Asia/Manila", label: "Asia/Manila (Philippines, UTC+8)" },
  { value: "Asia/Singapore", label: "Asia/Singapore (UTC+8)" },
  { value: "Asia/Hong_Kong", label: "Asia/Hong Kong (UTC+8)" },
  { value: "Asia/Shanghai", label: "Asia/Shanghai (China, UTC+8)" },
  { value: "Asia/Tokyo", label: "Asia/Tokyo (Japan, UTC+9)" },
  { value: "Asia/Seoul", label: "Asia/Seoul (South Korea, UTC+9)" },
  { value: "Asia/Bangkok", label: "Asia/Bangkok (Thailand, UTC+7)" },
  { value: "Asia/Jakarta", label: "Asia/Jakarta (Indonesia, UTC+7)" },
  { value: "Asia/Kolkata", label: "Asia/Kolkata (India, UTC+5:30)" },
  { value: "Asia/Dubai", label: "Asia/Dubai (UAE, UTC+4)" },
  { value: "Australia/Sydney", label: "Australia/Sydney (UTC+10/+11)" },
  { value: "Europe/London", label: "Europe/London (UTC+0/+1)" },
  { value: "Europe/Paris", label: "Europe/Paris (UTC+1/+2)" },
  { value: "America/New_York", label: "America/New York (UTC-5/-4)" },
  { value: "America/Chicago", label: "America/Chicago (UTC-6/-5)" },
  { value: "America/Los_Angeles", label: "America/Los Angeles (UTC-8/-7)" },
  { value: "UTC", label: "UTC" },
];
