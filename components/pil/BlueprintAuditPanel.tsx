"use client";

import { useState, useCallback } from "react";
import type { BlueprintAuditResult, BlueprintDimensionStatus, CoachingRecommendation, RecommendationCategory, SubstitutionCandidate } from "@/lib/pil/types";
import PilFindingCard from "./PilFindingCard";
import MuscleSetsTable from "./MuscleSetsTable";
import MovementPatternChart from "./MovementPatternChart";
import DataQualityBanner from "./DataQualityBanner";
import JointStressPanel from "./JointStressPanel";
import RedundancyAlert from "./RedundancyAlert";
import DurationBadge from "./DurationBadge";
import CoachingRecommendationsPanel from "./CoachingRecommendationsPanel";
import SubstitutionDrawer from "./SubstitutionDrawer";

// ─── Section ID mapping ────────────────────────────────────────────────────────

const CATEGORY_SECTION_ID: Partial<Record<RecommendationCategory, string>> = {
  volume: "pil-section-volume",
  movement: "pil-section-movement",
  joint_stress: "pil-section-joint-stress",
  session_design: "pil-section-fatigue",
  recovery: "pil-section-findings",
  program_structure: "pil-section-findings",
};

interface Props {
  templateId: string;
}

// ─── Dimension chip ────────────────────────────────────────────────────────────

const STATUS_LABEL: Record<string, string> = {
  ok: "OK",
  has_errors: "Errors",
  elevated: "Elevated",
  incomplete: "Incomplete",
  moderate: "OK",
  high: "High",
  balanced: "Balanced",
  imbalanced: "Imbalanced",
  detected: "Detected",
  long: "Long",
  very_long: "Very Long",
  extreme: "Extreme",
  unknown: "—",
};

const CHIP_STYLE: Record<string, string> = {
  ok: "bg-gray-100 text-gray-500",
  moderate: "bg-gray-100 text-gray-500",
  balanced: "bg-gray-100 text-gray-500",
  elevated: "bg-amber-100 text-amber-700",
  incomplete: "bg-amber-100 text-amber-600",
  long: "bg-amber-100 text-amber-700",
  high: "bg-orange-100 text-orange-700",
  imbalanced: "bg-orange-100 text-orange-700",
  detected: "bg-amber-100 text-amber-700",
  very_long: "bg-orange-100 text-orange-700",
  has_errors: "bg-red-100 text-red-700 font-semibold",
  extreme: "bg-red-100 text-red-700 font-semibold",
  unknown: "bg-gray-50 text-gray-300 border border-gray-200",
};

function DimensionChip({ label, value }: { label: string; value: string }) {
  const chipStyle = CHIP_STYLE[value] ?? "bg-gray-100 text-gray-500";
  const displayLabel = STATUS_LABEL[value] ?? value;
  return (
    <div className="flex flex-col items-center gap-0.5 min-w-[56px]">
      <span className="text-[10px] text-gray-400 uppercase tracking-wider">{label}</span>
      <span className={`text-xs px-2 py-0.5 rounded-full whitespace-nowrap ${chipStyle}`}>
        {displayLabel}
      </span>
    </div>
  );
}

// ─── Highest-priority recommendation callout ──────────────────────────────────

const TOP_REC_STYLE: Record<string, string> = {
  critical: "border-red-200 bg-red-50 text-red-800",
  high: "border-orange-200 bg-orange-50 text-orange-800",
  medium: "border-amber-200 bg-amber-50 text-amber-800",
  low: "border-gray-200 bg-gray-50 text-gray-600",
};

function HighestPriorityCallout({ recommendation }: { recommendation: CoachingRecommendation }) {
  const style = TOP_REC_STYLE[recommendation.priority] ?? TOP_REC_STYLE.low;
  return (
    <div className={`border rounded-md px-3 py-2 ${style}`}>
      <p className="text-[10px] font-semibold uppercase tracking-wider opacity-60 mb-0.5">
        Highest Priority
      </p>
      <p className="text-xs font-medium">{recommendation.headline}</p>
    </div>
  );
}

// ─── Main panel ───────────────────────────────────────────────────────────────

