"use client";

import { useEffect, useRef, useState } from "react";
import type { SubstitutionCandidate } from "@/lib/pil/types";
import { Badge } from "@/components/ui";

// ─── Relation type labels ──────────────────────────────────────────────────────

const RELATION_LABELS: Record<string, string> = {
  substitute:  "Substitute",
  regression:  "Regression",
  progression: "Progression",
  variation:   "Variation",
};

// Relation type is a descriptive tag, not a severity concept — the
// retired blue (regression) / purple (progression) hues collapse to
// the same neutral pill already used for substitute/variation, per
// the design system's single-accent convention (Badge's neutral tone).

const MUSCLE_LABELS: Record<string, string> = {
  chest: "Chest", lats: "Lats", upper_back: "Upper Back",
  shoulders: "Shoulders", front_delts: "Front Delts", side_delts: "Side Delts",
  rear_delts: "Rear Delts", biceps: "Biceps", triceps: "Triceps",
  forearms: "Forearms", quadriceps: "Quads", hamstrings: "Hamstrings",
  glutes: "Glutes", calves: "Calves", hip_flexors: "Hip Flexors",
  adductors: "Adductors", abductors: "Abductors", core: "Core",
  obliques: "Obliques", lower_back: "Lower Back", neck: "Neck", tibialis: "Tibialis",
};

const PATTERN_LABELS: Record<string, string> = {
  push_vertical: "Push Vertical", push_horizontal: "Push Horizontal",
  pull_vertical: "Pull Vertical", pull_horizontal: "Pull Horizontal",
  hip_hinge: "Hip Hinge", squat_bilateral: "Bilateral Squat",
  squat_unilateral: "Unilateral Squat", lunge: "Lunge", carry: "Carry",
  rotation: "Rotation", anti_rotation: "Anti-Rotation", gait: "Gait",
  jump: "Jump", throw: "Throw", iso_hold: "Iso Hold",
  elbow_flexion: "Elbow Flexion", elbow_extension: "Elbow Extension",
  shoulder_abduction: "Shoulder Abduction", shoulder_adduction: "Shoulder Adduction",
  knee_flexion: "Knee Flexion", knee_extension: "Knee Extension",
  hip_extension: "Hip Extension", hip_flexion: "Hip Flexion",
  scapular_retraction: "Scapular Retraction", scapular_depression: "Scapular Depression",
  external_rotation: "External Rotation", internal_rotation: "Internal Rotation",
};

// ─── SimilarityMeter ──────────────────────────────────────────────────────────

function SimilarityMeter({ score }: { score: number }) {
  const color = score === 100 ? "bg-white/70" : score >= 50 ? "bg-white/40" : "bg-white/20";
  return (
    <div className="flex items-center gap-1.5">
      <div className="w-12 h-1 bg-white/[0.08] rounded-full overflow-hidden">
        <div
          className={`h-full rounded-full ${color} transition-all`}
          style={{ width: `${score}%` }}
        />
      </div>
      <span className="text-[10px] text-white/40 tabular-nums">{score}% match</span>
    </div>
  );
}

// ─── CandidateRow ─────────────────────────────────────────────────────────────

function CandidateRow({
  candidate,
  onSwap,
}: {
  candidate: SubstitutionCandidate;
  onSwap?: (candidateId: string) => void;
}) {
  return (
    <div className="flex items-start justify-between gap-3 py-3.5 border-b border-white/[0.06] last:border-0">
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 mb-1">
          <span className="text-sm font-medium text-white/70 truncate">
            {candidate.exerciseName}
          </span>
          <Badge tone="dark" variant="neutral" size="sm">
            {RELATION_LABELS[candidate.relationType] ?? candidate.relationType}
          </Badge>
        </div>
        <div className="flex flex-wrap gap-x-3 gap-y-0.5 text-[11px] text-white/40 mb-1.5">
          {candidate.primaryMuscleGroup && (
            <span>{MUSCLE_LABELS[candidate.primaryMuscleGroup] ?? candidate.primaryMuscleGroup}</span>
          )}
          <span>{PATTERN_LABELS[candidate.movementPattern] ?? candidate.movementPattern}</span>
          {candidate.suitabilityScore !== null && (
            <span>Suitability {candidate.suitabilityScore}/100</span>
          )}
        </div>
        <SimilarityMeter score={candidate.similarityScore} />
      </div>

      {onSwap && (
        <button
          onClick={() => onSwap(candidate.exerciseId)}
          className="shrink-0 mt-0.5 text-xs text-white/40 hover:text-white/70 border border-white/[0.08] hover:border-white/[0.14] rounded px-2.5 py-1 transition-colors"
        >
          Swap
        </button>
      )}
    </div>
  );
}

