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
          sort === field ? "text-gray-900" : "text-gray-400 hover:text-gray-600"
        }`}
      >
        {label}
        {sort === field && <span className="ml-1">↓</span>}
      </button>
    );
  }

  if (!hasData) {
    return (
      <div className="py-6 text-center text-xs text-gray-400">
        No muscle data available — add exercise_muscles rows to your exercise library to unlock volume analysis.
      </div>
    );
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-gray-100">
            <th className="pb-2 pr-6 text-left">
              <SortButton label="Muscle Group" field="muscle" />
            </th>
            <th className="pb-2 pr-6 text-right">
              <SortButton label="Direct Sets" field="direct" />
            </th>
            <th className="pb-2 pr-6 text-right">
              <span className="text-xs font-medium uppercase tracking-wider text-gray-400">
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
            <tr key={row.muscleGroup} className="border-b border-gray-50 last:border-0">
              <td className="py-2 pr-6 text-gray-700 capitalize">
                {row.muscleGroup.replace(/_/g, " ")}
              </td>
              <td className="py-2 pr-6 text-right font-mono text-gray-900">
                {row.directSets}
              </td>
              <td className="py-2 pr-6 text-right font-mono text-gray-400">
                {row.indirectSets}
              </td>
              <td className="py-2 text-right font-mono text-gray-600">
                {row.totalSets}
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      {analysis.unknownVolume.prescriptionsWithNoMuscleData.length > 0 && (
        <p className="mt-2 text-xs text-gray-400">
          ~ Volume totals are approximate.{" "}
          {analysis.unknownVolume.prescriptionsWithNoMuscleData.length} exercise
          {analysis.unknownVolume.prescriptionsWithNoMuscleData.length !== 1 ? "s" : ""} lack muscle data.
        </p>
      )}
    </div>
  );
}
