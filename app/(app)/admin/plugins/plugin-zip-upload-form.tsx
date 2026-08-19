"use client";

import { useActionState } from "react";
import { uploadPluginZipAction } from "@/app/actions/plugin";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Alert } from "@/components/ui/alert";

export function PluginZipUploadForm() {
  const [error, formAction, pending] = useActionState(uploadPluginZipAction, undefined);

  return (
    <Card>
      <CardHeader>
        <CardTitle>Install a Plugin from ZIP</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <p className="text-sm text-slate-500">
          The ZIP must contain a <code className="rounded bg-slate-100 px-1 py-0.5 text-xs">manifest.json</code> at its
          root with <code className="rounded bg-slate-100 px-1 py-0.5 text-xs">name</code>,{" "}
          <code className="rounded bg-slate-100 px-1 py-0.5 text-xs">slug</code>, and{" "}
          <code className="rounded bg-slate-100 px-1 py-0.5 text-xs">version</code>. A newly-installed plugin starts
          Inactive — activating it here is a real, persisted state, but no plugin code runs against your data in this
          release; this is architecture, not a live extension point yet.
        </p>
        {error && <Alert tone="error">{error}</Alert>}
        <form action={formAction} className="flex flex-wrap items-center gap-2">
          <Input name="pluginZip" type="file" accept=".zip,application/zip" required className="max-w-xs" />
          <Button type="submit" disabled={pending}>
            {pending ? "Uploading..." : "Upload Plugin ZIP"}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
