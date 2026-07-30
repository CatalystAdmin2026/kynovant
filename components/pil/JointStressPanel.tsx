"use client";

import { useState } from "react";
import type { JointStressAnalysis } from "@/lib/pil/types";

interface Props {
  analysis: JointStressAnalysis;
}

function barColor(peakScore: number): string {
  if (peakScore >= 9) return "bg-red-400";
  if (peakScore >= 6) return "bg-amber-400";
  return "bg-gray-300";
}

export default function JointStressPanel({ analysis }: Props) {
  const [expanded, setExpanded] = useState<string | null>(null);

  if (analysis.byJoint.length === 0) {
    return (
      <p className="text-xs text-gray-400">
        No joint stress data — add joint scores to exercises to unlock this analysis.
      </p>
    );
  }

  const maxScore = Math.max(...analysis.byJoint.map((j) => j.cumulativeScore), 1);

  return (
    <div className="space-y-1.5">
      {analysis.byJoint.map((joint) => {
        const widthPct = Math.round((joint.cumulativeScore / maxScore) * 100);
        const isOpen = expanded === joint.joint;

        return (
          <div key={joint.joint}>
            <button
              className="w-full flex items-center gap-2 text-left rounded px-1 py-0.5 hover:bg-gray-50 transition-colors"
              onClick={() => setExpanded(isOpen ? null : joint.joint)}
            >
              <span className="text-xs text-gray-500 w-16 capitalize shrink-0">{joint.joint}</span>
              <div className="flex-1 h-1.5 bg-gray-100 rounded-full overflow-hidden">
                <div
                  className={`h-full rounded-full ${barColor(joint.peakScore)} transition-all`}
                  style={{ width: `${widthPct}%` }}
                />
              </div>
              <span className="text-xs font-mono text-gray-400 w-6 text-right shrink-0">
                {joint.cumulativeScore}
              </span>
              {joint.highContributors.length > 0 && (
                <span className="text-gray-300 text-[10px] shrink-0">{isOpen ? "▲" : "▼"}</span>
              )}
            </button>

            {isOpen && joint.highContributors.length > 0 && (
              <div className="pl-[72px] mt-1 space-y-0.5 pb-1">
                {joint.highContributors.map((c) => (
                  <div key={c.exerciseId} className="flex justify-between text-xs text-gray-400">
                    <span>{c.exerciseName}</span>
                    <span className="font-mono text-gray-300">
                      {c.score} × {c.sets}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
