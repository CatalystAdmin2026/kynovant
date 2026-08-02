"use client";

import { useState, useCallback } from "react";
import type { BlueprintAuditResult, BlueprintDimensionStatus, CoachingRecommendation, RecommendationCategory, SubstitutionCandidate } from "@/lib/pil/types";
import { SEVERITY_DOT, SEVERITY_TEXT, type Severity } from "@/lib/ui/status";
import { StatusChip } from "@/components/ui";
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

// Maps this panel's own dimension-status vocabulary onto the shared
// canonical Severity scale (lib/ui/status.ts) — relative severity
// order preserved from the original hardcoded chip colors.
function dimensionSeverity(value: string): Severity {
  switch (value) {
    case "ok":
    case "moderate":
    case "balanced":
      return "ok";
    case "elevated":
    case "incomplete":
    case "long":
    case "detected":
      return "caution";
    case "high":
    case "imbalanced":
    case "very_long":
      return "high";
    case "has_errors":
    case "extreme":
      return "critical";
    default:
      return "unknown";
  }
}

function DimensionChip({ label, value }: { label: string; value: string }) {
  const sev = dimensionSeverity(value);
  const displayLabel = STATUS_LABEL[value] ?? value;
  return (
    <div className="flex flex-col items-center gap-1 min-w-[56px]">
      <span className="text-[9px] font-semibold text-white/40 uppercase tracking-[0.25em]">{label}</span>
      <StatusChip tone="dark" status={sev} label={displayLabel} size="sm" />
    </div>
  );
}

// ─── Highest-priority recommendation callout ──────────────────────────────────

// Maps this panel's own recommendation-priority vocabulary onto the
// shared canonical Severity scale.
function priorityToSeverity(priority: string): Severity {
  switch (priority) {
    case "critical":
      return "critical";
    case "high":
      return "high";
    case "medium":
      return "caution";
    default:
      return "unknown"; // low
  }
}

