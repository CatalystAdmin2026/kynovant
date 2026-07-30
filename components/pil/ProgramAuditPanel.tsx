"use client";

import { useState, useCallback, useRef } from "react";
import type { ProgramAuditResult, ProgramDimensionStatus, CoachingRecommendation, SubstitutionCandidate, RecommendationCategory } from "@/lib/pil/types";
import PerMuscleWeeklyBrief from "./PerMuscleWeeklyBrief";
import PilFindingCard from "./PilFindingCard";
import SubstitutionDrawer from "./SubstitutionDrawer";
import CoachingRecommendationsPanel from "./CoachingRecommendationsPanel";

// ─── Dimension chip ────────────────────────────────────────────────────────────

const PROG_STATUS_LABEL: Record<string, string> = {
  ok: "OK",
  has_errors: "Errors",
  appropriate: "OK",
  high: "High",
  adequate: "OK",
  insufficient: "Insufficient",
  unknown: "—",
};

const PROG_CHIP_STYLE: Record<string, string> = {
  ok: "bg-gray-100 text-gray-500",
  appropriate: "bg-gray-100 text-gray-500",
  adequate: "bg-gray-100 text-gray-500",
  high: "bg-amber-100 text-amber-700",
  insufficient: "bg-orange-100 text-orange-700",
  has_errors: "bg-red-100 text-red-700 font-semibold",
  unknown: "bg-gray-50 text-gray-300 border border-gray-200",
};

function ProgramDimensionChip({ label, value }: { label: string; value: string }) {
  const chipStyle = PROG_CHIP_STYLE[value] ?? "bg-gray-100 text-gray-500";
  const displayLabel = PROG_STATUS_LABEL[value] ?? value;
  return (
    <div className="flex flex-col items-center gap-0.5 min-w-[60px]">
      <span className="text-[10px] text-gray-400 uppercase tracking-wider">{label}</span>
      <span className={`text-xs px-2 py-0.5 rounded-full whitespace-nowrap ${chipStyle}`}>
        {displayLabel}
      </span>
    </div>
  );
}

// ─── Loading skeleton ─────────────────────────────────────────────────────────

function LoadingSkeleton() {
  return (
    <div className="animate-pulse space-y-4">
      <div className="flex gap-4">
        {[1, 2, 3].map((i) => (
          <div key={i} className="flex flex-col items-center gap-1.5">
            <div className="h-2.5 w-12 bg-gray-100 rounded-full" />
            <div className="h-5 w-10 bg-gray-100 rounded-full" />
          </div>
        ))}
      </div>
      <div className="h-10 bg-orange-50 rounded-md border border-orange-100" />
      <div className="space-y-2">
        <div className="h-16 bg-gray-50 rounded-lg border border-gray-100" />
        <div className="h-16 bg-gray-50 rounded-lg border border-gray-100" />
      </div>
    </div>
  );
}

// ─── Highest priority recommendation callout ──────────────────────────────────

const TOP_REC_STYLE: Record<string, string> = {
  critical: "border-red-200 bg-red-50 text-red-800",
  high: "border-orange-200 bg-orange-50 text-orange-800",
  medium: "border-amber-200 bg-amber-50 text-amber-800",
  low: "border-gray-200 bg-gray-50 text-gray-600",
};

function TopRecCallout({ recommendation }: { recommendation: CoachingRecommendation }) {
  const style = TOP_REC_STYLE[recommendation.priority] ?? TOP_REC_STYLE.low;
  return (
    <div className={`rounded-md border px-3 py-2.5 text-xs ${style}`}>
      <p className="text-[10px] font-semibold uppercase tracking-wider opacity-60 mb-0.5">
        Highest Priority
      </p>
      <p className="font-medium leading-snug">{recommendation.headline}</p>
    </div>
  );
}

// ─── Section ID mapping ────────────────────────────────────────────────────────

