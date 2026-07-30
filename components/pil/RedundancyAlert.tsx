import type { RedundancyAnalysis } from "@/lib/pil/types";

interface Props {
  analysis: RedundancyAnalysis;
}

export default function RedundancyAlert({ analysis }: Props) {
  if (analysis.redundantGroups.length === 0) return null;

  return (
    <div className="space-y-2">
      {analysis.redundantGroups.map((group, i) => (
        <div key={i} className="border-l-2 border-amber-300 bg-amber-50 pl-3 pr-2 py-2 rounded-r">
          <p className="text-xs font-medium text-amber-800 capitalize">
            {group.movementPattern.replace(/_/g, " ")} / {group.primaryMuscleGroup.replace(/_/g, " ")}
          </p>
          <div className="flex flex-wrap gap-x-2 mt-1">
            {group.exercises.map((e) => (
              <span key={e.id} className="text-xs text-amber-700">
                {e.name}
                {e.sets !== null && (
                  <span className="text-amber-500 ml-0.5">({e.sets})</span>
                )}
              </span>
            ))}
          </div>
          <p className="text-xs text-amber-600 mt-1">
            {group.totalSets} total sets — confirm each serves a distinct purpose
          </p>
        </div>
      ))}
    </div>
  );
}
