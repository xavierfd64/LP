"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Select, Label } from "@/components/ui/input";
import { PERMISSION_GROUPS, PERMISSION_PRESETS, Permission } from "@/lib/permissions";

export function StaffPermissionsForm({
  action,
  initialGranted,
}: {
  action: (formData: FormData) => void;
  initialGranted: Permission[];
}) {
  const [granted, setGranted] = useState<Set<Permission>>(new Set(initialGranted));

  function toggle(permission: Permission) {
    setGranted((prev) => {
      const next = new Set(prev);
      if (next.has(permission)) next.delete(permission);
      else next.add(permission);
      return next;
    });
  }

  function applyPreset(presetName: string) {
    const preset = PERMISSION_PRESETS[presetName];
    if (!preset) return;
    setGranted(new Set(preset));
  }

  return (
    <form action={action} className="space-y-6">
      <div className="flex flex-wrap items-end gap-3 rounded-md border border-slate-200 bg-slate-50 p-3">
        <div className="min-w-48">
          <Label htmlFor="preset">Apply a preset</Label>
          <Select id="preset" defaultValue="" onChange={(e) => applyPreset(e.target.value)}>
            <option value="">Choose a preset...</option>
            {Object.keys(PERMISSION_PRESETS).map((name) => (
              <option key={name} value={name}>
                {name}
              </option>
            ))}
          </Select>
        </div>
        <p className="text-xs text-slate-500">
          Presets are just a starting point — check/uncheck anything below before saving.
        </p>
      </div>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        {PERMISSION_GROUPS.map((group) => (
          <div key={group.category} className="rounded-md border border-slate-200 p-3">
            <p className="mb-2 text-sm font-semibold text-slate-900">{group.category}</p>
            <div className="space-y-1.5">
              {group.permissions.map((p) => (
                <label key={p.key} className="flex items-center gap-2 text-sm text-slate-700">
                  <input
                    type="checkbox"
                    name="permissions"
                    value={p.key}
                    checked={granted.has(p.key)}
                    onChange={() => toggle(p.key)}
                    className="h-4 w-4 rounded border-slate-300"
                  />
                  {p.label}
                </label>
              ))}
            </div>
          </div>
        ))}
      </div>

      <Button type="submit">Save Permissions</Button>
    </form>
  );
}
