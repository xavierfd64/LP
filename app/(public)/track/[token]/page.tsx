import { getBusinessSettings } from "@/lib/business-settings";
import { getPublicOrderTrackingAction } from "@/app/actions/public-tracking";
import { TrackHeader } from "@/components/tracking/track-header";
import { TrackingView } from "./tracking-view";
import { LinkUnavailable } from "./link-unavailable";

export default async function OrderTrackingPage({ params }: PageProps<"/track/[token]">) {
  const { token } = await params;
  const [settings, result] = await Promise.all([getBusinessSettings(), getPublicOrderTrackingAction(token)]);
  const supportHref = settings.email ? `mailto:${settings.email}` : settings.contactNumber ? `tel:${settings.contactNumber}` : null;

  return (
    <div className="min-h-screen bg-slate-50">
      <TrackHeader businessName={settings.businessName} tagline={settings.tagline} logoPath={settings.logoPath} />
      <main className="mx-auto max-w-3xl px-4 py-8 sm:px-6 sm:py-12">
        {result.ok ? <TrackingView token={token} initial={result.data} supportHref={supportHref} /> : <LinkUnavailable />}
      </main>
      <footer className="pb-8 text-center text-xs text-slate-400">
        © {new Date().getFullYear()} {settings.businessName}. All rights reserved.
      </footer>
    </div>
  );
}
