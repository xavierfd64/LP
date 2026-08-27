"use client";

import { useState } from "react";
import { recordQCResultAction, recordQCResultFromBoardAction } from "@/app/actions/qc";
import { Button } from "@/components/ui/button";
import { Input, Label, Textarea, Select } from "@/components/ui/input";
import { Alert } from "@/components/ui/alert";

type Stage = { name: string; order: number };

export function QCForm({
  jobOrderId,
  quantity,
  stages,
  defaultAssignedStage,
  onComplete,
}: {
  jobOrderId: string;
  quantity: number;
  stages: Stage[];
  defaultAssignedStage?: string;
  /** Rendered inside the QC popup/modal (1st Update item 2) instead of the job order page — completion calls onComplete instead of navigating. */
  onComplete?: (result: { ok: true } | { ok: false; error: string }) => void;
}) {
  const [result, setResult] = useState<"PASS" | "FAIL">("PASS");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | undefined>();
  const action = recordQCResultAction.bind(null, jobOrderId);

  async function handleEmbeddedSubmit(formData: FormData) {
    setSubmitting(true);
    const outcome = await recordQCResultFromBoardAction(jobOrderId, {
      result: formData.get("result") === "FAIL" ? "FAIL" : "PASS",
      quantityChecked: Number(formData.get("quantityChecked") ?? 0),
      quantityFailed: Number(formData.get("quantityFailed") ?? 0),
      defectNotes: (formData.get("defectNotes") as string) || undefined,
      assignedStage: (formData.get("assignedStage") as string) || undefined,
    });
    setSubmitting(false);
    setError(outcome.ok ? undefined : outcome.error);
    onComplete?.(outcome);
  }

  return (
    <form action={onComplete ? handleEmbeddedSubmit : action} className="space-y-4">
      {error && <Alert tone="error">{error}</Alert>}
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

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
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

      <Button type="submit" variant={result === "FAIL" ? "destructive" : "default"} disabled={submitting}>
        {submitting ? "Recording..." : "Record QC Result"}
      </Button>
    </form>
  );
}
