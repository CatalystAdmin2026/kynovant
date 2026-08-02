"use client";

import { useState } from "react";
import type { VolumeAnalysis } from "@/lib/pil/types";

interface Props {
  analysis: VolumeAnalysis;
}

type SortKey = "muscle" | "direct" | "total";

export default function MuscleSetsTable({ analysis }: Props) {
  const [sort, setSort] = useState<SortKey>("direct");

  const hasData = analysis.byMuscle.length > 0;

  const sorted = [...analysis.byMuscle].sort((a, b) => {
    if (sort === "muscle") return a.muscleGroup.localeCompare(b.muscleGroup);
    if (sort === "direct") return b.directSets - a.directSets;
    return b.totalSets - a.totalSets;
  });

  function SortButton({ label, field }: { label: string; field: SortKey }) {
    return (
      <button
        onClick={() => setSort(field)}
        className={`text-left text-xs font-medium uppercase tracking-wider transition-colors ${
          sort === field ? "text-white/70" : "text-white/40 hover:text-white/70"
        }`}
      >
        {label}
        {sort === field && <span className="ml-1">↓</span>}
      </button>
    );
  }

  if (!hasData) {
    return (
      <div className="bg-[var(--surface)] border border-white/[0.07] rounded-lg py-6 text-center text-xs text-white/40">
        No muscle data available — add exercise_muscles rows to your exercise library to unlock volume analysis.
      </div>
    );
  }

  return (
    <div className="bg-[var(--surface)] border border-white/[0.07] rounded-lg p-4 overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-white/[0.08]">
            <th className="pb-2 pr-6 text-left">
              <SortButton label="Muscle Group" field="muscle" />
            </th>
            <th className="pb-2 pr-6 text-right">
              <SortButton label="Direct Sets" field="direct" />
            </th>
            <th className="pb-2 pr-6 text-right">
              <span className="text-xs font-medium uppercase tracking-wider text-white/40">
                Indirect Sets
              </span>
            </th>
            <th className="pb-2 text-right">
              <SortButton label="Total" field="total" />
            </th>
          </tr>
        </thead>
        <tbody>
          {sorted.map((row) => (
            <tr key={row.muscleGroup} className="border-b border-white/[0.06] last:border-0">
              <td className="py-2 pr-6 text-white/70 capitalize">
                {row.muscleGroup.replace(/_/g, " ")}
              </td>
              <td className="py-2 pr-6 text-right font-mono text-white/70">
                {row.directSets}
              </td>
              <td className="py-2 pr-6 text-right font-mono text-white/40">
                {row.indirectSets}
              </td>
              <td className="py-2 text-right font-mono text-white/40">
                {row.totalSets}
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      {analysis.unknownVolume.prescriptionsWithNoMuscleData.length > 0 && (
        <p className="mt-2 text-xs text-white/40">
          ~ Volume totals are approximate.{" "}
          {analysis.unknownVolume.prescriptionsWithNoMuscleData.length} exercise
          {analysis.unknownVolume.prescriptionsWithNoMuscleData.length !== 1 ? "s" : ""} lack muscle data.
        </p>
      )}
    </div>
  );
}