function HighestPriorityCallout({ recommendation }: { recommendation: CoachingRecommendation }) {
  const sev = priorityToSeverity(recommendation.priority);
  const borderAccent = SEVERITY_DOT[sev].replace("bg-", "border-l-");
  return (
    <div className={`border border-white/[0.08] border-l-2 ${borderAccent} bg-white/[0.04] rounded-md px-3 py-2`}>
      <p className="text-[10px] font-semibold uppercase tracking-[0.3em] text-white/40 mb-0.5">
        Highest Priority
      </p>
      <p className={`text-xs font-medium ${SEVERITY_TEXT[sev]}`}>{recommendation.headline}</p>
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
      <div className="border border-white/[0.08] bg-[var(--surface)] rounded-lg p-4 flex items-center justify-between">
        <div>
          <p className="text-sm font-medium text-white/70">Program Intelligence</p>
          <p className="text-xs text-white/40 mt-0.5">
            Volume, fatigue, movement, joint stress, and session duration analysis
          </p>
        </div>
        <button
          onClick={runAnalysis}
          className="text-xs px-3 py-1.5 bg-gold text-black rounded hover:bg-gold-hover transition-colors"
        >
          Run Analysis
        </button>
      </div>
    );
  }

  // ── Loading ───────────────────────────────────────────────────────────────────

  if (state === "loading") {
    return (
      <div className="border border-white/[0.08] bg-[var(--surface)] rounded-lg p-4">
        <div className="flex items-center gap-3 mb-3">
          <div className="w-3.5 h-3.5 border-2 border-white/15 border-t-white/50 rounded-full animate-spin" />
          <p className="text-xs text-white/40">Running Kynovant Insights…</p>
        </div>
        <div className="space-y-2 animate-pulse">
          <div className="flex gap-2">
            {[1, 2, 3, 4, 5, 6, 7].map((i) => (
              <div key={i} className="h-6 w-12 bg-white/[0.06] rounded-full" />
            ))}
          </div>
          <div className="h-9 bg-white/[0.04] rounded-md border border-white/[0.06] mt-3" />
        </div>
      </div>
    );
  }

  // ── Error ─────────────────────────────────────────────────────────────────────

  if (state === "error") {
    return (
      <div className="border border-red-500/20 bg-[var(--surface)] rounded-lg p-4">
        <div className="flex items-center justify-between">
          <p className={`text-xs ${SEVERITY_TEXT.critical}`}>{errorMsg}</p>
          <button onClick={runAnalysis} className="text-xs text-white/40 hover:text-white/70">
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
    <div className="border border-white/[0.08] rounded-lg overflow-hidden">

      {/* ── Five-Second Header ─────────────────────────────────────────────── */}
      <div className="border-b border-white/[0.08] px-4 py-3 bg-[var(--surface)]">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="flex items-center gap-2 mb-2">
              <p className="text-sm font-medium text-white/70">Kynovant Insights</p>
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
            className="text-xs text-white/40 hover:text-white/70 transition-colors shrink-0 mt-0.5"
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
      <div className="border-b border-white/[0.08] bg-[var(--surface)] px-4 py-4">
        <p className="text-[10px] font-semibold uppercase tracking-[0.3em] text-white/40 mb-3">
          Coaching Recommendations
        </p>
        <CoachingRecommendationsPanel
          result={recommendations}
          onSubstituteRequest={openSubstitutes}
          onViewEvidence={handleViewEvidence}
        />
      </div>

      {/* ── Detail sections ────────────────────────────────────────────────── */}
      <div className="bg-[var(--surface)] p-4 space-y-6">

        {/* Volume by muscle */}
        <div id="pil-section-volume">
          <p className="text-[10px] font-semibold uppercase tracking-[0.3em] text-white/40 mb-3">
            Volume by Muscle
          </p>
          <MuscleSetsTable analysis={volumeAnalysis} />
        </div>

        {/* Movement patterns */}
        {movementAnalysis.byPattern.length >= 2 && (
          <div id="pil-section-movement">
            <p className="text-[10px] font-semibold uppercase tracking-[0.3em] text-white/40 mb-3">
              Movement Patterns
            </p>
            <MovementPatternChart analysis={movementAnalysis} />
          </div>
        )}

        {/* Joint stress */}
        {jointStressAnalysis.byJoint.length > 0 && (
          <div id="pil-section-joint-stress">
            <p className="text-[10px] font-semibold uppercase tracking-[0.3em] text-white/40 mb-3">
              Joint Stress (cumulative)
            </p>
            <JointStressPanel analysis={jointStressAnalysis} />
          </div>
        )}

        {/* Session fatigue */}
        {fatigueAnalysis.coveragePct > 0 && (
          <div id="pil-section-fatigue">
            <p className="text-[10px] font-semibold uppercase tracking-[0.3em] text-white/40 mb-1">
              Session Fatigue
            </p>
            <p className="text-xs text-white/40">
              Estimated score:{" "}
              <span className="font-mono text-white/70">{fatigueAnalysis.totalScore}</span>
              <span className="text-white/25 ml-1">({fatigueAnalysis.coveragePct}% coverage)</span>
            </p>
          </div>
        )}

        {/* Redundancy */}
        {redundancyAnalysis.redundantGroups.length > 0 && (
          <div id="pil-section-redundancy">
            <p className="text-[10px] font-semibold uppercase tracking-[0.3em] text-white/40 mb-2">
              Exercise Overlap
            </p>
            <RedundancyAlert analysis={redundancyAnalysis} />
          </div>
        )}

        {/* All findings (grouped by category) */}
        {realFindings.length > 0 && (
          <div id="pil-section-findings">
            <p className="text-[10px] font-semibold uppercase tracking-[0.3em] text-white/40 mb-3">
              All Findings
            </p>
            <div className="space-y-3">
              {Object.entries(findingsByCategory).map(([category, findings]) => (
                <div key={category}>
                  <p className="text-xs text-white/40 capitalize mb-1.5">
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
          <p className="text-xs text-white/40 text-center py-2">
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
