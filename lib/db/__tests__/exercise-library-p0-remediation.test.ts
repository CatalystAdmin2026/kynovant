import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

import {
  CUES,
  EXERCISE_EQUIPMENT,
  EXERCISES,
  KNEE_FLEXION_EXERCISE_SLUGS,
  MUSCLES,
  RELATIONS,
} from "../../../scripts/seeds/008-knee-flexion-data";
import type { ExerciseDef } from "../../../scripts/seeds/_shared";

const newActiveExerciseSlugs = ["lying-leg-curl", "nordic-curl"] as const;

describe("P0 exercise library remediation seed data", () => {
  it("gives every new active exercise setup and execution cues", () => {
    for (const slug of newActiveExerciseSlugs) {
      const cueTypes = CUES
        .filter(([cueSlug]) => cueSlug === slug)
        .map(([, cueType]) => cueType);

      expect(cueTypes).toContain("setup");
      expect(cueTypes).toContain("execution");
      expect(cueTypes).toContain("common_error");
      expect(cueTypes).toContain("safety");
    }
  });

  it("keeps each knee-flexion exercise to a single primary muscle", () => {
    for (const slug of KNEE_FLEXION_EXERCISE_SLUGS) {
      const primaryMuscles = MUSCLES.filter(
        ([muscleSlug, , role]) => muscleSlug === slug && role === "primary",
      );

      expect(primaryMuscles).toHaveLength(1);
      expect(primaryMuscles[0][1]).toBe("hamstrings");
    }
  });

  it("includes equipment, prescription, fatigue, and joint-stress metadata", () => {
    for (const exercise of EXERCISES as readonly ExerciseDef[]) {
      const equipment = EXERCISE_EQUIPMENT.filter(([slug]) => slug === exercise.slug);

      expect(equipment.length).toBeGreaterThan(0);
      expect(exercise.defaultPrescription).toMatchObject({
        sets: expect.any(Number),
        repsMin: expect.any(Number),
        repsMax: expect.any(Number),
        restSeconds: expect.any(Number),
      });
      expect(exercise.fatigueCost).toBeGreaterThanOrEqual(1);
      expect(exercise.fatigueCost).toBeLessThanOrEqual(10);
      expect(
        [
          exercise.jointStressShoulder,
          exercise.jointStressElbow,
          exercise.jointStressWrist,
          exercise.jointStressSpine,
          exercise.jointStressHip,
          exercise.jointStressKnee,
          exercise.jointStressAnkle,
        ].some((score) => score !== undefined),
      ).toBe(true);
    }
  });

  it("keeps required knee-flexion relations bidirectional", () => {
    const relationKeys = new Set(
      RELATIONS.map(([sourceSlug, targetSlug, relationType]) => `${sourceSlug}:${relationType}:${targetSlug}`),
    );

    expect(relationKeys).toContain("seated-leg-curl:substitute:lying-leg-curl");
    expect(relationKeys).toContain("lying-leg-curl:substitute:seated-leg-curl");
    expect(relationKeys).toContain("lying-leg-curl:regression:nordic-curl");
    expect(relationKeys).toContain("nordic-curl:progression:lying-leg-curl");
    expect(relationKeys).toContain("seated-leg-curl:regression:nordic-curl");
    expect(relationKeys).toContain("nordic-curl:progression:seated-leg-curl");
    expect(relationKeys).toContain("lying-leg-curl:lower_joint_stress:nordic-curl");
    expect(relationKeys).toContain("nordic-curl:higher_joint_stress:lying-leg-curl");
  });

  it("uses conflict-safe inserts in the seed and a scoped Back Squat repair", () => {
    const seedSource = readFileSync(
      resolve(process.cwd(), "scripts/seeds/008-knee-flexion.ts"),
      "utf8",
    );
    const repairSource = readFileSync(
      resolve(process.cwd(), "scripts/repair-back-squat-primary.ts"),
      "utf8",
    );

    expect(seedSource).toContain("Safe to rerun");
    expect(seedSource).toContain("seedExercises(");
    expect(repairSource).toContain("WHERE slug = 'back-squat'");
    expect(repairSource).toContain("ON CONFLICT DO NOTHING");
    expect(repairSource).toContain("AND em.muscle_group <> 'quadriceps'");
    expect(repairSource).not.toContain("WHERE slug <> 'back-squat'");
  });
});
