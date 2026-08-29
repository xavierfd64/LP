"use client";

import { useActionState, useState } from "react";
import { updateBusinessSettingsAction } from "@/app/actions/business-settings";
import { Button } from "@/components/ui/button";
import { Input, Label, Textarea, Select } from "@/components/ui/input";
import { Alert } from "@/components/ui/alert";
import { BrandLogo } from "@/components/branding/brand-logo";
import { BUSINESS_TIMEZONES } from "@/lib/business-timezones";
import type { BusinessSettings } from "@/lib/business-settings";

type ImageSource = "upload" | "url" | "default";

/** An uploaded file's path always starts with /uploads/ (see lib/upload.ts) — anything else configured must have come from a pasted URL. */
function inferSource(path: string | null): ImageSource {
  if (!path) return "default";
  return path.startsWith("/uploads/") ? "upload" : "url";
}

export function BusinessSettingsForm({ settings }: { settings: BusinessSettings }) {
  const [error, formAction, pending] = useActionState(updateBusinessSettingsAction, undefined);
  const [logoSource, setLogoSource] = useState<ImageSource>(inferSource(settings.logoPath));
  const [faviconSource, setFaviconSource] = useState<ImageSource>(inferSource(settings.faviconPath));

  return (
    <form action={formAction} className="space-y-8">
      {error && <Alert tone="error">{error}</Alert>}

      <section className="space-y-4">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-brand-700">Business Identity</h2>
        <div>
          <Label htmlFor="businessName">Business name</Label>
          <Input id="businessName" name="businessName" defaultValue={settings.businessName} required />
        </div>
        <div>
          <Label htmlFor="tagline">Tagline</Label>
          <Input id="tagline" name="tagline" defaultValue={settings.tagline ?? ""} placeholder="e.g. Business Management System" />
        </div>
        <div>
          <Label htmlFor="description">Description</Label>
          <Textarea id="description" name="description" rows={3} defaultValue={settings.description ?? ""} />
        </div>

        <div className="grid grid-cols-1 gap-6 sm:grid-cols-2">
          <BrandingImageField
            label="Business logo"
            hint="Used on Login, Sign Up, the Customer Portal, Admin/Staff header, Tracking, and printed documents."
            previewSize={64}
            currentPath={settings.logoPath}
            businessName={settings.businessName}
            source={logoSource}
            onSourceChange={setLogoSource}
            fileFieldName="logo"
            sourceFieldName="logoSource"
            urlFieldName="logoUrl"
            idPrefix="logo"
          />
          <BrandingImageField
            label="Favicon"
            hint="Shown in the browser tab across the whole app. Falls back to the logo, then the system default, if not set."
            previewSize={32}
            currentPath={settings.faviconPath}
            businessName={settings.businessName}
            source={faviconSource}
            onSourceChange={setFaviconSource}
            fileFieldName="favicon"
            sourceFieldName="faviconSource"
            urlFieldName="faviconUrl"
            idPrefix="favicon"
          />
        </div>
      </section>

      <section className="space-y-4">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-brand-700">Contact Information</h2>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div>
            <Label htmlFor="contactNumber">Contact number</Label>
            <Input id="contactNumber" name="contactNumber" defaultValue={settings.contactNumber ?? ""} />
          </div>
          <div>
            <Label htmlFor="email">Email address</Label>
            <Input id="email" name="email" type="email" defaultValue={settings.email ?? ""} />
          </div>
          <div>
            <Label htmlFor="facebookUrl">Facebook / social media</Label>
            <Input id="facebookUrl" name="facebookUrl" defaultValue={settings.facebookUrl ?? ""} placeholder="https://facebook.com/..." />
          </div>
          <div>
            <Label htmlFor="website">Website</Label>
            <Input id="website" name="website" defaultValue={settings.website ?? ""} placeholder="https://..." />
          </div>
        </div>
      </section>

      <section className="space-y-4">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-brand-700">Business Address</h2>
        <div>
          <Label htmlFor="addressLine">Complete address</Label>
          <Input id="addressLine" name="addressLine" defaultValue={settings.addressLine ?? ""} />
        </div>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <div>
            <Label htmlFor="city">City / Municipality</Label>
            <Input id="city" name="city" defaultValue={settings.city ?? ""} />
          </div>
          <div>
            <Label htmlFor="province">Province</Label>
            <Input id="province" name="province" defaultValue={settings.province ?? ""} />
          </div>
          <div>
            <Label htmlFor="postalCode">Postal / ZIP code</Label>
            <Input id="postalCode" name="postalCode" defaultValue={settings.postalCode ?? ""} />
          </div>
        </div>
      </section>

      <section className="space-y-4">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-brand-700">Payment Instructions</h2>
        <div>
          <Label htmlFor="paymentInstructions">Shown on Invoice and Statement of Account documents</Label>
          <Textarea
            id="paymentInstructions"
            name="paymentInstructions"
            rows={3}
            defaultValue={settings.paymentInstructions ?? ""}
            placeholder="e.g. GCash: 0917-000-0000 (Juan Dela Cruz) · BDO: 0012-3456-7890"
          />
        </div>
      </section>

      <section className="space-y-4">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-brand-700">Regional</h2>
        <div>
          <Label htmlFor="timezone">Business Time Zone</Label>
          <Select id="timezone" name="timezone" defaultValue={settings.timezone} className="max-w-sm">
            {!BUSINESS_TIMEZONES.some((tz) => tz.value === settings.timezone) && (
              <option value={settings.timezone}>{settings.timezone}</option>
            )}
            {BUSINESS_TIMEZONES.map((tz) => (
              <option key={tz.value} value={tz.value}>
                {tz.label}
              </option>
            ))}
          </Select>
          <p className="mt-1 text-xs text-slate-400">
            Every timestamp in the app — inquiries, quotations, orders, payments, production, dashboard dates, and
            reports — displays in this time zone. Takes effect the next time the server restarts (e.g. the next
            deploy), not instantly.
          </p>
        </div>
      </section>

      <section className="space-y-4">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-brand-700">Communication</h2>
        <div>
          <Label htmlFor="assignmentMode">Chatbox conversation assignment</Label>
          <Select id="assignmentMode" name="assignmentMode" defaultValue={settings.assignmentMode} className="max-w-sm">
            <option value="MANUAL">Manual — Staff pick up unassigned conversations themselves</option>
            <option value="AUTOMATIC">Automatic — system assigns an eligible Staff member immediately</option>
            <option value="MANUAL_WITH_AUTO_FALLBACK">Manual, with automatic fallback if unclaimed for 15 minutes</option>
          </Select>
          <p className="mt-1 text-xs text-slate-400">
            Controls how new customer conversations get their first responsible Staff member. Applies to the floating Chatbox.
          </p>
        </div>
      </section>

      <section className="space-y-4">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-brand-700">Production</h2>
        <label className="flex items-start gap-2.5">
          <input
            type="checkbox"
            name="autoAssignGraphicArtist"
            value="true"
            defaultChecked={settings.autoAssignGraphicArtist}
            className="mt-0.5 h-4 w-4 rounded border-slate-300"
          />
          <span>
            <span className="block text-sm font-medium text-slate-900">Auto-select Graphic Artist</span>
            <span className="block text-xs text-slate-400">
              When a job order reaches its Design stage, automatically assign it to an eligible Graphic Artist with no
              pending layout (or the lowest pending workload, if everyone has one) instead of leaving it open to accept
              or requiring manual assignment.
            </span>
          </span>
        </label>
      </section>

      <Button type="submit" disabled={pending}>
        {pending ? "Saving..." : "Save Business Settings"}
      </Button>
    </form>
  );
}

