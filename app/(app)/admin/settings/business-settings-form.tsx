"use client";

import { useActionState } from "react";
import Image from "next/image";
import { updateBusinessSettingsAction } from "@/app/actions/business-settings";
import { Button } from "@/components/ui/button";
import { Input, Label, Textarea, Select } from "@/components/ui/input";
import { Alert } from "@/components/ui/alert";
import type { BusinessSettings } from "@/lib/business-settings";

export function BusinessSettingsForm({ settings }: { settings: BusinessSettings }) {
  const [error, formAction, pending] = useActionState(updateBusinessSettingsAction, undefined);

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

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div>
            <Label htmlFor="logo">Business logo</Label>
            {settings.logoPath && (
              <div className="mb-2 flex h-16 items-center rounded-md border border-slate-200 bg-slate-50 px-3">
                <Image src={settings.logoPath} alt="Current logo" width={120} height={48} className="max-h-12 w-auto object-contain" unoptimized />
              </div>
            )}
            <Input id="logo" name="logo" type="file" accept="image/*" />
            <p className="mt-1 text-xs text-slate-400">Used on the login page, sidebar, and portals. Any dimensions are fine — it's scaled to fit.</p>
          </div>
          <div>
            <Label htmlFor="favicon">Favicon</Label>
            {settings.faviconPath && (
              <div className="mb-2 flex h-16 items-center rounded-md border border-slate-200 bg-slate-50 px-3">
                <Image src={settings.faviconPath} alt="Current favicon" width={32} height={32} className="h-8 w-8 object-contain" unoptimized />
              </div>
            )}
            <Input id="favicon" name="favicon" type="file" accept="image/*" />
            <p className="mt-1 text-xs text-slate-400">Shown in the browser tab. Falls back to the logo if not set.</p>
          </div>
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

      <Button type="submit" disabled={pending}>
        {pending ? "Saving..." : "Save Business Settings"}
      </Button>
    </form>
  );
}
