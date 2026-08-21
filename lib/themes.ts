/**
 * Theme registry (Aug 19 1st update, Part C; ProLine added Aug 21).
 * Deliberately NOT one entire app per theme (spec item 47/56's explicit
 * architectural rule) — "2026", "nextgen", and "proline" are all the same
 * compiled Core, differing only in design tokens (colors/fonts, applied
 * globally via CSS variables — see app/globals.css + the root layout's
 * server-rendered override <style>) and a small number of shared chrome
 * components that read the active theme to vary a prop or a few CSS
 * variables (KpiCard's icon treatment, DesktopSidebar's colors via
 * `sidebarTokens` below). Every page's data, routes, and business logic
 * are identical across all three themes — only presentation differs.
 *
 * A real ZIP-uploaded third-party theme (Part D) gets a row in the
 * InstalledTheme table once validated, but activating an *uploaded*
 * theme is out of scope for what this registry can render today — see
 * app/actions/theme-zip.ts's doc comment for why, and PROGRESS.md for the
 * honest accounting of what's real vs. architecture-only in this update.
 */
export type ThemeManifest = {
  slug: string;
  name: string;
  version: string;
  author: string;
  description: string;
  /** Default token values this theme ships with — what "Reset to Theme Defaults" restores. */
  defaultTokens: {
    primary: string;
    secondary: string;
    accent: string;
    success: string;
    warning: string;
    error: string;
    info: string;
    fontFamily: FontFamilyKey;
  };
  /**
   * Sidebar chrome tokens — optional. Only ProLine sets these (dark navy
   * sidebar); 2026/nextgen omit them entirely and buildThemeOverrideCss()
   * falls back to app/globals.css's :root defaults, which reproduce their
   * existing hardcoded white sidebar exactly. Not part of the admin
   * Customization panel (spec: colors + typography only) — chrome, not a
   * per-theme "brand color." Presence of this field also switches the
   * active-nav-item state from a light bg-brand-50 pill (2026/nextgen) to
   * a solid brand-600 pill with white text (ProLine) — see
   * buildThemeOverrideCss().
   */
  sidebarTokens?: {
    background: string;
    border: string;
    heading: string;
    text: string;
    textMuted: string;
    hoverBg: string;
  };
};

export const FONT_FAMILIES = {
  montserrat: { label: "Montserrat", cssVar: "--font-montserrat" },
  inter: { label: "Inter", cssVar: "--font-inter" },
  roboto: { label: "Roboto", cssVar: "--font-roboto" },
  opensans: { label: "Open Sans", cssVar: "--font-opensans" },
  system: { label: "System Default", cssVar: null },
} as const;

export type FontFamilyKey = keyof typeof FONT_FAMILIES;

export const THEMES: Record<string, ThemeManifest> = {
  "2026": {
    slug: "2026",
    name: "2026",
    version: "1.0.0",
    author: "Let's Print",
    description: "The current, established Red + White + Montserrat interface.",
    defaultTokens: {
      primary: "#dc2626",
      secondary: "#475569",
      accent: "#7c3aed",
      success: "#16a34a",
      warning: "#f59e0b",
      error: "#dc2626",
      info: "#2563eb",
      fontFamily: "montserrat",
    },
  },
  nextgen: {
    slug: "nextgen",
    name: "Nextgen",
    version: "1.0.0",
    author: "Let's Print",
    description: "Next-generation interface — colorful KPI tiles, rounded search, donut charts. Same data, same routes, same permissions as 2026.",
    defaultTokens: {
      primary: "#dc2626",
      secondary: "#475569",
      accent: "#7c3aed",
      success: "#16a34a",
      warning: "#f59e0b",
      error: "#dc2626",
      info: "#2563eb",
      fontFamily: "montserrat",
    },
  },
  proline: {
    slug: "proline",
    name: "ProLine",
    version: "1.0.0",
    author: "Let's Print",
    description: "Clean, professional business theme — deep navy sidebar, blue primary actions, restrained semantic colors. Same data, same routes, same permissions as 2026.",
    defaultTokens: {
      primary: "#2563eb",
      secondary: "#475569",
      accent: "#0d9488",
      success: "#059669",
      warning: "#f59e0b",
      error: "#dc2626",
      info: "#2563eb",
      fontFamily: "inter",
    },
    sidebarTokens: {
      background: "#0f172a",
      border: "#1e293b",
      heading: "#ffffff",
      text: "#cbd5e1",
      textMuted: "#64748b",
      hoverBg: "#1e293b",
    },
  },
};

