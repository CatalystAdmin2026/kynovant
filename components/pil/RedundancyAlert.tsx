import type { RedundancyAnalysis } from "@/lib/pil/types";
import { SEVERITY_DOT, SEVERITY_TEXT } from "@/lib/ui/status";

interface Props {
  analysis: RedundancyAnalysis;
}

export default function RedundancyAlert({ analysis }: Props) {
  if (analysis.redundantGroups.length === 0) return null;

  return (
    <div className="space-y-2">
      {analysis.redundantGroups.map((group, i) => (
        <div
          key={i}
          className={`border-l-2 ${SEVERITY_DOT.caution.replace("bg-", "border-l-")} bg-amber-500/10 pl-3 pr-2 py-2 rounded-r`}
        >
          <p className={`text-xs font-medium capitalize ${SEVERITY_TEXT.caution}`}>
            {group.movementPattern.replace(/_/g, " ")} / {group.primaryMuscleGroup.replace(/_/g, " ")}
          </p>
          <div className="flex flex-wrap gap-x-2 mt-1">
            {group.exercises.map((e) => (
              <span key={e.id} className="text-xs text-white/40">
                {e.name}
                {e.sets !== null && (
                  <span className="text-white/25 ml-0.5">({e.sets})</span>
                )}
              </span>
            ))}
          </div>
          <p className="text-xs text-white/40 mt-1">
            {group.totalSets} total sets — confirm each serves a distinct purpose
          </p>
        </div>
      ))}
    </div>
  );
}
