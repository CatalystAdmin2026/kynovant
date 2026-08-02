"use client";

import type { CoachingRecommendationResult, RecommendationCategory } from "@/lib/pil/types";
import { SEVERITY_TEXT } from "@/lib/ui/status";
import CoachingRecommendationCard from "./CoachingRecommendationCard";

// ─── Category display order ────────────────────────────────────────────────────

const CATEGORY_ORDER: RecommendationCategory[] = [
  "program_structure",
  "recovery",
  "session_design",
  "joint_stress",
  "movement",
  "muscle_balance",
  "progression",
  "volume",
];

const CATEGORY_LABEL: Record<RecommendationCategory, string> = {
  program_structure: "Program Structure",
  recovery: "Recovery",
  session_design: "Session Design",
  joint_stress: "Joint Stress",
  movement: "Movement Balance",
  muscle_balance: "Muscle Balance",
  progression: "Progression",
  volume: "Volume",
};

interface Props {
  result: CoachingRecommendationResult;
  onSubstituteRequest?: (exerciseId: string, exerciseName: string) => void;
  onHighlightMuscle?: (muscleId: string) => void;
  onViewEvidence?: (category: RecommendationCategory) => void;
}

export default function CoachingRecommendationsPanel({
  result,
  onSubstituteRequest,
  onHighlightMuscle,
  onViewEvidence,
}: Props) {
  if (!result.hasActionableRecommendations) {
    return (
      <div className="flex items-center gap-2 py-3 text-xs text-white/40">
        <span className={SEVERITY_TEXT.ok}>✓</span>
        No significant coaching actions identified — continue current approach.
      </div>
    );
  }

  // Collect categories that have at least one recommendation, in display order
  const presentCategories = CATEGORY_ORDER.filter(
    (cat) => (result.byCategory[cat]?.length ?? 0) > 0,
  );

  // Any categories not in the display order go at the end
  const knownCategories = new Set<string>(CATEGORY_ORDER);
  const extraCategories = Object.keys(result.byCategory).filter(
    (cat) => !knownCategories.has(cat) && (result.byCategory[cat as RecommendationCategory]?.length ?? 0) > 0,
  ) as RecommendationCategory[];

  const allCategories = [...presentCategories, ...extraCategories];

  return (
    <div className="space-y-4">
      {allCategories.map((category) => {
        const recs = result.byCategory[category] ?? [];
        return (
          <div key={category}>
            {allCategories.length > 1 && (
              <p className="text-[10px] font-semibold text-white/40 uppercase tracking-[0.3em] mb-2">
                {CATEGORY_LABEL[category] ?? category}
              </p>
            )}
            <div className="space-y-2">
              {recs.map((rec) => (
                <CoachingRecommendationCard
                  key={rec.id}
                  recommendation={rec}
                  onSubstituteRequest={onSubstituteRequest}
                  onHighlightMuscle={onHighlightMuscle}
                  onViewEvidence={onViewEvidence}
                />
              ))}
            </div>
          </div>
        );
      })}

      <p className="text-[10px] text-white/25 pt-1">
        {result.recommendations.length} recommendation{result.recommendations.length !== 1 ? "s" : ""} · Tap "Why →" on any card to see supporting evidence
      </p>
    </div>
  );
}
