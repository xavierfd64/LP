import { requireRole } from "@/lib/session";
import { getBusinessSettings } from "@/lib/business-settings";
import { prisma } from "@/lib/prisma";
import { THEMES } from "@/lib/themes";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ActivateThemeButton } from "./activate-theme-button";
import { ThemeCustomizationForm } from "./theme-customization-form";
import { ThemeZipUploadForm } from "./theme-zip-upload-form";
import { formatDateTime } from "@/lib/utils";

export default async function ThemesPage() {
  await requireRole(["ADMIN"]);
  const [settings, installedThemes] = await Promise.all([
    getBusinessSettings(),
    prisma.installedTheme.findMany({ orderBy: { installedAt: "desc" }, include: { installedBy: { select: { name: true } } } }),
  ]);

  return (
    <div className="max-w-3xl space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">Themes</h1>
        <p className="text-sm text-slate-500">
          Themes control presentation only — colors, layout chrome, and typography. Switching themes never changes any
          business data (customers, orders, payments, production, and everything else stay exactly the same).
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Installed Themes</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {Object.values(THEMES).map((theme) => (
            <div key={theme.slug} className="flex flex-wrap items-center justify-between gap-3 rounded-md border border-slate-100 p-3">
              <div>
                <div className="flex items-center gap-2">
                  <p className="font-semibold text-slate-900">{theme.name}</p>
                  <span className="text-xs text-slate-400">v{theme.version}</span>
                  {settings.activeTheme === theme.slug && <Badge tone="green">Active</Badge>}
                </div>
                <p className="text-xs text-slate-500">{theme.description}</p>
              </div>
              {settings.activeTheme !== theme.slug && <ActivateThemeButton slug={theme.slug} name={theme.name} />}
            </div>
          ))}

          {installedThemes.length > 0 && (
            <>
              <p className="pt-2 text-xs font-semibold uppercase tracking-wide text-slate-400">Uploaded Themes</p>
              {installedThemes.map((t) => (
                <div key={t.id} className="flex flex-wrap items-center justify-between gap-3 rounded-md border border-slate-100 p-3">
                  <div>
                    <div className="flex items-center gap-2">
                      <p className="font-semibold text-slate-900">{t.name}</p>
                      <span className="text-xs text-slate-400">v{t.version}</span>
                      <Badge tone="slate">Uploaded, not activatable yet</Badge>
                    </div>
                    <p className="text-xs text-slate-500">{t.description}</p>
                    <p className="text-xs text-slate-400">
                      Installed {formatDateTime(t.installedAt)}
                      {t.installedBy ? ` by ${t.installedBy.name}` : ""}
                    </p>
                  </div>
                </div>
              ))}
            </>
          )}
        </CardContent>
      </Card>

      <ThemeZipUploadForm />

      <Card>
        <CardHeader>
          <CardTitle>Customize Active Theme</CardTitle>
        </CardHeader>
        <CardContent>
          <ThemeCustomizationForm settings={settings} />
        </CardContent>
      </Card>
    </div>
  );
}
