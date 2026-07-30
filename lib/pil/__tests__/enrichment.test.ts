import { describe, it, expect } from "vitest";
import { assembleBlueprint } from "../enrichment";
import type { RawBlueprintData } from "../enrichment";

// ─── Raw data factories ───────────────────────────────────────────────────────

function rawTemplate(overrides: Partial<RawBlueprintData["template"]> = {}): RawBlueprintData["template"] {
  return {
    id: "tmpl-1",
    name: "Test Blueprint",
    description: null,
    objective: null,
    status: "active",
    ...overrides,
  };
}

function rawSection(overrides: Partial<{
  id: string;
  name: string;
  sectionType: string;
  orderIndex: number;
  estimatedMinutes: number | null;
  notes: string | null;
}> = {}) {
  return {
    id: "sec-1",
    name: "Main Lift",
    sectionType: "main_lift",
    orderIndex: 0,
    estimatedMinutes: null,
    notes: null,
    ...overrides,
  };
}

function rawPrescription(overrides: Partial<{
  id: string;
  exerciseId: string;
  sectionId: string | null;
  orderIndex: number;
  groupId: string | null;
  groupPosition: number | null;
  sets: number | null;
  repsMin: number | null;
  repsMax: number | null;
  durationSeconds: number | null;
  distanceMeters: string | null;
  restSeconds: number | null;
  tempo: string | null;
  targetRpe: string | null;
  targetRir: string | null;
  setTechnique: string | null;
  substitutionPolicy: string | null;
  isRequired: boolean;
  coachNotes: string | null;
}> = {}) {
  return {
    id: "pte-1",
    exerciseId: "ex-1",
    sectionId: "sec-1",
    orderIndex: 0,
    groupId: null,
    groupPosition: null,
    sets: 3,
    repsMin: 6,
    repsMax: 8,
    durationSeconds: null,
    distanceMeters: null,
    restSeconds: 180,
    tempo: null,
    targetRpe: "8",
    targetRir: null,
    setTechnique: "straight_set",
    substitutionPolicy: null,
    isRequired: true,
    coachNotes: null,
    ...overrides,
  };
}

function rawExercise(overrides: Partial<{
  id: string;
  name: string;
  slug: string;
  status: string;
  scope: string;
  movementPattern: string;
  classification: string;
  difficulty: string;
  primaryMuscleGroup: string | null;
  defaultBodyPosition: string | null;
  resistanceType: string | null;
  unilateral: boolean;
  alternating: boolean;
  isTimeBased: boolean;
  isDistanceBased: boolean;
  isCardio: boolean;
  isMobility: boolean;
  fatigueCost: number | null;
  technicalComplexity: number | null;
  stabilityDemand: number | null;
  jointStressShoulder: number | null;
  jointStressElbow: number | null;
  jointStressWrist: number | null;
  jointStressSpine: number | null;
  jointStressHip: number | null;
  jointStressKnee: number | null;
  jointStressAnkle: number | null;
  lengthenedBias: number | null;
  shortenedBias: number | null;
  stretchMediatedPotential: number | null;
  defaultPrescription: unknown;
}> = {}) {
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
    defaultBodyPosition: null,
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
    ...overrides,
  };
}

