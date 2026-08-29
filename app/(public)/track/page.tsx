import { getBusinessSettings } from "@/lib/business-settings";
import { TrackHeader } from "@/components/tracking/track-header";
import { TrackPageClient } from "@/components/tracking/track-page-client";

// Same tracking-by-reference content as "/", but deliberately session-free:
// "/" redirects an authenticated visitor to their dashboard, which is
// correct for the root landing page but wrong for the Track Order button
// on /login — clicking it right after logging out could land back on "/"
// while a session cookie was still (or appeared to be) valid, looking like
// an automatic re-login. This page never reads `auth()` at all, so it
// can't redirect based on session state under any circumstance — it is
// always the plain public tracking form, logged in or not.
export const dynamic = "force-dynamic";

export default async function TrackPage() {
  const settings = await getBusinessSettings();
  // mailto: takes priority — a phone tel: link is less useful for a
  // support inquiry than email, but either is better than nothing.
  const supportHref = settings.email ? `mailto:${settings.email}` : settings.contactNumber ? `tel:${settings.contactNumber}` : null;

  return (
    <div className="min-h-screen bg-slate-50">
      <TrackHeader businessName={settings.businessName} tagline={settings.tagline} logoPath={settings.logoPath} />
      <TrackPageClient supportHref={supportHref} />
      <footer className="pb-8 text-center text-xs text-slate-400">
        © {new Date().getFullYear()} {settings.businessName}. All rights reserved.
      </footer>
    </div>
  );
}
