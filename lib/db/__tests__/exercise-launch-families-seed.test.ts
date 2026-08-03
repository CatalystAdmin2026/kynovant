import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

import {
  CALF_EXERCISE_SLUGS,
  CARDIO_EXERCISE_SLUGS,
  CUES,
  EXERCISE_EQUIPMENT,
  EXERCISES,
  LOCAL_EQUIPMENT,
  MOBILITY_EXERCISE_SLUGS,
  MUSCLES,
  RELATIONS,
} from "../../../scripts/seeds/009-launch-critical-families-data";

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

function sharedEquipmentSlugs() {
  const source = readFileSync(resolve(process.cwd(), "scripts/seeds/_shared.ts"), "utf8");
  return Array.from(source.matchAll(/slug:\s*"([^"]+)"/g), (match) => match[1]);
}

describe("launch-critical exercise family seed data", () => {
  it("adds only the bounded launch-critical family counts", () => {
    expect(CALF_EXERCISE_SLUGS).toHaveLength(6);
    expect(CARDIO_EXERCISE_SLUGS).toHaveLength(8);
    expect(MOBILITY_EXERCISE_SLUGS).toHaveLength(8);
    expect(EXERCISES).toHaveLength(22);
  });

  it("keeps slugs unique and scoped to the three requested families", () => {
    const familySlugs = new Set([
      ...CALF_EXERCISE_SLUGS,
      ...CARDIO_EXERCISE_SLUGS,
      ...MOBILITY_EXERCISE_SLUGS,
    ]);
    const exerciseSlugs = EXERCISES.map((exercise) => exercise.slug);

    expect(new Set(exerciseSlugs).size).toBe(EXERCISES.length);
    for (const slug of exerciseSlugs) {
      expect(familySlugs, `unexpected slug ${slug}`).toContain(slug);
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

  it("keeps every touched exercise to one primary muscle maximum", () => {
    for (const exercise of EXERCISES) {
      const primaryMuscles = MUSCLES.filter(
        ([slug, , role]) => slug === exercise.slug && role === "primary",
      );

      expect(primaryMuscles, `${exercise.slug} primary muscle`).toHaveLength(1);
    }
  });

  it("uses only valid movement enum values and honest cardio/mobility flags", () => {
    const cardioSlugs = new Set<string>(CARDIO_EXERCISE_SLUGS);
    const mobilitySlugs = new Set<string>(MOBILITY_EXERCISE_SLUGS);

    for (const exercise of EXERCISES) {
      expect(validMovementPatterns, `${exercise.slug} movement pattern`).toContain(exercise.movementPattern);

      if (cardioSlugs.has(exercise.slug)) {
        expect(exercise.classification).toBe("cardio");
        expect((exercise as { isCardio?: boolean }).isCardio).toBe(true);
        expect(exercise.defaultPrescription).toMatchObject({
          durationSeconds: expect.any(Number),
        });
      }

      if (mobilitySlugs.has(exercise.slug)) {
        expect(exercise.classification).toBe("mobility");
        expect((exercise as { isMobility?: boolean }).isMobility).toBe(true);
      }
    }
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

  it("references only seeded exercise IDs and keeps required relations bidirectional", () => {
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
    const seedSource = readFileSync(
      resolve(process.cwd(), "scripts/seeds/009-launch-critical-families.ts"),
      "utf8",
    );

    expect(seedSource).toContain("Safe to rerun");
    expect(seedSource).toContain("seedExercises(");
    expect(seedSource).not.toContain("DELETE FROM");
  });
});
