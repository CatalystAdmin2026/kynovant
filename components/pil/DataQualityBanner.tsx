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
    <div className="bg-gray-50 border border-gray-200 rounded p-3 text-xs text-gray-500 space-y-2">
      <p className="font-medium text-gray-600 uppercase tracking-wider text-xs">
        Data Quality
      </p>
      <div className="flex flex-wrap gap-x-4 gap-y-1">
        <span>Volume coverage: {coveragePct.volume}%</span>
        <span>Fatigue coverage: {coveragePct.fatigue}%</span>
        <span>Joint stress coverage: {coveragePct.jointStress}%</span>
      </div>
      <p className="text-gray-400 leading-relaxed">{recommendation}</p>
    </div>
  );
}
