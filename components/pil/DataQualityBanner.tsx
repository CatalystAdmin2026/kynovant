"use client";

import type { CompletenessReport } from "@/lib/pil/types";

interface Props {
  report: CompletenessReport;
}

export default function DataQualityBanner({ report }: Props) {
  const { coveragePct, recommendation } = report;

  // Only render if coverage is meaningfully incomplete
  const isIncomplete =
    coveragePct.fatigue < 100 ||
    coveragePct.volume < 100 ||
    coveragePct.jointStress < 100;

  if (!isIncomplete) return null;

  return (
    <div className="bg-[var(--surface)] border border-white/[0.08] rounded p-3 text-xs text-white/40 space-y-2">
      <p className="text-[10px] font-semibold text-white/40 uppercase tracking-[0.3em]">
        Data Quality
      </p>
      <div className="flex flex-wrap gap-x-4 gap-y-1">
        <span>Volume coverage: {coveragePct.volume}%</span>
        <span>Fatigue coverage: {coveragePct.fatigue}%</span>
        <span>Joint stress coverage: {coveragePct.jointStress}%</span>
      </div>
      <p className="text-white/25 leading-relaxed">{recommendation}</p>
    </div>
  );
}