export function getTheme(slug: string): ThemeManifest {
  return THEMES[slug] ?? THEMES["2026"];
}

export type TokenOverrides = Partial<Record<"primary" | "secondary" | "accent" | "success" | "warning" | "error" | "info", string>>;

const HEX_RE = /^#[0-9a-fA-F]{6}$/;

/** Rejects anything that isn't a plain #rrggbb hex — this value gets interpolated directly into a server-rendered <style> tag, so it must never be allowed to carry arbitrary CSS/HTML. */
export function isSafeHexColor(value: string): boolean {
  return HEX_RE.test(value);
}

/** Builds the :root override CSS a theme + admin overrides produce — same shape whether the value came from the theme's own defaults or was replaced by a color picker. */
export function buildThemeOverrideCss(theme: ThemeManifest, overrides: TokenOverrides, fontFamily: FontFamilyKey): string {
  const tokens = { ...theme.defaultTokens, ...overrides, fontFamily };
  const safe = (v: string, fallback: string) => (isSafeHexColor(v) ? v : fallback);

  const lines = [
    `--color-brand-600: ${safe(tokens.primary, theme.defaultTokens.primary)};`,
    `--color-secondary-600: ${safe(tokens.secondary, theme.defaultTokens.secondary)};`,
    `--color-accent-600: ${safe(tokens.accent, theme.defaultTokens.accent)};`,
    `--color-success-600: ${safe(tokens.success, theme.defaultTokens.success)};`,
    `--color-warning-600: ${safe(tokens.warning, theme.defaultTokens.warning)};`,
    `--color-error-600: ${safe(tokens.error, theme.defaultTokens.error)};`,
    `--color-info-600: ${safe(tokens.info, theme.defaultTokens.info)};`,
  ];

  const font = FONT_FAMILIES[fontFamily];
  if (font.cssVar) {
    lines.push(`--font-active: var(${font.cssVar});`);
  } else {
    lines.push(`--font-active: system-ui, -apple-system, "Segoe UI", Arial, sans-serif;`);
  }

  // The brand-700/800 shades used throughout the app (hover states,
  // headings) stay derived from the same base via color-mix so a Primary
  // color change doesn't leave darker/lighter usages visually mismatched.
  lines.push(`--color-brand-700: color-mix(in srgb, var(--color-brand-600) 85%, black);`);
  lines.push(`--color-brand-800: color-mix(in srgb, var(--color-brand-600) 70%, black);`);
  lines.push(`--color-brand-50: color-mix(in srgb, var(--color-brand-600) 6%, white);`);
  lines.push(`--color-brand-100: color-mix(in srgb, var(--color-brand-600) 12%, white);`);

  // Sidebar chrome — only themes with sidebarTokens (ProLine) override
  // these; 2026/nextgen leave them unset here and fall back to
  // app/globals.css's :root defaults (their existing white sidebar look).
  if (theme.sidebarTokens) {
    const s = theme.sidebarTokens;
    lines.push(`--color-sidebar-bg: ${s.background};`);
    lines.push(`--color-sidebar-border: ${s.border};`);
    lines.push(`--color-sidebar-heading: ${s.heading};`);
    lines.push(`--color-sidebar-text: ${s.text};`);
    lines.push(`--color-sidebar-text-muted: ${s.textMuted};`);
    lines.push(`--color-sidebar-hover-bg: ${s.hoverBg};`);
    // Dark sidebar -> a solid brand-600 active pill with white text reads
    // far better than the light bg-brand-50 pill 2026/nextgen use.
    lines.push(`--color-sidebar-active-bg: var(--color-brand-600);`);
    lines.push(`--color-sidebar-active-text: #ffffff;`);
    lines.push(`--color-sidebar-active-border: var(--color-brand-600);`);
  }

  return `:root {\n  ${lines.join("\n  ")}\n}`;
}
