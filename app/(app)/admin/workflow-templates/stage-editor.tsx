"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export type Stage = { name: string; isQCStage: boolean; isInstallStage: boolean; isDesignStage: boolean };

const EMPTY_STAGE: Stage = { name: "", isQCStage: false, isInstallStage: false, isDesignStage: false };

export function StageEditor({ initialStages }: { initialStages: Stage[] }) {
  const [stages, setStages] = useState<Stage[]>(initialStages.length > 0 ? initialStages : [{ ...EMPTY_STAGE }]);

  function update<K extends keyof Stage>(index: number, field: K, value: Stage[K]) {
    setStages((prev) => prev.map((s, i) => (i === index ? { ...s, [field]: value } : s)));
  }

  function setQC(index: number) {
    setStages((prev) => prev.map((s, i) => ({ ...s, isQCStage: i === index })));
  }

  // Design, like QC, is at most one stage per template — but optional
  // (a template with no design responsibility, e.g. straight to
  // production, is valid), so clicking the checked one again clears it
  // rather than always forcing exactly one on.
  function setDesign(index: number) {
    setStages((prev) => prev.map((s, i) => ({ ...s, isDesignStage: i === index ? !s.isDesignStage : false })));
  }

  return (
    <div className="space-y-2 rounded-md border border-slate-200 p-3">
      {stages.map((s, i) => (
        <div key={i} className="flex items-center gap-2">
          <span className="w-6 text-sm text-slate-400">{i + 1}.</span>
          <input type="hidden" name="stageName" value={s.name} />
          <input type="hidden" name="stageIsQC" value={String(s.isQCStage)} />
          <input type="hidden" name="stageIsInstall" value={String(s.isInstallStage)} />
          <input type="hidden" name="stageIsDesign" value={String(s.isDesignStage)} />
          <Input
            className="flex-1"
            placeholder="Stage name"
            value={s.name}
            onChange={(e) => update(i, "name", e.target.value)}
          />
          <label className="flex items-center gap-1 text-xs text-slate-600 whitespace-nowrap">
            <input type="checkbox" checked={s.isQCStage} onChange={() => setQC(i)} />
            QC stage
          </label>
          <label className="flex items-center gap-1 text-xs text-slate-600 whitespace-nowrap">
            <input
              type="checkbox"
              checked={s.isInstallStage}
              onChange={(e) => update(i, "isInstallStage", e.target.checked)}
            />
            Install stage
          </label>
          <label className="flex items-center gap-1 text-xs text-slate-600 whitespace-nowrap">
            <input type="checkbox" checked={s.isDesignStage} onChange={() => setDesign(i)} />
            Design stage
          </label>
          <button
            type="button"
            className="text-xs text-red-600 hover:underline"
            disabled={stages.length === 1}
            onClick={() => setStages((prev) => prev.filter((_, idx) => idx !== i))}
          >
            Remove
          </button>
        </div>
      ))}
      <Button type="button" variant="outline" size="sm" onClick={() => setStages((prev) => [...prev, { ...EMPTY_STAGE }])}>
        + Add stage
      </Button>
    </div>
  );
}
