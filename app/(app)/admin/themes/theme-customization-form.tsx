"use client";

import { useActionState } from "react";
import { updateThemeCustomizationAction, resetThemeCustomizationAction } from "@/app/actions/theme";
import { Button } from "@/components/ui/button";
import { Label, Select } from "@/components/ui/input";
import { Alert } from "@/components/ui/alert";
import { getTheme, FONT_FAMILIES, type TokenOverrides, type FontFamilyKey } from "@/lib/themes";
import type { BusinessSettings } from "@/lib/business-settings";

const COLOR_FIELDS: { key: keyof TokenOverrides; label: string }[] = [
  { key: "primary", label: "Primary" },
  { key: "secondary", label: "Secondary" },
  { key: "accent", label: "Accent" },
  { key: "success", label: "Success" },
  { key: "warning", label: "Warning" },
  { key: "error", label: "Error" },
  { key: "info", label: "Info" },
];

export function ThemeCustomizationForm({ settings }: { settings: BusinessSettings }) {
  const [error, formAction, pending] = useActionState(updateThemeCustomizationAction, undefined);
  const theme = getTheme(settings.activeTheme);
  const overrides = (settings.themeColorOverrides ?? {}) as TokenOverrides;
  const currentFont = (settings.themeFontFamily as FontFamilyKey) ?? theme.defaultTokens.fontFamily;

  return (
    <div className="space-y-4">
      <form action={formAction} className="space-y-4">
        {error && <Alert tone="error">{error}</Alert>}

        <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
          {COLOR_FIELDS.map((f) => (
            <div key={f.key}>
              <Label htmlFor={f.key}>{f.label}</Label>
              <input
                id={f.key}
                name={f.key}
                type="color"
                defaultValue={overrides[f.key] ?? theme.defaultTokens[f.key]}
                className="h-9 w-full cursor-pointer rounded-md border border-slate-300 bg-white p-1"
              />
            </div>
          ))}
        </div>

        <div className="max-w-xs">
          <Label htmlFor="fontFamily">Font Family</Label>
          <Select id="fontFamily" name="fontFamily" defaultValue={currentFont}>
            {Object.entries(FONT_FAMILIES).map(([key, f]) => (
              <option key={key} value={key}>
                {f.label}
              </option>
            ))}
          </Select>
        </div>

        <Button type="submit" disabled={pending}>
          {pending ? "Saving..." : "Save Theme Customization"}
        </Button>
      </form>

      <form action={resetThemeCustomizationAction}>
        <Button type="submit" variant="outline" size="sm">
          Reset to Theme Defaults
        </Button>
      </form>
    </div>
  );
}