export default function BlueprintAuditPanel({ templateId }: Props) {
  const [state, setState] = useState<"idle" | "loading" | "done" | "error">("idle");
  const [result, setResult] = useState<BlueprintAuditResult | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // Substitution drawer state
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [drawerExerciseName, setDrawerExerciseName] = useState("");
  const [drawerCandidates, setDrawerCandidates] = useState<SubstitutionCandidate[]>([]);
  const [drawerLoading, setDrawerLoading] = useState(false);

  const openSubstitutes = useCallback(async (exerciseId: string, exerciseName: string) => {
    setDrawerExerciseName(exerciseName);
    setDrawerCandidates([]);
    setDrawerLoading(true);
    setDrawerOpen(true);
    try {
      const res = await fetch(`/api/internal/pil/exercise/${exerciseId}/substitutes`);
      const body = await res.json();
      if (body.ok) setDrawerCandidates(body.result.candidates);
    } catch {
      // leave empty — drawer shows "no substitutes found"
    } finally {
      setDrawerLoading(false);
    }
  }, []);

  const handleViewEvidence = useCallback((category: RecommendationCategory) => {
    const sectionId = CATEGORY_SECTION_ID[category] ?? "pil-section-findings";
    document.getElementById(sectionId)?.scrollIntoView({ behavior: "smooth", block: "start" });
  }, []);

  async function runAnalysis() {
    setState("loading");
    setErrorMsg(null);
    try {
      const res = await fetch(`/api/internal/pil/blueprint/${templateId}/audit`, {
        method: "POST",
      });
      const json = (await res.json()) as {
        ok: boolean;
        result?: BlueprintAuditResult;
        error?: string;
      };
      if (json.ok && json.result) {
        setResult(json.result);
        setState("done");
      } else {
        setErrorMsg(json.error ?? "Analysis failed");
        setState("error");
      }
    } catch {
      setErrorMsg("Network error");
      setState("error");
    }
  }

  // ── Idle ─────────────────────────────────────────────────────────────────────

  if (state === "idle") {
    return (
      <div className="border border-gray-200 rounded-lg p-4 flex items-center justify-between">
        <div>
          <p className="text-sm font-medium text-gray-700">Program Intelligence</p>
          <p className="text-xs text-gray-400 mt-0.5">
            Volume, fatigue, movement, joint stress, and session duration analysis
          </p>
        </div>
        <button
          onClick={runAnalysis}
          className="text-xs px-3 py-1.5 bg-gray-900 text-white rounded hover:bg-gray-700 transition-colors"
        >
          Run Analysis
        </button>
      </div>
    );
  }

  // ── Loading ───────────────────────────────────────────────────────────────────

  if (state === "loading") {
    return (
      <div className="border border-gray-200 rounded-lg p-4">
        <div className="flex items-center gap-3 mb-3">
          <div className="w-3.5 h-3.5 border-2 border-gray-200 border-t-gray-600 rounded-full animate-spin" />
          <p className="text-xs text-gray-500">Running Catalyst Insights…</p>
        </div>
        <div className="space-y-2 animate-pulse">
          <div className="flex gap-2">
            {[1, 2, 3, 4, 5, 6, 7].map((i) => (
              <div key={i} className="h-6 w-12 bg-gray-100 rounded-full" />
            ))}
          </div>
          <div className="h-9 bg-gray-50 rounded-md border border-gray-100 mt-3" />
        </div>
      </div>
    );
  }

  // ── Error ─────────────────────────────────────────────────────────────────────

  if (state === "error") {
    return (
      <div className="border border-red-200 rounded-lg p-4">
        <div className="flex items-center justify-between">
          <p className="text-xs text-red-500">{errorMsg}</p>
          <button onClick={runAnalysis} className="text-xs text-gray-500 hover:text-gray-700">
            Retry
          </button>
        </div>
      </div>
    );
  }

  // ── Results ───────────────────────────────────────────────────────────────────

  if (!result) return null;

  const {
    qualitySummary,
    volumeAnalysis,
    fatigueAnalysis,
    movementAnalysis,
    jointStressAnalysis,
    redundancyAnalysis,
    durationEstimate,
    completenessReport,
    allFindings,
    recommendations,
  } = result;
  const { dimensionStatus } = qualitySummary;

  const dimensionChips: { label: string; key: keyof BlueprintDimensionStatus }[] = [
    { label: "Validity", key: "validity" },
    { label: "Volume", key: "volume" },
    { label: "Fatigue", key: "fatigue" },
    { label: "Movement", key: "movement" },
    { label: "Joints", key: "jointStress" },
    { label: "Overlap", key: "redundancy" },
    { label: "Duration", key: "duration" },
  ];

  const realFindings = allFindings.filter((f) => f.confidence !== "incomplete_data");
  const dataFindings = allFindings.filter((f) => f.confidence === "incomplete_data");

  const findingsByCategory = realFindings.reduce<Record<string, typeof realFindings>>(
    (acc, f) => {
      (acc[f.category] = acc[f.category] ?? []).push(f);
      return acc;
    },
    {},
  );

  return (
    <div className="border border-gray-200 rounded-lg overflow-hidden">

      {/* ── Five-Second Header ─────────────────────────────────────────────── */}
      <div className="border-b border-gray-100 px-4 py-3 bg-gray-50">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="flex items-center gap-2 mb-2">
              <p className="text-sm font-medium text-gray-700">Catalyst Insights</p>
              <DurationBadge
                estimatedMinutes={durationEstimate.estimatedMinutes}
                confidence={durationEstimate.confidence}
              />
            </div>

            {/* Dimension chips — glanceable status board */}
            <div className="flex flex-wrap gap-2">
              {dimensionChips.map(({ label, key }) => (
                <DimensionChip key={key} label={label} value={dimensionStatus[key]} />
              ))}
            </div>
          </div>

          <button
            onClick={runAnalysis}
            className="text-xs text-gray-400 hover:text-gray-600 transition-colors shrink-0 mt-0.5"
          >
            Re-analyze
          </button>
        </div>

        {/* Highest priority recommendation — always in the header zone */}
        {recommendations.highestPriority && recommendations.highestPriority.priority !== "low" && (
          <div className="mt-3">
            <HighestPriorityCallout recommendation={recommendations.highestPriority} />
          </div>
        )}
      </div>

      {/* ── Coaching Recommendations ──────────────────────────────────────── */}
      <div className="border-b border-gray-100 px-4 py-4">
        <p className="text-[10px] font-medium uppercase tracking-wider text-gray-400 mb-3">
          Coaching Recommendations
        </p>
        <CoachingRecommendationsPanel
          result={recommendations}
          onSubstituteRequest={openSubstitutes}
          onViewEvidence={handleViewEvidence}
        />
      </div>

      {/* ── Detail sections ────────────────────────────────────────────────── */}
      <div className="p-4 space-y-6">

        {/* Volume by muscle */}
        <div id="pil-section-volume">
          <p className="text-xs font-medium uppercase tracking-wider text-gray-400 mb-3">
            Volume by Muscle
          </p>
          <MuscleSetsTable analysis={volumeAnalysis} />
        </div>

        {/* Movement patterns */}
        {movementAnalysis.byPattern.length >= 2 && (
          <div id="pil-section-movement">
            <p className="text-xs font-medium uppercase tracking-wider text-gray-400 mb-3">
              Movement Patterns
            </p>
            <MovementPatternChart analysis={movementAnalysis} />
          </div>
        )}

        {/* Joint stress */}
        {jointStressAnalysis.byJoint.length > 0 && (
          <div id="pil-section-joint-stress">
            <p className="text-xs font-medium uppercase tracking-wider text-gray-400 mb-3">
              Joint Stress (cumulative)
            </p>
            <JointStressPanel analysis={jointStressAnalysis} />
          </div>
        )}

        {/* Session fatigue */}
        {fatigueAnalysis.coveragePct > 0 && (
          <div id="pil-section-fatigue">
            <p className="text-xs font-medium uppercase tracking-wider text-gray-400 mb-1">
              Session Fatigue
            </p>
            <p className="text-xs text-gray-500">
              Estimated score:{" "}
              <span className="font-mono text-gray-900">{fatigueAnalysis.totalScore}</span>
              <span className="text-gray-400 ml-1">({fatigueAnalysis.coveragePct}% coverage)</span>
            </p>
          </div>
        )}

        {/* Redundancy */}
        {redundancyAnalysis.redundantGroups.length > 0 && (
          <div id="pil-section-redundancy">
            <p className="text-xs font-medium uppercase tracking-wider text-gray-400 mb-2">
              Exercise Overlap
            </p>
            <RedundancyAlert analysis={redundancyAnalysis} />
          </div>
        )}

        {/* All findings (grouped by category) */}
        {realFindings.length > 0 && (
          <div id="pil-section-findings">
            <p className="text-xs font-medium uppercase tracking-wider text-gray-400 mb-3">
              All Findings
            </p>
            <div className="space-y-3">
              {Object.entries(findingsByCategory).map(([category, findings]) => (
                <div key={category}>
                  <p className="text-xs text-gray-400 capitalize mb-1.5">
                    {category.replace(/_/g, " ")}
                  </p>
                  <div className="space-y-1.5">
                    {findings.map((f) => (
                      <PilFindingCard key={f.id} finding={f} />
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {realFindings.length === 0 && (
          <p className="text-xs text-gray-400 text-center py-2">
            No findings — this Blueprint passes all checks.
          </p>
        )}

        {/* Data quality banner — always at bottom */}
        {dataFindings.length > 0 && <DataQualityBanner report={completenessReport} />}
      </div>

      {/* Substitution drawer */}
      <SubstitutionDrawer
        open={drawerOpen}
        exerciseName={drawerExerciseName}
        candidates={drawerCandidates}
        loading={drawerLoading}
        onClose={() => setDrawerOpen(false)}
      />
    </div>
  );
}