function makeRawData(overrides: Partial<RawBlueprintData> = {}): RawBlueprintData {
  return {
    template: rawTemplate(),
    rawSections: [rawSection()],
    rawPrescriptions: [rawPrescription()],
    rawExercises: [rawExercise()],
    rawMuscles: [],
    rawRelationsOut: [],
    rawRelationsIn: [],
    rawContraindications: [],
    rawOverrides: [],
    ...overrides,
  };
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe("assembleBlueprint — template fields", () => {
  it("maps template metadata to EnrichedBlueprint", () => {
    const data = makeRawData({
      template: rawTemplate({ id: "tmpl-99", name: "Sprint Program", description: "A fast one", objective: "Speed" }),
    });
    const result = assembleBlueprint(data);
    expect(result.templateId).toBe("tmpl-99");
    expect(result.name).toBe("Sprint Program");
    expect(result.description).toBe("A fast one");
    expect(result.objective).toBe("Speed");
  });
});

describe("assembleBlueprint — empty blueprint", () => {
  it("returns empty prescriptions for a blueprint with no prescriptions", () => {
    const result = assembleBlueprint(makeRawData({ rawPrescriptions: [], rawExercises: [] }));
    expect(result.prescriptions).toHaveLength(0);
  });

  it("returns sections even when there are no prescriptions", () => {
    const result = assembleBlueprint(makeRawData({ rawPrescriptions: [], rawExercises: [] }));
    expect(result.sections).toHaveLength(1);
    expect(result.sections[0].id).toBe("sec-1");
  });
});

describe("assembleBlueprint — missing flag", () => {
  it("sets missing=true when exercise is not in rawExercises (deleted)", () => {
    const data = makeRawData({ rawExercises: [] }); // prescription exists but no matching exercise
    const result = assembleBlueprint(data);
    expect(result.prescriptions[0].missing).toBe(true);
    expect(result.prescriptions[0].exercise).toBeNull();
  });

  it("sets missing=false for archived exercises (they exist in DB)", () => {
    const data = makeRawData({
      rawExercises: [rawExercise({ status: "archived" })],
    });
    const result = assembleBlueprint(data);
    expect(result.prescriptions[0].missing).toBe(false);
    expect(result.prescriptions[0].exercise?.status).toBe("archived");
  });

  it("sets missing=false for active exercises", () => {
    const result = assembleBlueprint(makeRawData());
    expect(result.prescriptions[0].missing).toBe(false);
  });
});

describe("assembleBlueprint — effectivePrescription resolution", () => {
  const canonicalPrescription = { sets: 3, repsMin: 6, repsMax: 8 };
  const overridePrescription = { sets: 4, repsMin: 10, repsMax: 12 };

  it("uses override when both override and canonical exist (override wins)", () => {
    const data = makeRawData({
      rawExercises: [rawExercise({ defaultPrescription: canonicalPrescription })],
      rawOverrides: [{ exerciseId: "ex-1", defaultPrescription: overridePrescription }],
    });
    const result = assembleBlueprint(data);
    expect(result.prescriptions[0].effectivePrescription).toEqual(overridePrescription);
  });

  it("uses canonical when no override exists", () => {
    const data = makeRawData({
      rawExercises: [rawExercise({ defaultPrescription: canonicalPrescription })],
      rawOverrides: [],
    });
    const result = assembleBlueprint(data);
    expect(result.prescriptions[0].effectivePrescription).toEqual(canonicalPrescription);
  });

  it("returns null when neither override nor canonical exists", () => {
    const data = makeRawData({
      rawExercises: [rawExercise({ defaultPrescription: null })],
      rawOverrides: [],
    });
    const result = assembleBlueprint(data);
    expect(result.prescriptions[0].effectivePrescription).toBeNull();
  });

  it("ignores override with null defaultPrescription value", () => {
    const data = makeRawData({
      rawExercises: [rawExercise({ defaultPrescription: canonicalPrescription })],
      rawOverrides: [{ exerciseId: "ex-1", defaultPrescription: null }],
    });
    const result = assembleBlueprint(data);
    // null override is not stored in overrideMap, so falls back to canonical
    expect(result.prescriptions[0].effectivePrescription).toEqual(canonicalPrescription);
  });
});

describe("assembleBlueprint — numeric parsing", () => {
  it("parses targetRpe from string to number", () => {
    const data = makeRawData({
      rawPrescriptions: [rawPrescription({ targetRpe: "8.5" })],
    });
    const result = assembleBlueprint(data);
    expect(result.prescriptions[0].targetRpe).toBe(8.5);
    expect(typeof result.prescriptions[0].targetRpe).toBe("number");
  });

  it("parses targetRir from string to number", () => {
    const data = makeRawData({
      rawPrescriptions: [rawPrescription({ targetRir: "2" })],
    });
    const result = assembleBlueprint(data);
    expect(result.prescriptions[0].targetRir).toBe(2);
  });

  it("parses distanceMeters from string to number", () => {
    const data = makeRawData({
      rawPrescriptions: [rawPrescription({ distanceMeters: "400.5" })],
    });
    const result = assembleBlueprint(data);
    expect(result.prescriptions[0].distanceMeters).toBe(400.5);
  });

  it("parses emphasisPercent for muscles from string to number", () => {
    const data = makeRawData({
      rawMuscles: [{ exerciseId: "ex-1", muscleGroup: "quadriceps", role: "primary", emphasisPercent: "75.5" }],
    });
    const result = assembleBlueprint(data);
    expect(result.prescriptions[0].exercise?.muscles[0].emphasisPercent).toBe(75.5);
  });

  it("keeps null when targetRpe is null", () => {
    const data = makeRawData({
      rawPrescriptions: [rawPrescription({ targetRpe: null })],
    });
    const result = assembleBlueprint(data);
    expect(result.prescriptions[0].targetRpe).toBeNull();
  });

  it("keeps null when emphasisPercent is null", () => {
    const data = makeRawData({
      rawMuscles: [{ exerciseId: "ex-1", muscleGroup: "quadriceps", role: "primary", emphasisPercent: null }],
    });
    const result = assembleBlueprint(data);
    expect(result.prescriptions[0].exercise?.muscles[0].emphasisPercent).toBeNull();
  });
});

describe("assembleBlueprint — section context", () => {
  it("assigns sectionType from matching section to prescription", () => {
    const data = makeRawData({
      rawSections: [rawSection({ id: "sec-1", sectionType: "accessory" })],
      rawPrescriptions: [rawPrescription({ sectionId: "sec-1" })],
    });
    const result = assembleBlueprint(data);
    expect(result.prescriptions[0].sectionType).toBe("accessory");
    expect(result.prescriptions[0].sectionId).toBe("sec-1");
  });

  it("sets sectionType=null when prescription has no sectionId", () => {
    const data = makeRawData({
      rawPrescriptions: [rawPrescription({ sectionId: null })],
    });
    const result = assembleBlueprint(data);
    expect(result.prescriptions[0].sectionType).toBeNull();
    expect(result.prescriptions[0].sectionId).toBeNull();
  });

  it("sets sectionType=null when sectionId is orphaned (section deleted)", () => {
    const data = makeRawData({
      rawSections: [],
      rawPrescriptions: [rawPrescription({ sectionId: "missing-sec" })],
    });
    const result = assembleBlueprint(data);
    expect(result.prescriptions[0].sectionType).toBeNull();
  });
});

describe("assembleBlueprint — sorting", () => {
  it("sorts prescriptions by section orderIndex then prescription orderIndex", () => {
    const data = makeRawData({
      rawSections: [
        rawSection({ id: "sec-a", orderIndex: 1, sectionType: "accessory" }),
        rawSection({ id: "sec-b", orderIndex: 0, sectionType: "main_lift" }),
      ],
      rawPrescriptions: [
        rawPrescription({ id: "pte-a2", exerciseId: "ex-1", sectionId: "sec-a", orderIndex: 1 }),
        rawPrescription({ id: "pte-a1", exerciseId: "ex-1", sectionId: "sec-a", orderIndex: 0 }),
        rawPrescription({ id: "pte-b1", exerciseId: "ex-1", sectionId: "sec-b", orderIndex: 0 }),
      ],
      rawExercises: [rawExercise({ id: "ex-1" })],
    });
    const result = assembleBlueprint(data);
    // sec-b (orderIndex=0) prescriptions come first
    expect(result.prescriptions[0].id).toBe("pte-b1");
    // sec-a (orderIndex=1) prescriptions come after, ordered by prescription orderIndex
    expect(result.prescriptions[1].id).toBe("pte-a1");
    expect(result.prescriptions[2].id).toBe("pte-a2");
  });

  it("places unsectioned prescriptions last", () => {
    const data = makeRawData({
      rawSections: [rawSection({ id: "sec-1", orderIndex: 0 })],
      rawPrescriptions: [
        rawPrescription({ id: "pte-unsectioned", exerciseId: "ex-1", sectionId: null, orderIndex: 0 }),
        rawPrescription({ id: "pte-sectioned", exerciseId: "ex-1", sectionId: "sec-1", orderIndex: 0 }),
      ],
      rawExercises: [rawExercise({ id: "ex-1" })],
    });
    const result = assembleBlueprint(data);
    expect(result.prescriptions[0].id).toBe("pte-sectioned");
    expect(result.prescriptions[1].id).toBe("pte-unsectioned");
  });
});

describe("assembleBlueprint — muscles", () => {
  it("attaches muscles to the correct exercise", () => {
    const data = makeRawData({
      rawMuscles: [
        { exerciseId: "ex-1", muscleGroup: "quadriceps", role: "primary", emphasisPercent: "80" },
        { exerciseId: "ex-1", muscleGroup: "glutes", role: "secondary", emphasisPercent: null },
      ],
    });
    const result = assembleBlueprint(data);
    const muscles = result.prescriptions[0].exercise?.muscles ?? [];
    expect(muscles).toHaveLength(2);
    expect(muscles[0].muscleGroup).toBe("quadriceps");
    expect(muscles[1].muscleGroup).toBe("glutes");
  });

  it("returns empty muscles array when no muscles are recorded", () => {
    const result = assembleBlueprint(makeRawData({ rawMuscles: [] }));
    expect(result.prescriptions[0].exercise?.muscles).toEqual([]);
  });
});

describe("assembleBlueprint — relations (bidirectional)", () => {
  it("attaches outbound relations to the source exercise", () => {
    const data = makeRawData({
      rawRelationsOut: [
        {
          sourceExerciseId: "ex-1",
          targetExerciseId: "ex-2",
          relatedName: "Goblet Squat",
          relationType: "regression",
          suitabilityScore: 85,
          substitutionPolicy: "flexible",
        },
      ],
    });
    const result = assembleBlueprint(data);
    const relations = result.prescriptions[0].exercise?.relations ?? [];
    expect(relations).toHaveLength(1);
    expect(relations[0].relatedExerciseId).toBe("ex-2");
    expect(relations[0].relatedExerciseName).toBe("Goblet Squat");
    expect(relations[0].direction).toBe("outbound");
  });

  it("attaches inbound relations to the target exercise", () => {
    const data = makeRawData({
      rawRelationsIn: [
        {
          targetExerciseId: "ex-1",
          sourceExerciseId: "ex-3",
          relatedName: "Pause Squat",
          relationType: "progression",
          suitabilityScore: 90,
          substitutionPolicy: null,
        },
      ],
    });
    const result = assembleBlueprint(data);
    const relations = result.prescriptions[0].exercise?.relations ?? [];
    expect(relations).toHaveLength(1);
    expect(relations[0].relatedExerciseId).toBe("ex-3");
    expect(relations[0].direction).toBe("inbound");
  });

  it("merges outbound and inbound relations on the same exercise", () => {
    const data = makeRawData({
      rawRelationsOut: [
        {
          sourceExerciseId: "ex-1",
          targetExerciseId: "ex-2",
          relatedName: "Goblet Squat",
          relationType: "regression",
          suitabilityScore: 85,
          substitutionPolicy: null,
        },
      ],
      rawRelationsIn: [
        {
          targetExerciseId: "ex-1",
          sourceExerciseId: "ex-3",
          relatedName: "Pause Squat",
          relationType: "progression",
          suitabilityScore: 90,
          substitutionPolicy: null,
        },
      ],
    });
    const result = assembleBlueprint(data);
    const relations = result.prescriptions[0].exercise?.relations ?? [];
    expect(relations).toHaveLength(2);
  });
});

describe("assembleBlueprint — contraindications", () => {
  it("attaches contraindications to the correct exercise", () => {
    const data = makeRawData({
      rawContraindications: [
        {
          id: "ci-1",
          exerciseId: "ex-1",
          conditionOrInjury: "ACL tear",
          bodyRegion: "knee",
          severity: "avoid",
          modificationNote: "Use leg press instead",
          suggestedRelationId: null,
        },
      ],
    });
    const result = assembleBlueprint(data);
    const contraindications = result.prescriptions[0].exercise?.contraindications ?? [];
    expect(contraindications).toHaveLength(1);
    expect(contraindications[0].conditionOrInjury).toBe("ACL tear");
    expect(contraindications[0].severity).toBe("avoid");
  });
});

describe("assembleBlueprint — sections output", () => {
  it("preserves section order from rawSections input", () => {
    const data = makeRawData({
      rawSections: [
        rawSection({ id: "sec-a", orderIndex: 1 }),
        rawSection({ id: "sec-b", orderIndex: 0 }),
      ],
      rawPrescriptions: [],
      rawExercises: [],
    });
    const result = assembleBlueprint(data);
    // sections are output in the same order as rawSections (not re-sorted)
    expect(result.sections[0].id).toBe("sec-a");
    expect(result.sections[1].id).toBe("sec-b");
  });
});
