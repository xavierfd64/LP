import { requireRole } from "@/lib/session";
import { getBusinessSettings } from "@/lib/business-settings";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { BusinessSettingsForm } from "./business-settings-form";

export default async function BusinessSettingsPage() {
  await requireRole(["ADMIN"]);
  const settings = await getBusinessSettings();

  return (
    <div className="max-w-3xl space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">Business Settings</h1>
        <p className="text-sm text-slate-500">
          Centralized business identity and contact information — used across the Login page, sidebar, and
          customer-facing screens instead of being hard-coded.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Branding &amp; contact details</CardTitle>
        </CardHeader>
        <CardContent>
          <BusinessSettingsForm settings={settings} />
        </CardContent>
      </Card>
    </div>
  );
}