// ─── Loading skeleton ─────────────────────────────────────────────────────────

function DrawerSkeleton() {
  return (
    <div className="space-y-4 animate-pulse">
      {[1, 2, 3].map((i) => (
        <div key={i} className="py-3 border-b border-white/[0.06]">
          <div className="flex gap-2 mb-2">
            <div className="h-4 w-32 bg-white/[0.06] rounded" />
            <div className="h-4 w-16 bg-white/[0.06] rounded" />
          </div>
          <div className="h-3 w-24 bg-white/[0.06] rounded mb-2" />
          <div className="h-1.5 w-16 bg-white/[0.06] rounded-full" />
        </div>
      ))}
    </div>
  );
}

// ─── Main drawer ──────────────────────────────────────────────────────────────

interface Props {
  open: boolean;
  exerciseName: string;
  candidates: SubstitutionCandidate[];
  loading?: boolean;
  onClose: () => void;
  onSwap?: (candidateExerciseId: string) => void;
}

export default function SubstitutionDrawer({
  open,
  exerciseName,
  candidates,
  loading,
  onClose,
  onSwap,
}: Props) {
  const [visible, setVisible] = useState(false);
  const [mounted, setMounted] = useState(false);

  // Mount before animating in; unmount after animating out
  useEffect(() => {
    if (open) {
      setMounted(true);
      // Give the DOM a frame to paint before triggering the transition
      requestAnimationFrame(() => {
        requestAnimationFrame(() => setVisible(true));
      });
    } else {
      setVisible(false);
      const timer = setTimeout(() => setMounted(false), 300);
      return () => clearTimeout(timer);
    }
  }, [open]);

  // Close on Escape
  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [open, onClose]);

  // Lock body scroll when open
  useEffect(() => {
    document.body.style.overflow = open ? "hidden" : "";
    return () => { document.body.style.overflow = ""; };
  }, [open]);

  if (!mounted) return null;

  return (
    <>
      {/* Backdrop */}
      <div
        className={`fixed inset-0 bg-black/70 z-40 transition-opacity duration-300 ${
          visible ? "opacity-100" : "opacity-0"
        }`}
        onClick={onClose}
        aria-hidden
      />

      {/* Slide-over panel */}
      <div
        role="dialog"
        aria-modal="true"
        aria-label={`Substitutes for ${exerciseName}`}
        className={`fixed right-0 top-0 h-full w-full max-w-sm bg-[var(--surface)] z-50 shadow-modal flex flex-col
          transition-transform duration-300 ease-out
          ${visible ? "translate-x-0" : "translate-x-full"}`}
      >
        {/* Header */}
        <div className="flex items-start justify-between px-5 py-4 border-b border-white/[0.08]">
          <div>
            <p className="text-[10px] font-semibold text-white/40 uppercase tracking-[0.3em] mb-0.5">
              Find Substitute
            </p>
            <h2 className="text-sm font-semibold text-white/70 leading-tight">
              {exerciseName}
            </h2>
          </div>
          <button
            onClick={onClose}
            className="mt-0.5 w-7 h-7 flex items-center justify-center rounded-full text-white/40 hover:text-white/70 hover:bg-white/[0.06] transition-colors"
            aria-label="Close"
          >
            <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
              <path d="M1 1l10 10M11 1L1 11" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
            </svg>
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-5 py-3">
          {loading && <DrawerSkeleton />}

          {!loading && candidates.length === 0 && (
            <div className="py-12 text-center">
              <p className="text-sm text-white/40">No substitutes found</p>
              <p className="text-xs text-white/25 mt-1">Add exercise relations in the Exercise Library to populate this list.</p>
            </div>
          )}

          {!loading && candidates.length > 0 && (
            <div>
              {candidates.map((c) => (
                <CandidateRow key={c.exerciseId} candidate={c} onSwap={onSwap} />
              ))}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-5 py-3 border-t border-white/[0.08]">
          <p className="text-[10px] text-white/25">
            Ranked by suitability · {candidates.length} result{candidates.length !== 1 ? "s" : ""}
          </p>
        </div>
      </div>
    </>
  );
}
