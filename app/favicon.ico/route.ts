import { NextResponse } from "next/server";
import { getBusinessSettings } from "@/lib/business-settings";

/**
 * Some browsers, crawlers, and bookmark/RSS tools still request /favicon.ico
 * directly regardless of the page's <link rel="icon"> tag (a legacy
 * convention, not something we can turn off). There must be no actual
 * app/favicon.ico *file* here — that's the bug this route replaces: Next's
 * App Router always spliced a static file at that path in as the first
 * <link rel="icon">, silently overriding whatever generateMetadata()
 * (app/layout.tsx) resolved from Business Settings. A route.ts instead just
 * redirects to that exact same resolved URL, so /favicon.ico stays a valid,
 * always-correct legacy entry point without ever becoming a second,
 * competing favicon declaration.
 */
export async function GET(request: Request) {
  const settings = await getBusinessSettings();
  const url = settings.faviconPath ?? settings.logoPath ?? "/branding/favicon-default.ico";
  return NextResponse.redirect(new URL(url, request.url), { status: 307 });
}
