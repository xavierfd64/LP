import type { Metadata } from "next";
import { Montserrat, Geist_Mono, Inter, Roboto, Open_Sans } from "next/font/google";
import "./globals.css";
import { getBusinessSettings } from "@/lib/business-settings";
import { getTheme, buildThemeOverrideCss, type TokenOverrides, type FontFamilyKey } from "@/lib/themes";

const montserrat = Montserrat({
  variable: "--font-montserrat",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700", "800"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

// Registered so their CSS variable exists whenever Admin picks them as the
// active theme font (lib/themes.ts) — preload disabled for everything but
// the default so an inactive font's files aren't fetched eagerly.
const inter = Inter({ variable: "--font-inter", subsets: ["latin"], preload: false });
const roboto = Roboto({ variable: "--font-roboto", subsets: ["latin"], weight: ["400", "500", "700"], preload: false });
const openSans = Open_Sans({ variable: "--font-opensans", subsets: ["latin"], preload: false });

export async function generateMetadata(): Promise<Metadata> {
  const settings = await getBusinessSettings();
  return {
    title: `${settings.businessName} — Business Management`,
    description: settings.description ?? "Printing business management system",
    icons: settings.faviconPath
      ? [{ url: settings.faviconPath }]
      : settings.logoPath
        ? [{ url: settings.logoPath }]
        : undefined,
  };
}

export default async function RootLayout({ children }: LayoutProps<"/">) {
  const settings = await getBusinessSettings();
  const theme = getTheme(settings.activeTheme);
  const overrides = (settings.themeColorOverrides ?? {}) as TokenOverrides;
  const fontFamily = (settings.themeFontFamily as FontFamilyKey) ?? "montserrat";
  const overrideCss = buildThemeOverrideCss(theme, overrides, fontFamily);

  return (
    <html
      lang="en"
      data-theme={theme.slug}
      className={`${montserrat.variable} ${geistMono.variable} ${inter.variable} ${roboto.variable} ${openSans.variable} h-full antialiased`}
    >
      <head>
        {/* Live theme/color/font overrides (Aug 19 1st update) — a plain
            :root block, sourced only from validated hex colors and a
            fixed enum of font keys (see buildThemeOverrideCss), never
            free-form admin text. Rendered after globals.css so it wins
            the cascade for the same custom properties. */}
        <style dangerouslySetInnerHTML={{ __html: overrideCss }} />
      </head>
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
