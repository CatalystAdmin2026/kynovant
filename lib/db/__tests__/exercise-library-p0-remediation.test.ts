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
import {
  HIGH_RISK_RELATIONS,
  LEGACY_PRIMARY_MUSCLE_REPAIRS,
} from "../../../scripts/repairs/exercise-library-p0-p1-data";
import type { ExerciseDef } from "../../../scripts/seeds/_shared";

const newActiveExerciseSlugs = ["lying-leg-curl", "nordic-curl"] as const;

const safetyCriticalCueFiles = [
  {
    file: "scripts/seeds/004-hip-hinge.ts",
    slugs: [
      "deficit-deadlift",
      "deficit-romanian-deadlift",
      "snatch-grip-deadlift",
      "barbell-single-leg-romanian-deadlift",
      "banded-deadlift",
      "good-morning",
      "seated-good-morning",
      "single-arm-kettlebell-swing",
    ],
  },
  {
    file: "scripts/seeds/003-lower-quad.ts",
    slugs: ["barbell-walking-lunge", "barbell-hack-squat"],
  },
  {
    file: "scripts/seeds/002-upper-pull.ts",
    slugs: ["kroc-row", "renegade-row", "wide-grip-pull-up"],
  },
] as const;

function cueTypesForSlug(source: string, slug: string) {
  const escapedSlug = slug.replaceAll("-", "\\-");
  const cuePattern = new RegExp(`\\["${escapedSlug}",\\s*"([^"]+)"`, "g");
  return Array.from(source.matchAll(cuePattern), (match) => match[1]);
}

function exerciseSlugsFromSource(source: string) {
  return Array.from(source.matchAll(/slug:\s*"([^"]+)"/g), (match) => match[1]);
}

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

  it("gives every safety-critical advanced or specialist zero-cue exercise the active cue gate", () => {
    for (const { file, slugs } of safetyCriticalCueFiles) {
      const source = readFileSync(resolve(process.cwd(), file), "utf8");

      for (const slug of slugs) {
        const cueTypes = cueTypesForSlug(source, slug);

        expect(cueTypes, `${slug} should have setup cue`).toContain("setup");
        expect(cueTypes, `${slug} should have execution cue`).toContain("execution");
        expect(cueTypes, `${slug} should have common error cue`).toContain("common_error");
        expect(cueTypes, `${slug} should have safety cue`).toContain("safety");
      }
    }
  });

  it("uses an explicit reviewed mapping for the remaining 15 legacy duplicate-primary exercises", () => {
    const expectedPrimaryBySlug = new Map([
      ["romanian-deadlift", "hamstrings"],
      ["dip", "chest"],
      ["weighted-dip", "chest"],
      ["bulgarian-split-squat", "quadriceps"],
      ["arnold-press", "front_deltoid"],
      ["behind-neck-press", "front_deltoid"],
      ["handstand-push-up", "front_deltoid"],
      ["barbell-floor-press", "chest"],
      ["dumbbell-floor-press", "chest"],
      ["decline-push-up", "chest"],
      ["incline-barbell-bench-press", "chest"],
      ["incline-dumbbell-bench-press", "chest"],
      ["incline-dumbbell-fly", "chest"],
      ["plank", "rectus_abdominis"],
      ["chest-supported-dumbbell-row", "lats"],
    ]);

    expect(LEGACY_PRIMARY_MUSCLE_REPAIRS).toHaveLength(15);
    expect(LEGACY_PRIMARY_MUSCLE_REPAIRS.map((repair) => repair.slug)).not.toContain("back-squat");

    for (const repair of LEGACY_PRIMARY_MUSCLE_REPAIRS) {
      expect(repair.primaryMuscle).toBe(expectedPrimaryBySlug.get(repair.slug));
      expect(repair.reviewedDuplicatePrimaries).not.toContain(repair.primaryMuscle);
    }
  });

  it("keeps high-risk substitute and lower-joint-stress relations bidirectional", () => {
    const relationKeys = new Set(
      HIGH_RISK_RELATIONS.map((relation) => `${relation.sourceSlug}:${relation.relationType}:${relation.targetSlug}`),
    );

    for (const relation of HIGH_RISK_RELATIONS) {
      if (relation.relationType === "substitute") {
        expect(relationKeys, `${relation.sourceSlug} substitute inverse`).toContain(
          `${relation.targetSlug}:substitute:${relation.sourceSlug}`,
        );
      }

      if (relation.relationType === "lower_joint_stress") {
        expect(relationKeys, `${relation.sourceSlug} lower-stress inverse`).toContain(
          `${relation.targetSlug}:higher_joint_stress:${relation.sourceSlug}`,
        );
      }

      if (relation.relationType === "higher_joint_stress") {
        expect(relationKeys, `${relation.sourceSlug} higher-stress inverse`).toContain(
          `${relation.targetSlug}:lower_joint_stress:${relation.sourceSlug}`,
        );
      }

      if (relation.relationType === "progression") {
        expect(relationKeys, `${relation.sourceSlug} progression inverse`).toContain(
          `${relation.targetSlug}:regression:${relation.sourceSlug}`,
        );
      }

      if (relation.relationType === "regression") {
        expect(relationKeys, `${relation.sourceSlug} regression inverse`).toContain(
          `${relation.targetSlug}:progression:${relation.sourceSlug}`,
        );
      }
    }
  });

  it("references only seeded exercise slugs in high-risk relation repairs", () => {
    const seedFiles = [
      "scripts/seed-exercises.ts",
      "scripts/seeds/001-upper-push.ts",
      "scripts/seeds/002-upper-pull.ts",
      "scripts/seeds/003-lower-quad.ts",
      "scripts/seeds/004-hip-hinge.ts",
      "scripts/seeds/005-core-carries.ts",
      "scripts/seeds/008-knee-flexion-data.ts",
    ];
    const knownSlugs = new Set(
      seedFiles.flatMap((file) => exerciseSlugsFromSource(readFileSync(resolve(process.cwd(), file), "utf8"))),
    );

    for (const relation of HIGH_RISK_RELATIONS) {
      expect(knownSlugs, `missing source ${relation.sourceSlug}`).toContain(relation.sourceSlug);
      expect(knownSlugs, `missing target ${relation.targetSlug}`).toContain(relation.targetSlug);
    }
  });

  it("keeps the legacy metadata repair safe to rerun", () => {
    const repairSource = readFileSync(
      resolve(process.cwd(), "scripts/repair-legacy-exercise-metadata.ts"),
      "utf8",
    );

    expect(repairSource).toContain("ON CONFLICT DO NOTHING");
    expect(repairSource).toContain("primary_muscle_group IS DISTINCT FROM");
    expect(repairSource).toContain("Unexpected primary muscle rows");
    expect(repairSource).toContain("WHERE e.slug IN");
    expect(repairSource).not.toContain("DELETE FROM exercises");
  });
});
