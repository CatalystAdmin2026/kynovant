import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

import { normalizeExerciseName } from "../exercise-resolution";
import {
  CROSS_FILE_RELATIONS,
  CUES,
  EXERCISE_EQUIPMENT,
  EXERCISES,
  findMissingRelationReferenceSlugs,
  INTRA_FILE_RELATIONS,
  MUSCLES,
  NEW_STRENGTH_SLUGS,
  WARMUP_MOBILITY_SLUGS,
} from "../../../scripts/seeds/010-ai-vocabulary-coverage-data";
import {
  AI_VOCABULARY_ALIAS_REPAIRS,
  INTENTIONALLY_AMBIGUOUS_AI_NAMES,
  UNSUPPORTED_AI_NAMES,
} from "../../../scripts/repairs/exercise-ai-vocabulary-aliases-data";

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

function sourceText(file: string) {
  return readFileSync(resolve(process.cwd(), file), "utf8");
}

function existingSeedSlugs() {
  const files = [
    "scripts/seeds/001-upper-push.ts",
    "scripts/seeds/002-upper-pull.ts",
    "scripts/seeds/003-lower-quad.ts",
    "scripts/seeds/004-hip-hinge.ts",
    "scripts/seeds/005-core-carries.ts",
    "scripts/seeds/006-arms.ts",
    "scripts/seeds/007-shoulders.ts",
    "scripts/seeds/008-knee-flexion-data.ts",
    "scripts/seeds/009-launch-critical-families-data.ts",
  ];
  return new Set(
    files.flatMap((file) => Array.from(sourceText(file).matchAll(/slug:\s*"([^"]+)"/g), (match) => match[1])),
  );
}

function sharedEquipmentSlugs() {
  return new Set(Array.from(sourceText("scripts/seeds/_shared.ts").matchAll(/slug:\s*"([^"]+)"/g), (match) => match[1]));
}

function buildAliasIndex() {
  const byName = new Map<string, string[]>();
  for (const exercise of EXERCISES) {
    byName.set(normalizeExerciseName(exercise.name), [
      ...(byName.get(normalizeExerciseName(exercise.name)) ?? []),
      exercise.slug,
    ]);
    for (const alias of exercise.alternateNames ?? []) {
      const normalized = normalizeExerciseName(alias);
      byName.set(normalized, [...(byName.get(normalized) ?? []), exercise.slug]);
    }
  }

  for (const repair of AI_VOCABULARY_ALIAS_REPAIRS) {
    for (const alias of repair.aliases) {
      const normalized = normalizeExerciseName(alias);
      byName.set(normalized, [...(byName.get(normalized) ?? []), repair.slug]);
    }
  }

  return byName;
}

describe("AI vocabulary exercise coverage", () => {
  it("adds only the bounded missing warmup/mobility and strength rows", () => {
    expect(WARMUP_MOBILITY_SLUGS).toHaveLength(5);
    expect(NEW_STRENGTH_SLUGS).toHaveLength(6);
    expect(EXERCISES).toHaveLength(11);
    expect(new Set(EXERCISES.map((exercise) => exercise.slug)).size).toBe(EXERCISES.length);
  });

  it("gives every newly seeded active exercise complete coaching cues", () => {
    for (const exercise of EXERCISES) {
      const cueTypes = CUES
        .filter(([slug]) => slug === exercise.slug)
        .map(([, cueType]) => cueType);

      expect(cueTypes, `${exercise.slug} setup`).toContain("setup");
      expect(cueTypes, `${exercise.slug} execution`).toContain("execution");
      expect(cueTypes, `${exercise.slug} common_error`).toContain("common_error");
      expect(cueTypes, `${exercise.slug} safety`).toContain("safety");
    }
  });

  it("keeps every new row to one primary muscle maximum", () => {
    for (const exercise of EXERCISES) {
      const primaryRows = MUSCLES.filter(([slug, , role]) => slug === exercise.slug && role === "primary");
      expect(primaryRows, `${exercise.slug} primary rows`).toHaveLength(1);
    }
  });

  it("uses only valid movement enum and equipment values", () => {
    const equipmentSlugs = sharedEquipmentSlugs();

    for (const exercise of EXERCISES) {
      expect(validMovementPatterns, `${exercise.slug} movement pattern`).toContain(exercise.movementPattern);
      expect(exercise.defaultPrescription, `${exercise.slug} prescription`).toBeTruthy();
    }

    for (const [, equipmentSlug] of EXERCISE_EQUIPMENT) {
      expect(equipmentSlugs, `missing equipment ${equipmentSlug}`).toContain(equipmentSlug);
    }
  });

  it("keeps new and cross-file relations valid and bidirectional where required", () => {
    const knownSlugs = new Set([...existingSeedSlugs(), ...EXERCISES.map((exercise) => exercise.slug)]);
    const allRelations = [
      ...INTRA_FILE_RELATIONS.map(([sourceSlug, targetSlug, relationType]) => ({
        sourceSlug,
        targetSlug,
        relationType,
      })),
      ...CROSS_FILE_RELATIONS,
    ];
    const relationKeys = new Set(
      allRelations.map((relation) => `${relation.sourceSlug}:${relation.relationType}:${relation.targetSlug}`),
    );

    for (const relation of allRelations) {
      expect(knownSlugs, `missing source ${relation.sourceSlug}`).toContain(relation.sourceSlug);
      expect(knownSlugs, `missing target ${relation.targetSlug}`).toContain(relation.targetSlug);

      const inverse = inverseRelationType.get(relation.relationType);
      expect(inverse, `unknown relation type ${relation.relationType}`).toBeDefined();
      expect(relationKeys, `${relation.sourceSlug} inverse`).toContain(
        `${relation.targetSlug}:${inverse}:${relation.sourceSlug}`,
      );
    }
  });

  it("allows dry-run relation validation to reference same-batch exercise slugs", () => {
    const existingDbSlugs = existingSeedSlugs();
    const seedPayloadSlugs = new Set(EXERCISES.map((exercise) => exercise.slug));

    expect(
      findMissingRelationReferenceSlugs(CROSS_FILE_RELATIONS, existingDbSlugs, seedPayloadSlugs),
    ).toEqual([]);
  });

  it("still fails validation for genuinely missing external relation targets", () => {
    const missing = findMissingRelationReferenceSlugs(
      [
        {
          sourceSlug: "band-chest-fly",
          targetSlug: "not-a-real-external-exercise",
        },
      ],
      existingSeedSlugs(),
      new Set(EXERCISES.map((exercise) => exercise.slug)),
    );

    expect(missing).toEqual(["not-a-real-external-exercise"]);
  });

  it("resolves safe aliases and common spelling/pluralization to exactly one reviewed row", () => {
    const aliasIndex = buildAliasIndex();
    const expected = new Map([
      ["Arm Circles", "arm-circles"],
      ["Cat Cow Stretch", "cat-cow-stretch"],
      ["Bodyweight Good Morning", "bodyweight-good-morning"],
      ["Band Chest Fly", "band-chest-fly"],
      ["Band Chest Flyes", "band-chest-fly"],
      ["Tricep Dips", "bench-dip"],
      ["Barbell Bicep Curl", "barbell-curl"],
      ["Dumbbell Flyes", "dumbbell-chest-fly"],
      ["Cable Face Pull", "face-pull"],
      ["Cable Bicep Curl", "cable-curl-straight-bar"],
      ["Cable Upright Row", "cable-upright-row"],
    ]);

    for (const [name, slug] of expected) {
      expect(aliasIndex.get(normalizeExerciseName(name)), name).toEqual([slug]);
    }
  });

  it("leaves generic or equipment-sensitive names intentionally ambiguous instead of aliasing arbitrarily", () => {
    const aliasIndex = buildAliasIndex();

    for (const name of INTENTIONALLY_AMBIGUOUS_AI_NAMES) {
      expect(aliasIndex.get(normalizeExerciseName(name)), `${name} should not be a safe alias`).toBeUndefined();
    }
  });

  it("documents unsupported vocabulary rather than fabricating enum mappings", () => {
    expect(UNSUPPORTED_AI_NAMES).toEqual([
      expect.objectContaining({
        name: "Shoulder Shrug",
        reason: expect.stringContaining("scapular_elevation"),
      }),
    ]);
  });

  it("keeps seed and alias repair safe to rerun", () => {
    const seedSource = sourceText("scripts/seeds/010-ai-vocabulary-coverage.ts");
    const repairSource = sourceText("scripts/repair-exercise-ai-vocabulary-aliases.ts");

    expect(seedSource).toContain("Safe to rerun");
    expect(seedSource).toContain("ON CONFLICT DO NOTHING");
    expect(seedSource).toContain("seedPayloadSlugs");
    expect(seedSource).toContain("findMissingRelationReferenceSlugs");
    expect(seedSource).toContain("--dry-run");
    expect(repairSource).toContain("--dry-run");
    expect(repairSource).toContain("mergeAliases");
    expect(repairSource).not.toContain("DELETE FROM");
  });
});
