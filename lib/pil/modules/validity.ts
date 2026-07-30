// ─────────────────────────────────────────────────────────────
// Catalyst OS — PIL Prescription Validity (M01)
//
// Pure function — no database calls. Receives EnrichedBlueprint,
// returns ValidationResult with typed PilFinding[].
//
// All findings are severity='error' and confidence='certain'.
// These are hard violations that block Blueprint publication.
//
// Finding codes:
//   VALIDITY_REPS_INVERTED      repsMin > repsMax
//   VALIDITY_EXERCISE_INACTIVE  Exercise status is not 'active' (archived, draft, or deleted)
//   VALIDITY_RPE_EXCEEDS_MAX    targetRpe > 10
//   VALIDITY_GROUP_SINGLE       A groupId references only one prescription
//   VALIDITY_GROUP_POSITION_GAP groupPositions within a groupId are non-sequential
//   VALIDITY_DUPLICATE_ORDER    Two prescriptions share orderIndex within the same section
//   VALIDITY_ORPHANED_SECTION   Prescription references a sectionId not in blueprint.sections
//   VALIDITY_NO_PRESCRIPTIONS   Blueprint has zero prescriptions (warning, not error)
// ─────────────────────────────────────────────────────────────

import { randomUUID } from "crypto";
import type {
  EnrichedBlueprint,
  EnrichedPrescription,
  PilFinding,
  ValidationResult,
} from "../types";

// ─── Finding factories ────────────────────────────────────────────────────────

function finding(
  code: string,
  title: string,
  explanation: string,
  affectedId: string,
  affectedName: string,
): PilFinding {
  return {
    id: randomUUID(),
    code,
    category: "validity",
    severity: "error",
    confidence: "certain",
    title,
    explanation,
    evidence: [],
    affectedEntities: [{ type: "exercise", id: affectedId, name: affectedName }],
  };
}

function warning(
  code: string,
  title: string,
  explanation: string,
): PilFinding {
  return {
    id: randomUUID(),
    code,
    category: "validity",
    severity: "warning",
    confidence: "certain",
    title,
    explanation,
    evidence: [],
    affectedEntities: [],
  };
}

// ─── Individual checks ────────────────────────────────────────────────────────

function checkRepsInverted(prescriptions: EnrichedPrescription[]): PilFinding[] {
  return prescriptions
    .filter(
      (p) =>
        p.repsMin !== null &&
        p.repsMax !== null &&
        p.repsMin > p.repsMax,
    )
    .map((p) =>
      finding(
        "VALIDITY_REPS_INVERTED",
        "Rep range is inverted",
        `Minimum reps (${p.repsMin}) is greater than maximum reps (${p.repsMax}). Swap the values.`,
        p.exerciseId,
        p.exercise?.name ?? p.exerciseId,
      ),
    );
}

function checkInactiveExercises(prescriptions: EnrichedPrescription[]): PilFinding[] {
  return prescriptions
    .filter((p) => p.missing || (p.exercise && p.exercise.status !== "active"))
    .map((p) => {
      const status = p.missing ? "deleted" : p.exercise?.status ?? "unknown";
      return finding(
        "VALIDITY_EXERCISE_INACTIVE",
        `Exercise is ${status}`,
        p.missing
          ? `This prescription references an exercise that no longer exists in the library. Remove it or replace it with an active exercise.`
          : `"${p.exercise?.name}" has status "${status}". Only active exercises can be published in a Blueprint.`,
        p.exerciseId,
        p.exercise?.name ?? p.exerciseId,
      );
    });
}

function checkRpeExceedsMax(prescriptions: EnrichedPrescription[]): PilFinding[] {
  return prescriptions
    .filter((p) => p.targetRpe !== null && p.targetRpe > 10)
    .map((p) =>
      finding(
        "VALIDITY_RPE_EXCEEDS_MAX",
        "RPE exceeds maximum",
        `Target RPE of ${p.targetRpe} exceeds the maximum of 10.`,
        p.exerciseId,
        p.exercise?.name ?? p.exerciseId,
      ),
    );
}

function checkGroupSingle(prescriptions: EnrichedPrescription[]): PilFinding[] {
  const groupMap = new Map<string, EnrichedPrescription[]>();
  for (const p of prescriptions) {
    if (p.groupId) {
      const members = groupMap.get(p.groupId) ?? [];
      members.push(p);
      groupMap.set(p.groupId, members);
    }
  }

  const findings: PilFinding[] = [];
  for (const [groupId, members] of groupMap) {
    if (members.length < 2) {
      const p = members[0];
      findings.push(
        finding(
          "VALIDITY_GROUP_SINGLE",
          "Superset group has only one exercise",
          `Group ${groupId.slice(0, 8)}… contains only one exercise. Supersets require at least two exercises.`,
          p.exerciseId,
          p.exercise?.name ?? p.exerciseId,
        ),
      );
    }
  }
  return findings;
}

