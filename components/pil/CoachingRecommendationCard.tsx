"use client";

import { useState } from "react";
import type { CoachingRecommendation, RecommendationCategory } from "@/lib/pil/types";

// ─── Priority styling ─────────────────────────────────────────────────────────

const PRIORITY_BAR: Record<string, string> = {
  critical: "bg-red-500",
  high: "bg-orange-400",
  medium: "bg-amber-400",
  low: "bg-gray-200",
};

const CATEGORY_LABEL: Record<string, string> = {
  volume: "Volume",
  recovery: "Recovery",
  movement: "Movement",
  joint_stress: "Joint Stress",
  program_structure: "Structure",
  session_design: "Session",
};

interface Props {
  recommendation: CoachingRecommendation;
  onSubstituteRequest?: (exerciseId: string, exerciseName: string) => void;
  onHighlightMuscle?: (muscleId: string) => void;
  onViewEvidence?: (category: RecommendationCategory) => void;
}

export default function CoachingRecommendationCard({
  recommendation,
  onSubstituteRequest,
  onHighlightMuscle,
  onViewEvidence,
}: Props) {
  const [expanded, setExpanded] = useState(false);
  const barColor = PRIORITY_BAR[recommendation.priority] ?? "bg-gray-200";

  const hasSubstitutes = recommendation.substituteExercises.length > 0;
  const hasMuscles = recommendation.affectedMuscleGroups.length > 0;

  function handleSubstituteClick() {
    const first = recommendation.substituteExercises[0];
    if (first && onSubstituteRequest) {
      onSubstituteRequest(first.id, first.name);
    }
  }

  function handleHighlightClick() {
    const first = recommendation.affectedMuscleGroups[0];
    if (first && onHighlightMuscle) {
      onHighlightMuscle(first);
    }
  }

  function handleViewEvidence() {
    if (onViewEvidence) {
      onViewEvidence(recommendation.category);
    }
  }

  return (
    <div className="border border-gray-100 rounded-lg overflow-hidden">
      {/* Priority bar — 3px top accent communicates severity at a glance */}
      <div className={`h-0.5 w-full ${barColor}`} />

      <div className="px-3.5 py-3">
        {/* Category + confidence */}
        <div className="flex items-center gap-2 mb-1.5">
          <span className="text-[10px] text-gray-400 uppercase tracking-wider">
            {CATEGORY_LABEL[recommendation.category] ?? recommendation.category}
          </span>
          {recommendation.confidence === "certain" && (
            <span className="text-[9px] text-gray-300 border border-gray-100 rounded px-1 py-0.5 tracking-wider uppercase">
              Certain
            </span>
          )}
        </div>

        {/* Headline — the coaching action */}
        <p className="text-sm text-gray-900 leading-snug font-medium">
          {recommendation.headline}
        </p>

        {/* Action row — contextual actions + always-present "Why" toggle */}
        <div className="mt-2.5 flex flex-wrap items-center gap-x-3 gap-y-1">
          {/* Show in Brief — scrolls to per-muscle table and highlights the row */}
          {hasMuscles && onHighlightMuscle && (
            <button
              onClick={handleHighlightClick}
              className="text-[11px] text-blue-500 hover:text-blue-700 transition-colors"
            >
              Show in Brief →
            </button>
          )}

          {/* Find substitute — opens SubstitutionDrawer pre-loaded for the exercise */}
          {hasSubstitutes && onSubstituteRequest && (
            <button
              onClick={handleSubstituteClick}
              className="text-[11px] text-indigo-500 hover:text-indigo-700 transition-colors"
            >
              Find substitute →
            </button>
          )}

          {/* View evidence — scrolls to the relevant analysis section */}
          {onViewEvidence && (
            <button
              onClick={handleViewEvidence}
              className="text-[11px] text-gray-400 hover:text-gray-700 transition-colors"
            >
              View evidence →
            </button>
          )}

          {/* Expand toggle — always at end of action row */}
          <button
            onClick={() => setExpanded((x) => !x)}
            className="text-[11px] text-gray-400 hover:text-gray-700 transition-colors"
          >
            {expanded ? "Hide" : "Why →"}
          </button>
        </div>

        {/* Expanded: rationale + supporting codes */}
        {expanded && (
          <div className="mt-2.5 space-y-2">
            <p className="text-xs text-gray-500 leading-relaxed">
              {recommendation.rationale}
            </p>

            {recommendation.supportingFindingCodes.length > 0 && (
              <div className="flex flex-wrap gap-1 pt-1">
                {recommendation.supportingFindingCodes.map((code) => (
                  <span
                    key={code}
                    className="inline-block font-mono text-[9px] bg-gray-50 border border-gray-100 text-gray-400 rounded px-1.5 py-0.5"
                  >
                    {code}
                  </span>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
