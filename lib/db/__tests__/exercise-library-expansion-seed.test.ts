import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

import {
  CUES,
  EXERCISE_EQUIPMENT,
  EXERCISES,
  EXPANSION_FAMILY_COUNTS,
  LOCAL_EQUIPMENT,
  MUSCLES,
  RELATIONS,
} from "../../../scripts/seeds/011-reviewed-library-expansion-data";

const validMovementPatterns = new Set([
  "push_vertical",
  "push_horizontal",
  "pull_vertical",
  "pull_horizontal",
  "hip_hinge",
  "squat_bilateral",
  "squat_unilateral",
  "lunge",
  "carry",
  "rotation",
  "anti_rotation",
  "gait",
  "jump",
  "throw",
  "iso_hold",
  "elbow_flexion",
  "elbow_extension",
  "shoulder_abduction",
  "shoulder_adduction",
  "knee_flexion",
  "knee_extension",
  "hip_extension",
  "hip_flexion",
  "scapular_retraction",
  "scapular_depression",
  "external_rotation",
  "internal_rotation",
]);

const inverseRelationType = new Map([
  ["substitute", "substitute"],
  ["same_pattern", "same_pattern"],
  ["contralateral", "contralateral"],
  ["progression", "regression"],
  ["regression", "progression"],
  ["lower_joint_stress", "higher_joint_stress"],
  ["higher_joint_stress", "lower_joint_stress"],
]);

const previousSeedFiles = [
  "scripts/seed-exercises.ts",
  "scripts/seeds/001-upper-push.ts",
  "scripts/seeds/002-upper-pull.ts",
  "scripts/seeds/003-lower-quad.ts",
  "scripts/seeds/004-hip-hinge.ts",
  "scripts/seeds/005-core-carries.ts",
  "scripts/seeds/006-arms.ts",
  "scripts/seeds/007-shoulders.ts",
  "scripts/seeds/008-knee-flexion-data.ts",
  "scripts/seeds/009-launch-critical-families-data.ts",
  "scripts/seeds/010-ai-vocabulary-coverage-data.ts",
];

function sourceText(file: string) {
  return readFileSync(resolve(process.cwd(), file), "utf8");
}

function sharedEquipmentSlugs() {
  const source = sourceText("scripts/seeds/_shared.ts");
  return Array.from(source.matchAll(/slug:\s*"([^"]+)"/g), (match) => match[1]);
}

