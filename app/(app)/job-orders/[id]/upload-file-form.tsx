"use client";

import { useState } from "react";
import { uploadJobOrderFileAction } from "@/app/actions/files";
import { Button } from "@/components/ui/button";
import { Label, Select } from "@/components/ui/input";

const ALL_CATEGORIES = [
  { value: "CUSTOMER_FILE", label: "Customer File" },
  { value: "DESIGN_DRAFT", label: "Design Draft" },
  { value: "APPROVED_DESIGN", label: "Approved Design" },
  { value: "PRODUCTION_FILE", label: "Production File" },
  { value: "QC_EVIDENCE", label: "QC Evidence" },
];

export function UploadFileForm({ jobOrderId, isCustomer }: { jobOrderId: string; isCustomer: boolean }) {
  const [open, setOpen] = useState(false);
  const action = uploadJobOrderFileAction.bind(null, jobOrderId);
  const categories = isCustomer ? ALL_CATEGORIES.filter((c) => c.value === "CUSTOMER_FILE") : ALL_CATEGORIES;

  if (!open) {
    return (
      <Button size="sm" variant="outline" onClick={() => setOpen(true)}>
        Upload File
      </Button>
    );
  }

  return (
    <form action={action} className="flex items-end gap-2 rounded-md border border-slate-200 p-3">
      <div>
        <Label htmlFor="category">Category</Label>
        <Select id="category" name="category" defaultValue={categories[0].value}>
          {categories.map((c) => (
            <option key={c.value} value={c.value}>
              {c.label}
            </option>
          ))}
        </Select>
      </div>
      <div>
        <Label htmlFor="file">File</Label>
        <input id="file" name="file" type="file" required className="text-sm" />
      </div>
      <Button type="submit" size="sm">
        Upload
      </Button>
      <Button type="button" variant="ghost" size="sm" onClick={() => setOpen(false)}>
        Cancel
      </Button>
    </form>
  );
}
