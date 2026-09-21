// ─────────────────────────────────────────────────────────────
// Catalyst OS — PIL Exercise Redundancy Analysis (M07)
//
// Pure function — no database calls.
// Answers: "How concentrated is this session's primary work in one
// coarse stimulus — the SAME movement pattern AND primary muscle group —
// and are any exercises literally duplicated?"
//
// The stimulus key `movementPattern + primaryMuscleGroup` is a COARSE
// proxy, not a claim that exercises sharing it are biomechanically
// identical. It is deliberately the only similarity signal used: there is
// no exercise-family field, and relations are too sparse to derive one.
// So all copy below says "overlap"/"concentration", never "identical".
//
// Finding codes:
//   REDUNDANCY_PATTERN_MUSCLE   2+ primary-work exercises share a stimulus
//                               key. Severity scales with MAGNITUDE (how
//                               many, and what share of the session's
//                               primary work) and is adjusted by CONTEXT
//                               (an explicitly prioritized muscle or a day
//                               narrowly built around that muscle lowers
//                               it; a day targeting several muscles raises
//                               a moderate concentration). Always a
//                               heuristic; never an error/blocker.
//   REDUNDANCY_EXACT_DUPLICATE  the very same exercise appears more than
//                               once in the session's primary work
//                               (certain).
//
// Only main-lift/accessory (primary) work is analysed: warmups,
// activation, finishers, conditioning and cooldowns are not part of the
// concentration question. Exercises with a null primaryMuscleGroup are
// excluded from key detection but counted in unknownCount.
//
// Magnitude tiers (n = exercises sharing the key, P = primary-work
// exercises with a known primary muscle):
//   high      n >= 3 and n/P >= 0.6     -> "warning"   (e.g. 4 of 4, 3 of 5)
//   moderate  n >= 3 and n/P >= 0.4, or n == 2 and n/P >= 0.5
//                                        -> "caution"   (e.g. 2 of 3, 3 of 7)
//   low       anything else with n >= 2 -> "info"      (e.g. 2 of 8)
// Chosen so a session that is mostly one stimulus stands out from an
// ordinary pair (RDL + a second hinge on a posterior-chain day) without
// pretending to know the coach's intent.
// ─────────────────────────────────────────────────────────────

import { randomUUID } from "crypto";
import type {
  EnrichedBlueprint,
  MuscleGroup,
  MovementPattern,
  PilFinding,
  PilSeverity,
  RedundancyAnalysis,
  WorkoutSectionType,
} from "../types";

// Sections whose exercises count as the session's "primary work".
const PRIMARY_WORK_SECTIONS: ReadonlySet<WorkoutSectionType> = new Set(["main_lift", "accessory"]);

export type ConcentrationTier = "high" | "moderate" | "low";

export function classifyConcentration(n: number, primaryCount: number): ConcentrationTier {
  const share = primaryCount > 0 ? n / primaryCount : 0;
  if (n >= 3 && share >= 0.6) return "high";
  if ((n >= 3 && share >= 0.4) || (n === 2 && share >= 0.5)) return "moderate";
  return "low";
}

export interface RedundancyContext {
  /** Muscles the brief explicitly prioritizes (musclePriorities). */
  specializedMuscles?: readonly MuscleGroup[];
  /** Muscles this day was built around (its declared focus). */
  dayTargetMuscles?: readonly MuscleGroup[];
}

export type ConcentrationAdjustment = "specialization" | "multi_target" | null;

const TIER_SEVERITY: Record<ConcentrationTier, PilSeverity> = { high: "warning", moderate: "caution", low: "info" };
const LOWER: Record<PilSeverity, PilSeverity> = { error: "warning", warning: "caution", caution: "info", info: "info" };

// Context can lower a concentration (explicit specialization) or raise a
// moderate one (a day that targets several muscles should not be
// dominated by a single stimulus). It never produces an error.
export function contextualConcentrationSeverity(
  tier: ConcentrationTier,
  muscle: MuscleGroup,
  context: RedundancyContext | undefined,
): { severity: PilSeverity; adjustment: ConcentrationAdjustment } {
  const base = TIER_SEVERITY[tier];
  const targets = context?.dayTargetMuscles ?? [];
  const specialized =
    (context?.specializedMuscles ?? []).includes(muscle) || (targets.length === 1 && targets[0] === muscle);
  if (specialized) return { severity: LOWER[base], adjustment: "specialization" };
  if (tier === "moderate" && targets.length >= 2 && targets.includes(muscle)) {
    return { severity: "warning", adjustment: "multi_target" };
  }
  return { severity: base, adjustment: null };
}

