"use client";

import { useState } from "react";
import { recordQCResultAction } from "@/app/actions/qc";
import { Button } from "@/components/ui/button";
import { Input, Label, Textarea, Select } from "@/components/ui/input";

type Stage = { name: string; order: number };

export function QCForm({
  jobOrderId,
  quantity,
  stages,
  defaultAssignedStage,
}: {
  jobOrderId: string;
  quantity: number;
  stages: Stage[];
  defaultAssignedStage?: string;
}) {
  const [result, setResult] = useState<"PASS" | "FAIL">("PASS");
  const action = recordQCResultAction.bind(null, jobOrderId);

  return (
    <form action={action} className="space-y-4">
      <div className="flex gap-4">
        <label className="flex items-center gap-2 text-sm">
          <input type="radio" name="result" value="PASS" checked={result === "PASS"} onChange={() => setResult("PASS")} />
          Pass
        </label>
        <label className="flex items-center gap-2 text-sm">
          <input type="radio" name="result" value="FAIL" checked={result === "FAIL"} onChange={() => setResult("FAIL")} />
          Fail
        </label>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div>
          <Label htmlFor="quantityChecked">Quantity checked</Label>
          <Input id="quantityChecked" name="quantityChecked" type="number" min={1} max={quantity} defaultValue={quantity} required />
        </div>
        {result === "FAIL" && (
          <div>
            <Label htmlFor="quantityFailed">Quantity failed</Label>
            <Input id="quantityFailed" name="quantityFailed" type="number" min={1} max={quantity} required />
          </div>
        )}
      </div>

      {result === "FAIL" && (
        <div>
          <Label htmlFor="assignedStage">Route rework to stage</Label>
          <Select id="assignedStage" name="assignedStage" defaultValue={defaultAssignedStage}>
            {stages.map((s) => (
              <option key={s.name} value={s.name}>
                {s.name}
              </option>
            ))}
          </Select>
        </div>
      )}

      <div>
        <Label htmlFor="defectNotes">{result === "FAIL" ? "Defect notes" : "Notes (optional)"}</Label>
        <Textarea id="defectNotes" name="defectNotes" rows={2} required={result === "FAIL"} />
      </div>

      <Button type="submit" variant={result === "FAIL" ? "destructive" : "default"}>
        Record QC Result
      </Button>
    </form>
  );
}