const CATEGORY_SECTION_ID: Partial<Record<RecommendationCategory, string>> = {
  volume: "pil-section-brief",
  recovery: "pil-section-brief",
  program_structure: "pil-section-findings",
  session_design: "pil-section-findings",
  movement: "pil-section-findings",
  joint_stress: "pil-section-findings",
};

// ─── Main panel ───────────────────────────────────────────────────────────────

interface Props {
  programTemplateId: string;
}

export default function ProgramAuditPanel({ programTemplateId }: Props) {
  const [result, setResult] = useState<ProgramAuditResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [expanded, setExpanded] = useState(false);
  const [runCount, setRunCount] = useState(0);

  // Substitution drawer state
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [drawerExerciseName, setDrawerExerciseName] = useState("");
  const [drawerCandidates, setDrawerCandidates] = useState<SubstitutionCandidate[]>([]);
  const [drawerLoading, setDrawerLoading] = useState(false);

  // Muscle highlight state
  const [highlightedMuscle, setHighlightedMuscle] = useState<string | undefined>(undefined);
  const highlightResetRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const runAudit = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(
        `/api/internal/pil/program/${programTemplateId}/audit`,
        { method: "POST" },
      );
      const body = await res.json();
      if (body.ok) {
        setResult(body.result as ProgramAuditResult);
        setExpanded(true);
        setRunCount((n) => n + 1);
      } else {
        setError(body.error ?? "Analysis failed");
      }
    } catch {
      setError("Network error — could not reach analysis service");
    } finally {
      setLoading(false);
    }
  }, [programTemplateId]);

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

  const handleHighlightMuscle = useCallback((muscleId: string) => {
    if (highlightResetRef.current) clearTimeout(highlightResetRef.current);
    setHighlightedMuscle(muscleId);
    document.getElementById("pil-section-brief")?.scrollIntoView({ behavior: "smooth", block: "start" });
    highlightResetRef.current = setTimeout(() => setHighlightedMuscle(undefined), 2500);
  }, []);

  const handleViewEvidence = useCallback((category: RecommendationCategory) => {
    const sectionId = CATEGORY_SECTION_ID[category] ?? "pil-section-findings";
    document.getElementById(sectionId)?.scrollIntoView({ behavior: "smooth", block: "start" });
  }, []);

  const ds: ProgramDimensionStatus | undefined = result?.qualitySummary.dimensionStatus;
  const actionableFindings = result?.allFindings.filter((f) => f.confidence !== "incomplete_data") ?? [];
  const topRec = result?.recommendations.highestPriority ?? null;

  return (
    <>
      <div className="border border-gray-100 rounded-xl overflow-hidden">
        {/* ── Header ────────────────────────────────────────────────────────── */}
        <div className="px-5 py-4 bg-white">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-[10px] font-medium text-gray-400 uppercase tracking-widest mb-0.5">
                Catalyst Insights
              </p>
              <h3 className="text-sm font-semibold text-gray-900">Program Intelligence</h3>
              {!result && !loading && (
                <p className="text-xs text-gray-400 mt-1 leading-relaxed max-w-xs">
                  Analyzes frequency, recovery spacing, and weekly volume across all blueprints in this program.
                </p>
              )}
            </div>
            <button
              onClick={runAudit}
              disabled={loading}
              className={`shrink-0 text-xs rounded-md px-3 py-1.5 transition-colors disabled:opacity-50 ${
                result
                  ? "text-gray-500 hover:text-gray-900 border border-gray-200 hover:border-gray-400"
                  : "bg-gray-900 text-white hover:bg-gray-700"
              }`}
            >
              {loading ? "Analyzing…" : result ? "Re-analyze" : "Run Insights"}
            </button>
          </div>

          {/* Error state */}
          {error && (
            <div className="mt-3 text-xs text-red-600 bg-red-50 border border-red-100 rounded-md px-3 py-2">
              {error}
            </div>
          )}

          {/* Loading skeleton */}
          {loading && (
            <div className="mt-4">
              <LoadingSkeleton />
            </div>
          )}

          {/* Results: dimension chips + highest priority callout */}
          {!loading && ds && (
            <div className="mt-4 space-y-3">
              <div className="flex flex-wrap gap-4">
                <ProgramDimensionChip label="Structure" value={ds.structure} />
                <ProgramDimensionChip label="Frequency" value={ds.frequency} />
                <ProgramDimensionChip label="Recovery" value={ds.recovery} />
                {result && (
                  <div className="flex flex-col items-center gap-0.5 min-w-[60px]">
                    <span className="text-[10px] text-gray-400 uppercase tracking-wider">Blueprints</span>
                    <span className="text-xs px-2 py-0.5 rounded-full bg-gray-50 text-gray-500 whitespace-nowrap">
                      {result.distinctBlueprintsAudited}
                    </span>
                  </div>
                )}
              </div>

              {topRec && topRec.priority !== "low" && (
                <TopRecCallout recommendation={topRec} />
              )}

              {result && !topRec && (
                <div className="flex items-center gap-2 py-1 text-xs text-gray-400">
                  <span className="w-4 h-4 flex items-center justify-center rounded-full bg-gray-100 text-gray-500 text-[10px]">✓</span>
                  No significant issues — this program looks well-structured.
                </div>
              )}
            </div>
          )}
        </div>

        {/* ── Coaching Recommendations ──────────────────────────────────────── */}
        {result && expanded && !loading && (
          <div id="pil-section-recommendations" className="border-t border-gray-100 bg-white px-5 py-4">
            <p className="text-[10px] font-medium text-gray-400 uppercase tracking-widest mb-3">
              Coaching Recommendations
            </p>
            <CoachingRecommendationsPanel
              result={result.recommendations}
              onSubstituteRequest={openSubstitutes}
              onHighlightMuscle={handleHighlightMuscle}
              onViewEvidence={handleViewEvidence}
            />
          </div>
        )}

        {/* ── Per-Muscle Weekly Brief ───────────────────────────────────────── */}
        {result && expanded && !loading && (
          <div id="pil-section-brief" className="border-t border-gray-100 bg-white px-5 py-4">
            <p className="text-[10px] font-medium text-gray-400 uppercase tracking-widest mb-3">
              Weekly Volume & Recovery
            </p>
            <PerMuscleWeeklyBrief
              data={result.perMuscleWeeklyBrief}
              highlightedMuscle={highlightedMuscle}
            />
          </div>
        )}

        {/* ── Supporting Evidence ───────────────────────────────────────────── */}
        {result && expanded && !loading && actionableFindings.length > 0 && (
          <div id="pil-section-findings" className="border-t border-gray-100 bg-white px-5 py-4">
            <p className="text-[10px] font-medium text-gray-400 uppercase tracking-widest mb-3">
              Supporting Evidence
              <span className="ml-1.5 text-gray-300 font-normal">({actionableFindings.length})</span>
            </p>
            <div className="space-y-2">
              {actionableFindings.map((f) => (
                <PilFindingCard key={f.id} finding={f} />
              ))}
            </div>
          </div>
        )}

        {/* ── Collapse/expand + rerun timestamp ─────────────────────────────── */}
        {result && !loading && (
          <div className="border-t border-gray-50 bg-gray-50/50 px-5 py-2 flex items-center justify-between">
            <span className="text-[10px] text-gray-300">
              {runCount > 1 ? `Run ${runCount}` : ""}
            </span>
            <button
              onClick={() => setExpanded((x) => !x)}
              className="text-[11px] text-gray-400 hover:text-gray-700 transition-colors"
            >
              {expanded ? "Collapse" : "Show details"}
            </button>
          </div>
        )}
      </div>

      <SubstitutionDrawer
        open={drawerOpen}
        exerciseName={drawerExerciseName}
        candidates={drawerCandidates}
        loading={drawerLoading}
        onClose={() => setDrawerOpen(false)}
      />
    </>
  );
}
