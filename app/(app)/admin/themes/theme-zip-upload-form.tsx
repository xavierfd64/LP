"use client";

import { useActionState } from "react";
import { uploadThemeZipAction } from "@/app/actions/theme-zip";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input, Label } from "@/components/ui/input";
import { Alert } from "@/components/ui/alert";

export function ThemeZipUploadForm() {
  const [error, formAction, pending] = useActionState(uploadThemeZipAction, undefined);

  return (
    <Card>
      <CardHeader>
        <CardTitle>Install a Theme from ZIP</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <p className="text-sm text-slate-500">
          The ZIP must contain a <code className="rounded bg-slate-100 px-1 py-0.5 text-xs">manifest.json</code> at its
          root with at least <code className="rounded bg-slate-100 px-1 py-0.5 text-xs">name</code>,{" "}
          <code className="rounded bg-slate-100 px-1 py-0.5 text-xs">slug</code>, and{" "}
          <code className="rounded bg-slate-100 px-1 py-0.5 text-xs">version</code>. Uploaded themes are validated and
          listed, but can&apos;t be activated yet — this app can&apos;t safely render arbitrary uploaded UI code without a
          real template-rendering layer, which is a future step. Uploaded files also won&apos;t survive a redeploy on this
          host, same as other file uploads in this system.
        </p>
        {error && <Alert tone="error">{error}</Alert>}
        <form action={formAction} className="flex flex-wrap items-center gap-2">
          <Input name="themeZip" type="file" accept=".zip,application/zip" required className="max-w-xs" />
          <Button type="submit" disabled={pending}>
            {pending ? "Uploading..." : "Upload Theme ZIP"}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
