import { requireRole } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { formatDateTime } from "@/lib/utils";
import { PluginZipUploadForm } from "./plugin-zip-upload-form";
import { PluginToggleButton } from "./plugin-toggle-button";

export default async function PluginsPage() {
  await requireRole(["ADMIN"]);
  const plugins = await prisma.installedPlugin.findMany({
    orderBy: { installedAt: "desc" },
    include: { installedBy: { select: { name: true } } },
  });

  return (
    <div className="max-w-3xl space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">Plugins</h1>
        <p className="text-sm text-slate-500">
          Plugins extend functionality without changing the Core system — future payment gateways (GCash, Maya,
          PayMongo, and others) are meant to live here rather than being hardcoded in. Admin-only.
        </p>
      </div>

      <PluginZipUploadForm />

      <Card>
        <CardHeader>
          <CardTitle>Installed Plugins</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {plugins.length === 0 && <p className="text-sm text-slate-400">No plugins installed yet.</p>}
          {plugins.map((p) => (
            <div key={p.id} className="flex flex-wrap items-center justify-between gap-3 rounded-md border border-slate-100 p-3">
              <div>
                <div className="flex items-center gap-2">
                  <p className="font-semibold text-slate-900">{p.name}</p>
                  <span className="text-xs text-slate-400">v{p.version}</span>
                  <Badge tone={p.active ? "green" : "slate"}>{p.active ? "Active" : "Inactive"}</Badge>
                </div>
                <p className="text-xs text-slate-500">{p.description}</p>
                <p className="text-xs text-slate-400">
                  Installed {formatDateTime(p.installedAt)}
                  {p.installedBy ? ` by ${p.installedBy.name}` : ""}
                </p>
              </div>
              <PluginToggleButton id={p.id} active={p.active} />
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}