function previousExerciseSlugs() {
  return new Set(
    previousSeedFiles.flatMap((file) => Array.from(sourceText(file).matchAll(/slug:\s*"([^"]+)"/g), (match) => match[1])),
  );
}

describe("reviewed Exercise Library expansion seed data", () => {
  it("adds a substantial but bounded reviewed expansion", () => {
    expect(EXERCISES.length).toBeGreaterThanOrEqual(300);
    expect(EXERCISES.length).toBeLessThanOrEqual(500);
    expect(Object.keys(EXPANSION_FAMILY_COUNTS).length).toBeGreaterThanOrEqual(20);
  });

  it("keeps new slugs unique and avoids prior seed collisions", () => {
    const slugs = EXERCISES.map((exercise) => exercise.slug);
    const priorSlugs = previousExerciseSlugs();

    expect(new Set(slugs).size).toBe(EXERCISES.length);
    for (const slug of slugs) {
      expect(priorSlugs, `duplicate seeded slug ${slug}`).not.toContain(slug);
    }
  });

  it("gives every new active exercise setup, execution, common-error, and safety cues", () => {
    for (const exercise of EXERCISES) {
      const cueTypes = CUES
        .filter(([slug]) => slug === exercise.slug)
        .map(([, cueType]) => cueType);

      expect(cueTypes, `${exercise.slug} setup`).toContain("setup");
      expect(cueTypes, `${exercise.slug} execution`).toContain("execution");
      expect(cueTypes, `${exercise.slug} common error`).toContain("common_error");
      expect(cueTypes, `${exercise.slug} safety`).toContain("safety");
    }
  });

  it("keeps every new exercise to exactly one primary muscle", () => {
    for (const exercise of EXERCISES) {
      const primaryMuscles = MUSCLES.filter(
        ([slug, , role]) => slug === exercise.slug && role === "primary",
      );

      expect(primaryMuscles, `${exercise.slug} primary muscle`).toHaveLength(1);
    }
  });

  it("uses valid movement patterns and complete scoring metadata", () => {
    for (const exercise of EXERCISES) {
      expect(validMovementPatterns, `${exercise.slug} movement pattern`).toContain(exercise.movementPattern);
      expect(exercise.fatigueCost, `${exercise.slug} fatigue`).toBeGreaterThanOrEqual(1);
      expect(exercise.fatigueCost, `${exercise.slug} fatigue`).toBeLessThanOrEqual(10);
      expect(exercise.technicalComplexity, `${exercise.slug} complexity`).toBeGreaterThanOrEqual(1);
      expect(exercise.technicalComplexity, `${exercise.slug} complexity`).toBeLessThanOrEqual(10);
      expect(exercise.stabilityDemand, `${exercise.slug} stability`).toBeGreaterThanOrEqual(1);
      expect(exercise.stabilityDemand, `${exercise.slug} stability`).toBeLessThanOrEqual(10);
      expect(exercise.defaultPrescription, `${exercise.slug} prescription`).toBeDefined();
    }
  });

  it("keeps mixed-family computed metadata honest for audited variants", () => {
    const bySlug = new Map(EXERCISES.map((exercise) => [exercise.slug, exercise]));

    expect(bySlug.get("contralateral-single-leg-romanian-deadlift")).toMatchObject({
      primary: "hamstrings",
      movementPattern: "hip_hinge",
      resistanceType: "dumbbell",
      equipment: ["dumbbells"],
    });
    expect(bySlug.get("nordic-curl-assisted-band")).toMatchObject({
      primary: "hamstrings",
      movementPattern: "knee_flexion",
      resistanceType: "band",
      equipment: ["resistance-band"],
    });
    expect(bySlug.get("razor-curl")).toMatchObject({
      primary: "hamstrings",
      movementPattern: "knee_flexion",
      resistanceType: "bodyweight",
      equipment: ["glute-ham-developer"],
    });
    expect(bySlug.get("machine-hip-hinge-hamstring-bias")).toMatchObject({
      movementPattern: "hip_hinge",
      resistanceType: "machine",
      equipment: ["machine-back-extension"],
    });
    expect(bySlug.get("bent-knee-bodyweight-calf-raise")).toMatchObject({
      primary: "calves",
      movementPattern: "gait",
      resistanceType: "bodyweight",
      equipment: [],
    });
    expect(bySlug.get("farmer-carry-calf-raise")).toMatchObject({
      primary: "calves",
      movementPattern: "gait",
      resistanceType: "dumbbell",
      equipment: ["dumbbells"],
    });
    expect(bySlug.get("wall-ankle-mobilization")).toMatchObject({
      primary: "calves",
      movementPattern: "gait",
      resistanceType: "bodyweight",
      equipment: [],
    });
    expect(bySlug.get("banded-lat-stretch")).toMatchObject({
      primary: "lats",
      movementPattern: "shoulder_adduction",
      resistanceType: "band",
      equipment: ["resistance-band"],
    });
    expect(bySlug.get("pec-doorway-stretch")).toMatchObject({
      primary: "chest",
      movementPattern: "shoulder_adduction",
      resistanceType: "bodyweight",
      equipment: [],
    });
    expect(bySlug.get("mini-band-glute-bridge")).toMatchObject({
      primary: "glutes",
      movementPattern: "hip_extension",
      resistanceType: "band",
      equipment: ["mini-band"],
    });
    expect(bySlug.get("scapular-wall-slide-with-lift-off")).toMatchObject({
      primary: "upper_back",
      movementPattern: "scapular_retraction",
      resistanceType: "bodyweight",
      equipment: [],
    });
  });

  it("references only valid equipment catalog slugs", () => {
    const knownEquipment = new Set([
      ...sharedEquipmentSlugs(),
      ...LOCAL_EQUIPMENT.map((equipment) => equipment.slug),
    ]);

    for (const [, equipmentSlug] of EXERCISE_EQUIPMENT) {
      expect(knownEquipment, `missing equipment ${equipmentSlug}`).toContain(equipmentSlug);
    }
  });

  it("keeps required relations bidirectional and internal to this seed", () => {
    const exerciseSlugs = new Set(EXERCISES.map((exercise) => exercise.slug));
    const relationKeys = new Set(
      RELATIONS.map(([sourceSlug, targetSlug, relationType]) => `${sourceSlug}:${relationType}:${targetSlug}`),
    );

    for (const [sourceSlug, targetSlug, relationType] of RELATIONS) {
      expect(exerciseSlugs, `missing source ${sourceSlug}`).toContain(sourceSlug);
      expect(exerciseSlugs, `missing target ${targetSlug}`).toContain(targetSlug);

      const inverseType = inverseRelationType.get(relationType);
      expect(inverseType, `unknown relation type ${relationType}`).toBeDefined();
      expect(relationKeys, `${sourceSlug} ${relationType} inverse`).toContain(
        `${targetSlug}:${inverseType}:${sourceSlug}`,
      );
    }
  });

  it("keeps the seed safe to rerun", () => {
    const seedSource = sourceText("scripts/seeds/011-reviewed-library-expansion.ts");

    expect(seedSource).toContain("Safe to rerun");
    expect(seedSource).toContain("seedExercises(");
    expect(seedSource).not.toContain("DELETE FROM");
  });
});
