// Test helpers: minimal factories for EnrichedBlueprint and its parts.
// Only the fields under test need to be populated — the rest use safe defaults.

import type {
  EnrichedBlueprint,
  EnrichedExercise,
  EnrichedPrescription,
  EnrichedSection,
} from "../types";

export function makeExercise(
  overrides: Partial<EnrichedExercise> = {},
): EnrichedExercise {
  return {
    id: "ex-1",
    name: "Back Squat",
    slug: "back-squat",
    status: "active",
    scope: "system",
    movementPattern: "squat_bilateral",
    classification: "compound",
    difficulty: "intermediate",
    primaryMuscleGroup: "quadriceps",
    defaultBodyPosition: "standing",
    resistanceType: "barbell",
    unilateral: false,
    alternating: false,
    isTimeBased: false,
    isDistanceBased: false,
    isCardio: false,
    isMobility: false,
    fatigueCost: 8,
    technicalComplexity: 7,
    stabilityDemand: 6,
    jointStressShoulder: 2,
    jointStressElbow: 1,
    jointStressWrist: 2,
    jointStressSpine: 8,
    jointStressHip: 6,
    jointStressKnee: 7,
    jointStressAnkle: 4,
    lengthenedBias: 7,
    shortenedBias: 3,
    stretchMediatedPotential: 6,
    defaultPrescription: null,
    muscles: [],
    relations: [],
    contraindications: [],
    ...overrides,
  };
}

export function makeSection(
  overrides: Partial<EnrichedSection> = {},
): EnrichedSection {
  return {
    id: "section-1",
    name: "Main Lift",
    sectionType: "main_lift",
    estimatedMinutes: null,
    orderIndex: 0,
    notes: null,
    ...overrides,
  };
}

export function makePrescription(
  overrides: Partial<EnrichedPrescription> = {},
): EnrichedPrescription {
  return {
    id: "pte-1",
    exerciseId: "ex-1",
    exercise: makeExercise(),
    missing: false,
    effectivePrescription: null,
    sets: 3,
    repsMin: 6,
    repsMax: 8,
    durationSeconds: null,
    distanceMeters: null,
    restSeconds: 180,
    tempo: null,
    targetRpe: 8,
    targetRir: null,
    setTechnique: "straight_set",
    groupId: null,
    groupPosition: null,
    orderIndex: 0,
    isRequired: true,
    substitutionPolicy: null,
    coachNotes: null,
    sectionId: "section-1",
    sectionType: "main_lift",
    ...overrides,
  };
}

export function makeBlueprint(
  overrides: Partial<EnrichedBlueprint> & {
    prescriptions?: EnrichedPrescription[];
    sections?: EnrichedSection[];
  } = {},
): EnrichedBlueprint {
  const sections = overrides.sections ?? [makeSection()];
  const prescriptions = overrides.prescriptions ?? [makePrescription()];
  return {
    templateId: "tmpl-1",
    name: "Test Blueprint",
    description: null,
    objective: null,
    status: "active",
    sections,
    prescriptions,
    ...overrides,
  };
}
