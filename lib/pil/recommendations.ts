// ─────────────────────────────────────────────────────────────
// Catalyst OS — PIL Coaching Recommendation Engine (M33)
//
// Pure function — no database calls, no randomness except UUID.
// Consumes the flat allFindings array from any audit orchestrator
// and produces a prioritized set of coaching recommendations.
//
// Architecture:
//   18 deterministic rules → apply all → suppress → sort → cap → group
//
// Rules are ordered critical → low. Within the same priority,
// certain confidence ranks above heuristic.
//
// Suppression:
//   Validity errors disable all non-validity recommendations.
//   A coach cannot trust volume/fatigue/movement analysis when
//   the underlying prescriptions contain structural errors.
//
// Cap: maximum 8 recommendations surfaced per audit run.
// Low-priority recommendations are dropped first when the cap is hit.
// ─────────────────────────────────────────────────────────────

import { randomUUID } from "crypto";
import type {
  CoachingRecommendation,
  CoachingRecommendationResult,
  PilConfidence,
  PilFinding,
  RecommendationCategory,
  RecommendationPriority,
} from "./types";

const MAX_RECOMMENDATIONS = 8;

const PRIORITY_RANK: Record<RecommendationPriority, number> = {
  critical: 0,
  high: 1,
  medium: 2,
  low: 3,
};

