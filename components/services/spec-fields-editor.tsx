"use client";

import { useEffect, useState } from "react";
import { Input, Label } from "@/components/ui/input";

/**
 * Renders one optional text input per label in the selected Service's
 * `specFields` (Admin-configured, e.g. ["Width","Height","Material"]) and
 * serializes the answers into a single hidden JSON input — spec: "Do not
 * make all fields mandatory for every service." Nothing here is required;
 * an empty field is just omitted from the saved specs object.
 */
export function SpecFieldsEditor({
  name,
  fields,
  initialSpecs,
  onChange,
}: {
  /** Hidden input field name the JSON blob is submitted under. Ignored (no hidden input rendered) when `onChange` is passed — the caller then owns the submitted field, e.g. to keep a per-row array index-aligned. */
  name: string;
  fields: string[];
  initialSpecs?: Record<string, string> | null;
  onChange?: (values: Record<string, string>) => void;
}) {
  const [values, setValues] = useState<Record<string, string>>(initialSpecs ?? {});

  useEffect(() => {
    setValues(initialSpecs ?? {});
  }, [fields.join("|")]); // eslint-disable-line react-hooks/exhaustive-deps

  if (fields.length === 0) return null;

  function set(field: string, value: string) {
    setValues((prev) => {
      const next = { ...prev, [field]: value };
      onChange?.(next);
      return next;
    });
  }

  return (
    <div className="space-y-2 rounded-md border border-slate-200 p-3">
      <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">Service Details</p>
      {!onChange && <input type="hidden" name={name} value={JSON.stringify(values)} />}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        {fields.map((field) => (
          <div key={field}>
            <Label htmlFor={`spec-${field}`}>{field}</Label>
            <Input id={`spec-${field}`} value={values[field] ?? ""} onChange={(e) => set(field, e.target.value)} />
          </div>
        ))}
      </div>
    </div>
  );
}