/**
 * One logo/favicon field: a live preview (via the same fallback-safe
 * BrandLogo used everywhere else the image renders) plus a Source radio
 * that swaps between Upload / Image URL / Default. Only the fields for the
 * *selected* source are submitted meaningfully — the server action reads
 * `${idPrefix}Source` first and only looks at the file/URL input matching
 * that choice (see updateBusinessSettingsAction), so switching tabs can't
 * accidentally resurrect a stale value from an input the admin isn't using.
 */
function BrandingImageField({
  label,
  hint,
  previewSize,
  currentPath,
  businessName,
  source,
  onSourceChange,
  fileFieldName,
  sourceFieldName,
  urlFieldName,
  idPrefix,
}: {
  label: string;
  hint: string;
  previewSize: number;
  currentPath: string | null;
  businessName: string;
  source: ImageSource;
  onSourceChange: (s: ImageSource) => void;
  fileFieldName: string;
  sourceFieldName: string;
  urlFieldName: string;
  idPrefix: string;
}) {
  return (
    <div className="space-y-3 rounded-md border border-slate-200 p-3">
      <div className="flex items-center gap-3">
        <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-md border border-slate-100 bg-slate-50">
          <BrandLogo src={currentPath} alt={businessName} size={previewSize} />
        </div>
        <div>
          <Label className="mb-0">{label}</Label>
          <p className="text-xs text-slate-400">{hint}</p>
        </div>
      </div>

      <input type="hidden" name={sourceFieldName} value={source} />

      <div className="flex flex-wrap gap-3 text-xs text-slate-600">
        {(["upload", "url", "default"] as const).map((opt) => (
          <label key={opt} className="flex items-center gap-1.5">
            <input
              type="radio"
              name={`${idPrefix}-source-radio`}
              checked={source === opt}
              onChange={() => onSourceChange(opt)}
            />
            {opt === "upload" ? "Upload Image" : opt === "url" ? "Image URL" : "Use Default"}
          </label>
        ))}
      </div>

      {source === "upload" && (
        <Input id={`${idPrefix}-file`} name={fileFieldName} type="file" accept="image/*" />
      )}
      {source === "url" && (
        <Input
          id={`${idPrefix}-url`}
          name={urlFieldName}
          type="url"
          placeholder="https://example.com/logo.png"
          defaultValue={currentPath && !currentPath.startsWith("/uploads/") ? currentPath : ""}
        />
      )}
      {source === "default" && (
        <p className="text-xs text-slate-400">Saving will reset {label.toLowerCase()} to the system default.</p>
      )}
    </div>
  );
}