const CONFIDENCE_RANK: Record<PilConfidence, number> = {
  certain: 0,
  heuristic: 1,
  incomplete_data: 2,
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

function fmt(id: string): string {
  return id.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

function dedupeById<T extends { id: string }>(items: T[]): T[] {
  const seen = new Set<string>();
  return items.filter((item) => {
    if (seen.has(item.id)) return false;
    seen.add(item.id);
    return true;
  });
}

interface RecOpts {
  muscles?: string[];
  substitutes?: Array<{ id: string; name: string }>;
}

function rec(
  priority: RecommendationPriority,
  category: RecommendationCategory,
  headline: string,
  rationale: string,
  codes: string[],
  confidence: PilConfidence,
  opts: RecOpts = {},
): CoachingRecommendation {
  return {
    id: randomUUID(),
    priority,
    category,
    headline,
    rationale,
    supportingFindingCodes: codes,
    confidence,
    affectedMuscleGroups: opts.muscles ?? [],
    substituteExercises: opts.substitutes ?? [],
  };
}

// ─── Rule type ────────────────────────────────────────────────────────────────

type RuleFn = (findings: PilFinding[]) => CoachingRecommendation | null;

// ─── CRITICAL rules ───────────────────────────────────────────────────────────

const ruleValidityErrors: RuleFn = (findings) => {
  const errors = findings.filter((f) => f.category === "validity" && f.severity === "error");
  if (errors.length === 0) return null;
  const count = errors.length;
  const codes = [...new Set(errors.map((f) => f.code))];
  return rec(
    "critical",
    "session_design",
    `Fix ${count} prescription error${count > 1 ? "s" : ""} before relying on any quality analysis.`,
    "Inverted rep ranges, invalid RPE targets, and missing exercises produce unreliable training prescriptions. Volume, fatigue, and movement analysis cannot be trusted until these are resolved.",
    codes,
    "certain",
  );
};

const ruleStructureNoContent: RuleFn = (findings) => {
  const codes = ["PROGRAM_NO_WEEKS", "PROGRAM_ALL_REST"];
  const matching = findings.filter((f) => codes.includes(f.code));
  if (matching.length === 0) return null;
  return rec(
    "critical",
    "program_structure",
    "Add training content to the program before Program Intelligence can generate insights.",
    "The program has no defined weeks or all days are rest days. At least one week with an active blueprint is required for frequency, recovery, and volume analysis.",
    [...new Set(matching.map((f) => f.code))],
    "certain",
  );
};

const ruleStructureWeekGap: RuleFn = (findings) => {
  const gapFinding = findings.find((f) => f.code === "PROGRAM_WEEK_GAP");
  if (!gapFinding) return null;
  return rec(
    "critical",
    "program_structure",
    "Fix the gap in program week numbers — weeks must be sequential from week 1.",
    "Week numbers must form a contiguous sequence (1, 2, 3…). A missing week breaks frequency and recovery analysis across the program boundary.",
    ["PROGRAM_WEEK_GAP"],
    "certain",
  );
};

const ruleStructureArchivedBlueprint: RuleFn = (findings) => {
  const archived = findings.filter((f) => f.code === "PROGRAM_ARCHIVED_BLUEPRINT");
  if (archived.length === 0) return null;
  const count = archived.length;
  return rec(
    "critical",
    "program_structure",
    `Replace ${count} archived blueprint${count > 1 ? "s" : ""} with active ones before assigning this program.`,
    "Archived blueprints cannot be assigned to clients. Clients assigned to a program with archived days will have gaps in their programming.",
    ["PROGRAM_ARCHIVED_BLUEPRINT"],
    "certain",
  );
};

const ruleSameDayRecovery: RuleFn = (findings) => {
  const matches = findings.filter((f) => f.code === "RECOVERY_SAME_DAY");
  if (matches.length === 0) return null;
  const muscleIds = [...new Set(
    matches.map((f) => f.affectedEntities[0]?.id).filter(Boolean) as string[],
  )];
  const muscleNames = muscleIds.map(fmt);
  const muscleList = muscleNames.length <= 2 ? muscleNames.join(" and ") : `${muscleNames[0]} and ${muscleNames.length - 1} others`;
  return rec(
    "critical",
    "recovery",
    `${muscleList} ${muscleNames.length > 1 ? "are" : "is"} trained twice on the same calendar day — this must be corrected.`,
    "Two sessions target the same primary muscle group on the same day, leaving no recovery window between them. Move one session to a different day or merge the exercises into a single session.",
    ["RECOVERY_SAME_DAY"],
    "certain",
    { muscles: muscleIds },
  );
};

// ─── HIGH rules ───────────────────────────────────────────────────────────────

const ruleConsecutiveRecovery: RuleFn = (findings) => {
  const matches = findings.filter((f) => f.code === "RECOVERY_CONSECUTIVE");
  if (matches.length === 0) return null;
  const muscleIds = [...new Set(
    matches.map((f) => f.affectedEntities[0]?.id).filter(Boolean) as string[],
  )];
  const muscleNames = muscleIds.map(fmt);
  const muscleList = muscleNames.length === 1
    ? muscleNames[0]
    : muscleNames.length === 2
    ? muscleNames.join(" and ")
    : `${muscleNames[0]} and ${muscleNames.length - 1} others`;
  return rec(
    "high",
    "recovery",
    `Add at least one full rest day between ${muscleList} training sessions.`,
    "Back-to-back sessions targeting the same muscle group limit muscle protein synthesis and structural recovery. Most evidence supports a minimum of 48 hours between sessions for the same primary muscle.",
    ["RECOVERY_CONSECUTIVE"],
    "heuristic",
    { muscles: muscleIds },
  );
};

const ruleFatigueHigh: RuleFn = (findings) => {
  const accumulation = findings.find((f) => f.code === "FATIGUE_ACCUMULATION");
  if (!accumulation) return null;
  return rec(
    "high",
    "session_design",
    "Reduce overall session fatigue load — cumulative fatigue exceeds the recommended recovery threshold.",
    "Total fatigue score is high. Sessions with sustained high fatigue scores are associated with greater accumulated systemic stress and longer recovery requirements. Consider removing high-cost exercises or distributing them across additional sessions.",
    ["FATIGUE_ACCUMULATION"],
    "heuristic",
  );
};

const ruleJointExtreme: RuleFn = (findings) => {
  const matches = findings.filter((f) => f.code === "JOINT_STRESS_EXTREME_EXERCISE");
  if (matches.length === 0) return null;
  const joints = [...new Set(
    matches
      .flatMap((f) => f.affectedEntities)
      .filter((e) => e.type === "joint")
      .map((e) => fmt(e.id)),
  )];
  const exercises = dedupeById(
    matches
      .flatMap((f) => f.affectedEntities)
      .filter((e) => e.type === "exercise")
      .map((e) => ({ id: e.id, name: e.name })),
  );
  const jointText = joints.length === 0 ? "joint" : joints.join(" and ");
  return rec(
    "high",
    "joint_stress",
    `Review or substitute exercises placing extreme stress on the ${jointText}.`,
    "One or more exercises score at the extreme end of the joint stress scale. At high volumes or frequencies, these exercises carry elevated structural loading that may limit long-term training capacity.",
    ["JOINT_STRESS_EXTREME_EXERCISE"],
    "certain",
    { substitutes: exercises },
  );
};

const ruleJointCumulative: RuleFn = (findings) => {
  const matches = findings.filter((f) => f.code === "JOINT_STRESS_HIGH_CUMULATIVE");
  if (matches.length === 0) return null;
  const joints = [...new Set(
    matches
      .flatMap((f) => f.affectedEntities)
      .filter((e) => e.type === "joint")
      .map((e) => fmt(e.id)),
  )];
  const jointText = joints.length === 0 ? "a joint" : joints.join(" and ");
  return rec(
    "high",
    "joint_stress",
    `Distribute exercises to reduce cumulative ${jointText} loading across this session.`,
    "The total accumulated joint stress score for this session is high. Spreading joint-intensive exercises across separate training days reduces acute loading peaks and supports long-term structural health.",
    ["JOINT_STRESS_HIGH_CUMULATIVE"],
    "heuristic",
  );
};

const ruleFatigueAccumulationRising: RuleFn = (findings) => {
  const match = findings.find((f) => f.code === "FATIGUE_ACCUMULATION_RISING");
  if (!match) return null;
  return rec(
    "high",
    "session_design",
    "Schedule a deload — fatigue has risen for multiple consecutive weeks with no recovery break.",
    "Weekly fatigue score has increased every week across a multi-week span with no deload week in between. Sustained rising fatigue without a planned reduction is associated with diminishing performance and elevated injury risk.",
    ["FATIGUE_ACCUMULATION_RISING"],
    "heuristic",
  );
};

const ruleProgressionSpike: RuleFn = (findings) => {
  const matches = findings.filter((f) => f.code === "PROGRESSION_SPIKE");
  if (matches.length === 0) return null;
  const muscleIds = [...new Set(
    matches.map((f) => f.affectedEntities[0]?.id).filter(Boolean) as string[],
  )];
  const muscleNames = muscleIds.map(fmt);
  const muscleList = muscleNames.length === 1
    ? muscleNames[0]
    : `${muscleNames[0]} and ${muscleNames.length - 1} others`;
  return rec(
    "high",
    "progression",
    `Smooth out the volume jump for ${muscleList} — a single-week spike exceeds a safe progression rate.`,
    "A muscle group's direct set volume increased more than 20% in a single week. Gradual week-over-week increases give connective tissue and recovery capacity time to adapt; large jumps raise injury risk.",
    ["PROGRESSION_SPIKE"],
    "heuristic",
    { muscles: muscleIds },
  );
};

const ruleFrequencyHigh: RuleFn = (findings) => {
  const matches = findings.filter((f) => f.code === "FREQUENCY_HIGH");
  if (matches.length === 0) return null;
  const muscleIds = [...new Set(
    matches.map((f) => f.affectedEntities[0]?.id).filter(Boolean) as string[],
  )];
  const muscleNames = muscleIds.map(fmt);
  const muscleList = muscleNames.length === 1
    ? muscleNames[0]
    : muscleNames.slice(0, 2).join(" and ") + (muscleNames.length > 2 ? ` (and ${muscleNames.length - 2} more)` : "");
  const sessionText = matches[0]?.evidence.find((e) => e.label === "Sessions per week")?.value;
  const sessionSuffix = sessionText ? ` (${sessionText} sessions/week)` : "";
  return rec(
    "high",
    "recovery",
    `Reduce ${muscleList} training frequency${sessionSuffix} — this leaves insufficient recovery time.`,
    "Training the same muscle group five or more times per week compresses the recovery window between sessions. Adaptation occurs during recovery, not during the training stimulus itself.",
    ["FREQUENCY_HIGH"],
    "heuristic",
    { muscles: muscleIds },
  );
};

// ─── MEDIUM rules ─────────────────────────────────────────────────────────────

const ruleJointMultiple: RuleFn = (findings) => {
  const matches = findings.filter((f) => f.code === "JOINT_STRESS_MULTIPLE_HIGH");
  if (matches.length === 0) return null;
  const joints = [...new Set(
    matches
      .flatMap((f) => f.affectedEntities)
      .filter((e) => e.type === "joint")
      .map((e) => fmt(e.id)),
  )];
  const jointText = joints.length === 0 ? "joint" : joints.join(" and ");
  return rec(
    "medium",
    "joint_stress",
    `Space out high-stress exercises to reduce ${jointText} clustering within this session.`,
    "Multiple exercises in this session place significant stress on the same joint. While each exercise may be appropriate individually, combining them concentrates loading in a single training day.",
    ["JOINT_STRESS_MULTIPLE_HIGH"],
    "heuristic",
  );
};

const ruleMovementHorizontal: RuleFn = (findings) => {
  if (!findings.some((f) => f.code === "MOVEMENT_PUSH_PULL_H")) return null;
  return rec(
    "medium",
    "movement",
    "Increase horizontal pulling volume to balance the push-to-pull ratio.",
    "Horizontal push-to-pull imbalance is a common contributor to anterior shoulder tightness and postural changes over time. A 1:1 ratio or slight pull bias is generally recommended for long-term shoulder health.",
    ["MOVEMENT_PUSH_PULL_H"],
    "heuristic",
  );
};

const ruleMovementVertical: RuleFn = (findings) => {
  if (!findings.some((f) => f.code === "MOVEMENT_PUSH_PULL_V")) return null;
  return rec(
    "medium",
    "movement",
    "Add vertical pulling work to balance vertical pressing volume.",
    "Vertical pulling (pulldowns, pull-ups, chin-ups) balances the forces placed on the shoulder girdle by overhead pressing. Under-training vertical pulling relative to pressing can contribute to shoulder impingement over time.",
    ["MOVEMENT_PUSH_PULL_V"],
    "heuristic",
  );
};

const ruleVolumeHigh: RuleFn = (findings) => {
  const matches = findings.filter((f) => f.code === "VOLUME_HIGH_DIRECT");
  if (matches.length === 0) return null;
  const muscleIds = [...new Set(
    matches.map((f) => f.affectedEntities[0]?.id).filter(Boolean) as string[],
  )];
  const muscleNames = muscleIds.map(fmt);
  const muscleList = muscleNames.length === 1
    ? muscleNames[0]
    : muscleNames.length === 2
    ? muscleNames.join(" and ")
    : `${muscleNames[0]} (and ${muscleNames.length - 1} others)`;
  return rec(
    "medium",
    "volume",
    `Reduce direct ${muscleList} volume — current prescription may exceed the effective range.`,
    "Research consistently shows diminishing returns and increased injury risk above approximately 20 direct sets per week for most muscle groups. Reducing volume while maintaining intensity often preserves or improves results.",
    ["VOLUME_HIGH_DIRECT"],
    "heuristic",
    { muscles: muscleIds },
  );
};

const ruleVolumeOverreachedWeekly: RuleFn = (findings) => {
  const matches = findings.filter((f) => f.code === "VOLUME_MUSCLE_OVERREACHED_WEEKLY");
  if (matches.length === 0) return null;
  const muscleIds = [...new Set(
    matches.map((f) => f.affectedEntities[0]?.id).filter(Boolean) as string[],
  )];
  const muscleNames = muscleIds.map(fmt);
  const muscleList = muscleNames.length === 1
    ? muscleNames[0]
    : `${muscleNames[0]} (and ${muscleNames.length - 1} others)`;
  return rec(
    "medium",
    "volume",
    `Reconsider weekly ${muscleList} volume — the program average is at or above typical recoverable limits.`,
    "Average weekly direct volume for this muscle group sits at or above the range where most lifters see diminishing returns and higher recovery cost. This is a program-wide average, not a single session — the fix is usually spread across the week, not one day.",
    ["VOLUME_MUSCLE_OVERREACHED_WEEKLY"],
    "heuristic",
    { muscles: muscleIds },
  );
};

const ruleBalanceAgonistDominant: RuleFn = (findings) => {
  const matches = findings.filter((f) => f.code === "BALANCE_AGONIST_DOMINANT");
  if (matches.length === 0) return null;
  const muscleIds = [...new Set(matches.flatMap((f) => f.affectedEntities.map((e) => e.id)))];
  const muscleNames = muscleIds.map(fmt);
  return rec(
    "medium",
    "muscle_balance",
    `Add direct work for the under-trained side of ${muscleNames.slice(0, 2).join(" vs. ")}.`,
    "One muscle group in an agonist/antagonist pair is receiving more than three times the direct volume of its counterpart. Sustained imbalance between opposing muscle groups is a common contributor to postural and joint-stress issues over time.",
    ["BALANCE_AGONIST_DOMINANT"],
    "heuristic",
    { muscles: muscleIds },
  );
};

const ruleDurationVeryLong: RuleFn = (findings) => {
  const match = findings.find((f) => f.code === "DURATION_VERY_LONG");
  if (!match) return null;
  return rec(
    "medium",
    "session_design",
    "Split this session — estimated duration exceeds 2 hours.",
    "Sessions longer than 120 minutes show reduced training quality in later exercises due to accumulated fatigue, reduced motivation, and declining motor output. Dividing into two focused sessions preserves intensity throughout.",
    ["DURATION_VERY_LONG"],
    match.confidence,
  );
};

// ─── LOW rules ────────────────────────────────────────────────────────────────

const ruleRedundancy: RuleFn = (findings) => {
  const matches = findings.filter((f) => f.code === "REDUNDANCY_PATTERN_MUSCLE");
  if (matches.length === 0) return null;
  // Surface the second exercise in each redundant pair — these are substitution candidates
  const substitutes = dedupeById(
    matches
      .flatMap((f) => f.affectedEntities)
      .filter((e) => e.type === "exercise")
      .map((e) => ({ id: e.id, name: e.name })),
  ).slice(1); // keep all but the first (first is the "primary", rest are the redundant ones)
  return rec(
    "low",
    "session_design",
    "Review exercise overlap — similar exercises should each serve a distinct purpose.",
    "Multiple exercises share the same movement pattern and primary muscle group. Redundant exercises reduce training variety without adding stimulus diversity. Consider replacing one with a complementary movement pattern.",
    ["REDUNDANCY_PATTERN_MUSCLE"],
    "heuristic",
    { substitutes },
  );
};

const ruleDurationLong: RuleFn = (findings) => {
  // Only fires when DURATION_VERY_LONG is NOT present (otherwise the split recommendation covers this)
  const hasVeryLong = findings.some((f) => f.code === "DURATION_VERY_LONG");
  const match = findings.find((f) => f.code === "DURATION_LONG");
  if (!match || hasVeryLong) return null;
  return rec(
    "low",
    "session_design",
    "Consider trimming this session — estimated duration exceeds 90 minutes.",
    "Sessions over 90 minutes can be productive, but removing lower-priority accessory work often improves training density and focus without reducing stimulus to primary movements.",
    ["DURATION_LONG"],
    match.confidence,
  );
};

const ruleFrequencyZero: RuleFn = (findings) => {
  const matches = findings.filter((f) => f.code === "FREQUENCY_ZERO_MAJOR");
  if (matches.length === 0) return null;
  const muscleIds = [...new Set(
    matches.map((f) => f.affectedEntities[0]?.id).filter(Boolean) as string[],
  )];
  const muscleNames = muscleIds.map(fmt);
  const muscleList = muscleNames.length === 1
    ? muscleNames[0]
    : muscleNames.slice(0, 2).join(", ") + (muscleNames.length > 2 ? ` and ${muscleNames.length - 2} others` : "");
  return rec(
    "low",
    "volume",
    `Add direct training for ${muscleList} to ensure complete program coverage.`,
    "Major muscle groups with no direct training in a given week may require intentional explanation (deload, specialization block). If this is an oversight, adding even one session per week provides a meaningful stimulus.",
    ["FREQUENCY_ZERO_MAJOR"],
    "certain",
    { muscles: muscleIds },
  );
};

const ruleVolumeUndertrainedWeekly: RuleFn = (findings) => {
  const matches = findings.filter((f) => f.code === "VOLUME_MUSCLE_UNDERTRAINED_WEEKLY");
  if (matches.length === 0) return null;
  const muscleIds = [...new Set(
    matches.map((f) => f.affectedEntities[0]?.id).filter(Boolean) as string[],
  )];
  const muscleNames = muscleIds.map(fmt);
  const muscleList = muscleNames.length === 1
    ? muscleNames[0]
    : `${muscleNames.slice(0, 2).join(", ")}${muscleNames.length > 2 ? ` and ${muscleNames.length - 2} others` : ""}`;
  return rec(
    "low",
    "volume",
    `Consider adding direct volume for ${muscleList} — weekly average is below the general effective range.`,
    "This muscle group is trained directly, but the weekly average falls below the range commonly cited as a minimum effective dose. If growth or strength in this area matters to the client's goal, a modest increase may help.",
    ["VOLUME_MUSCLE_UNDERTRAINED_WEEKLY"],
    "heuristic",
    { muscles: muscleIds },
  );
};

const ruleProgressionNoIncrease: RuleFn = (findings) => {
  const matches = findings.filter((f) => f.code === "PROGRESSION_NO_INCREASE");
  if (matches.length === 0) return null;
  const muscleIds = [...new Set(
    matches.map((f) => f.affectedEntities[0]?.id).filter(Boolean) as string[],
  )];
  const muscleNames = muscleIds.map(fmt);
  const muscleList = muscleNames.length === 1
    ? muscleNames[0]
    : `${muscleNames.slice(0, 2).join(", ")}${muscleNames.length > 2 ? ` and ${muscleNames.length - 2} others` : ""}`;
  return rec(
    "low",
    "progression",
    `Plan a volume or intensity increase for ${muscleList} — weekly volume has held flat for several weeks.`,
    "Direct volume for this muscle group has not increased across the analyzed weeks. This may be an intentional maintenance block, but progressive overload generally requires periodic increases to continue driving adaptation.",
    ["PROGRESSION_NO_INCREASE"],
    "heuristic",
    { muscles: muscleIds },
  );
};

const ruleBalanceAntagonistZero: RuleFn = (findings) => {
  const matches = findings.filter((f) => f.code === "BALANCE_ANTAGONIST_ZERO");
  if (matches.length === 0) return null;
  const muscleIds = [...new Set(matches.flatMap((f) => f.affectedEntities.map((e) => e.id)))];
  const muscleNames = muscleIds.map(fmt);
  return rec(
    "low",
    "muscle_balance",
    `Confirm the missing side of ${muscleNames.slice(0, 2).join(" / ")} is intentional.`,
    "One side of an agonist/antagonist pair has meaningful direct volume while the other has none in this session. This is common in split programs where the opposing muscle is trained on a different day — worth a quick confirmation.",
    ["BALANCE_ANTAGONIST_ZERO"],
    "certain",
    { muscles: muscleIds },
  );
};

// ─── Rule registry ────────────────────────────────────────────────────────────
// Ordered critical → low. Within priority, more specific rules run first.

const RULES: RuleFn[] = [
  // Critical
  ruleValidityErrors,
  ruleStructureNoContent,
  ruleStructureWeekGap,
  ruleStructureArchivedBlueprint,
  ruleSameDayRecovery,
  // High
  ruleConsecutiveRecovery,
  ruleFatigueHigh,
  ruleFatigueAccumulationRising,
  ruleJointExtreme,
  ruleJointCumulative,
  ruleFrequencyHigh,
  ruleProgressionSpike,
  // Medium
  ruleJointMultiple,
  ruleMovementHorizontal,
  ruleMovementVertical,
  ruleVolumeHigh,
  ruleVolumeOverreachedWeekly,
  ruleBalanceAgonistDominant,
  ruleDurationVeryLong,
  // Low
  ruleRedundancy,
  ruleDurationLong,
  ruleFrequencyZero,
  ruleVolumeUndertrainedWeekly,
  ruleProgressionNoIncrease,
  ruleBalanceAntagonistZero,
];

// ─── Suppression ──────────────────────────────────────────────────────────────

function applySuppressions(
  recs: CoachingRecommendation[],
  findings: PilFinding[],
): CoachingRecommendation[] {
  const hasValidityError = findings.some((f) => f.category === "validity" && f.severity === "error");

  if (hasValidityError) {
    // Only keep the validity prescription error recommendation.
    // Blueprint analysis modules produce unreliable results when prescriptions
    // have structural errors — don't surface volume/fatigue/movement recommendations.
    return recs.filter((r) =>
      r.supportingFindingCodes.some((c) => c.startsWith("VALIDITY_")),
    );
  }

  return recs;
}

// ─── Sorting ──────────────────────────────────────────────────────────────────

function byPriorityAndConfidence(a: CoachingRecommendation, b: CoachingRecommendation): number {
  const priorityDiff = PRIORITY_RANK[a.priority] - PRIORITY_RANK[b.priority];
  if (priorityDiff !== 0) return priorityDiff;
  return CONFIDENCE_RANK[a.confidence] - CONFIDENCE_RANK[b.confidence];
}

// ─── Main export ──────────────────────────────────────────────────────────────

export function generateRecommendations(findings: PilFinding[]): CoachingRecommendationResult {
  // Apply all rules
  const raw = RULES.map((rule) => rule(findings)).filter(
    (r): r is CoachingRecommendation => r !== null,
  );

  // Apply suppression
  const suppressed = applySuppressions(raw, findings);

  // Sort and cap
  const sorted = suppressed.sort(byPriorityAndConfidence);
  const capped = sorted.slice(0, MAX_RECOMMENDATIONS);

  // Group by category
  const byCategory: Partial<Record<RecommendationCategory, CoachingRecommendation[]>> = {};
  for (const r of capped) {
    if (!byCategory[r.category]) byCategory[r.category] = [];
    byCategory[r.category]!.push(r);
  }

  return {
    highestPriority: capped[0] ?? null,
    recommendations: capped,
    byCategory,
    hasActionableRecommendations: capped.length > 0,
  };
}