export function analyzeRedundancy(blueprint: EnrichedBlueprint, context?: RedundancyContext): RedundancyAnalysis {
  const prescriptions = blueprint.prescriptions.filter(
    (p) => p.exercise && (p.sectionType === null || PRIMARY_WORK_SECTIONS.has(p.sectionType)),
  );

  const groupMap = new Map<
    string,
    {
      movementPattern: MovementPattern;
      primaryMuscleGroup: MuscleGroup;
      exercises: Array<{
        id: string;
        name: string;
        sets: number | null;
        sectionType: WorkoutSectionType | null;
      }>;
    }
  >();

  let unknownCount = 0;
  let primaryCount = 0;

  for (const p of prescriptions) {
    if (!p.exercise) continue;
    if (!p.exercise.primaryMuscleGroup) {
      unknownCount++;
      continue;
    }
    primaryCount++;

    const key = `${p.exercise.movementPattern}::${p.exercise.primaryMuscleGroup}`;
    if (!groupMap.has(key)) {
      groupMap.set(key, {
        movementPattern: p.exercise.movementPattern,
        primaryMuscleGroup: p.exercise.primaryMuscleGroup,
        exercises: [],
      });
    }
    groupMap.get(key)!.exercises.push({
      id: p.exerciseId,
      name: p.exercise.name,
      sets: p.sets,
      sectionType: p.sectionType,
    });
  }

  const redundantGroups: RedundancyAnalysis["redundantGroups"] = [];
  const findings: PilFinding[] = [];

  for (const group of groupMap.values()) {
    if (group.exercises.length < 2) continue;

    const totalSets = group.exercises.reduce((sum, e) => sum + (e.sets ?? 0), 0);
    redundantGroups.push({ ...group, totalSets });

    const n = group.exercises.length;
    const tier = classifyConcentration(n, primaryCount);
    const { severity, adjustment } = contextualConcentrationSeverity(tier, group.primaryMuscleGroup, context);

    const exerciseList = group.exercises
      .map((e) => `${e.name}${e.sets !== null ? ` (${e.sets} sets)` : ""}`)
      .join(", ");
    const pattern = group.movementPattern.replace(/_/g, " ");
    const muscle = group.primaryMuscleGroup.replace(/_/g, " ");
    const contextNote =
      adjustment === "specialization"
        ? " Severity is reduced because this muscle is prioritized or the day is built around it."
        : adjustment === "multi_target"
          ? " Severity is raised because this day targets several muscles."
          : "";

    findings.push({
      id: randomUUID(),
      code: "REDUNDANCY_PATTERN_MUSCLE",
      category: "redundancy",
      severity,
      confidence: "heuristic",
      title: `Concentrated ${pattern} / ${muscle} work — ${n} of ${primaryCount} primary exercises`,
      explanation: `${n} of this session's ${primaryCount} primary exercises share the ${pattern} pattern with ${muscle} as primary muscle: ${exerciseList}. This is a coarse overlap signal — the exercises are not necessarily identical, and concentration may be intentional (specialization, progression).${contextNote} Confirm each serves a distinct purpose.`,
      evidence: [
        { label: "Movement pattern", value: group.movementPattern },
        { label: "Primary muscle", value: group.primaryMuscleGroup },
        { label: "Exercises sharing this key", value: n },
        { label: "Primary-work exercises", value: primaryCount },
        { label: "Share", value: `${Math.round((n / primaryCount) * 100)}%` },
        { label: "Total sets", value: totalSets },
      ],
      affectedEntities: group.exercises.map((e) => ({
        type: "exercise" as const,
        id: e.id,
        name: e.name,
      })),
    });
  }

  // Exact duplicates within the session's primary work.
  const byExercise = new Map<string, { name: string; count: number }>();
  for (const p of prescriptions) {
    if (!p.exercise) continue;
    const entry = byExercise.get(p.exerciseId) ?? { name: p.exercise.name, count: 0 };
    entry.count++;
    byExercise.set(p.exerciseId, entry);
  }
  for (const [id, entry] of byExercise) {
    if (entry.count < 2) continue;
    findings.push({
      id: randomUUID(),
      code: "REDUNDANCY_EXACT_DUPLICATE",
      category: "redundancy",
      severity: "caution",
      confidence: "certain",
      title: `"${entry.name}" appears ${entry.count} times in this session's primary work`,
      explanation: `The same exercise is prescribed ${entry.count} times among this session's primary exercises. That can be deliberate (separate top and back-off work), but is often an accidental repeat.`,
      evidence: [
        { label: "Exercise", value: entry.name },
        { label: "Occurrences", value: entry.count },
      ],
      affectedEntities: [{ type: "exercise" as const, id, name: entry.name }],
    });
  }

  return { redundantGroups, unknownCount, findings };
}