function checkGroupPositionGap(prescriptions: EnrichedPrescription[]): PilFinding[] {
  const groupMap = new Map<string, EnrichedPrescription[]>();
  for (const p of prescriptions) {
    if (p.groupId) {
      const members = groupMap.get(p.groupId) ?? [];
      members.push(p);
      groupMap.set(p.groupId, members);
    }
  }

  const findings: PilFinding[] = [];
  for (const members of groupMap.values()) {
    const positions = members
      .map((m) => m.groupPosition)
      .filter((pos): pos is number => pos !== null)
      .sort((a, b) => a - b);

    if (positions.length === 0) continue;

    const expected = Array.from({ length: positions.length }, (_, i) => i + 1);
    const hasGap = positions.some((pos, i) => pos !== expected[i]);

    if (hasGap) {
      const p = members[0];
      findings.push(
        finding(
          "VALIDITY_GROUP_POSITION_GAP",
          "Superset group positions are non-sequential",
          `Group positions are [${positions.join(", ")}]. Expected [${expected.join(", ")}]. Renumber to sequential positions starting at 1.`,
          p.exerciseId,
          p.exercise?.name ?? p.exerciseId,
        ),
      );
    }
  }
  return findings;
}

function checkDuplicateOrder(
  prescriptions: EnrichedPrescription[],
): PilFinding[] {
  // Key: sectionId (null for unsectioned) → Set of seen orderIndexes
  const seen = new Map<string | null, Map<number, EnrichedPrescription>>();
  const findings: PilFinding[] = [];

  for (const p of prescriptions) {
    const key = p.sectionId;
    if (!seen.has(key)) seen.set(key, new Map());
    const sectionSeen = seen.get(key)!;

    if (sectionSeen.has(p.orderIndex)) {
      const first = sectionSeen.get(p.orderIndex)!;
      findings.push(
        finding(
          "VALIDITY_DUPLICATE_ORDER",
          "Duplicate exercise position",
          `"${p.exercise?.name ?? p.exerciseId}" and "${first.exercise?.name ?? first.exerciseId}" share position ${p.orderIndex} in the same section. Each position must be unique.`,
          p.exerciseId,
          p.exercise?.name ?? p.exerciseId,
        ),
      );
    } else {
      sectionSeen.set(p.orderIndex, p);
    }
  }
  return findings;
}

function checkOrphanedSections(
  prescriptions: EnrichedPrescription[],
  sectionIds: Set<string>,
): PilFinding[] {
  return prescriptions
    .filter((p) => p.sectionId !== null && !sectionIds.has(p.sectionId))
    .map((p) =>
      finding(
        "VALIDITY_ORPHANED_SECTION",
        "Exercise references a missing section",
        `This exercise is assigned to section ${p.sectionId?.slice(0, 8)}… which does not exist in this Blueprint.`,
        p.exerciseId,
        p.exercise?.name ?? p.exerciseId,
      ),
    );
}

function checkNoPrescriptions(prescriptions: EnrichedPrescription[]): PilFinding[] {
  if (prescriptions.length === 0) {
    return [
      warning(
        "VALIDITY_NO_PRESCRIPTIONS",
        "Blueprint has no exercises",
        "Add at least one exercise before publishing this Blueprint.",
      ),
    ];
  }
  return [];
}

// ─── Main export ──────────────────────────────────────────────────────────────

export function validatePrescriptions(
  blueprint: EnrichedBlueprint,
): ValidationResult {
  const { prescriptions, sections } = blueprint;
  const sectionIds = new Set(sections.map((s) => s.id));

  const allFindings: PilFinding[] = [
    ...checkRepsInverted(prescriptions),
    ...checkInactiveExercises(prescriptions),
    ...checkRpeExceedsMax(prescriptions),
    ...checkGroupSingle(prescriptions),
    ...checkGroupPositionGap(prescriptions),
    ...checkDuplicateOrder(prescriptions),
    ...checkOrphanedSections(prescriptions, sectionIds),
    ...checkNoPrescriptions(prescriptions),
  ];

  const errors = allFindings.filter((f) => f.severity === "error");
  const warnings = allFindings.filter((f) => f.severity === "warning");

  return {
    valid: errors.length === 0,
    errors,
    warnings,
  };
}
