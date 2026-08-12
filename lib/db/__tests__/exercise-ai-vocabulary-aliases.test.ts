import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

import {
  AI_VOCABULARY_ALIAS_REPAIRS,
  INTENTIONALLY_AMBIGUOUS_AI_NAMES,
} from "../../../scripts/repairs/exercise-ai-vocabulary-aliases-data";
import { EXERCISES as AI_VOCABULARY_SEED_EXERCISES } from "../../../scripts/seeds/010-ai-vocabulary-coverage-data";
import { EXERCISES as REVIEWED_EXPANSION_EXERCISES } from "../../../scripts/seeds/011-reviewed-library-expansion-data";
import { normalizeExerciseName } from "../../program-generator/exercise-resolution";

function sourceText(file: string) {
  return readFileSync(resolve(process.cwd(), file), "utf8");
}

function exerciseBlock(file: string) {
  const text = sourceText(file);
  return text.match(/const EXERCISES = \[([\s\S]*?)\]\s*(?:as const)?;/)?.[1] ?? text;
}

function seededExerciseRows() {
  const seedFiles = [
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
  ];

  const parsedRows = seedFiles.flatMap((file) =>
    Array.from(exerciseBlock(file).matchAll(/slug:\s*"([^"]+)"[\s\S]{0,320}?name:\s*"([^"]+)"/g), (match) => ({
      slug: match[1],
      name: match[2],
      alternateNames: [] as readonly string[],
    })),
  );

  const rowsBySlug = new Map<string, { slug: string; name: string; alternateNames: readonly string[] }>();
  for (const row of [
    ...parsedRows,
    ...AI_VOCABULARY_SEED_EXERCISES.map((exercise) => ({
      slug: exercise.slug,
      name: exercise.name,
      alternateNames: exercise.alternateNames ?? [],
    })),
    ...REVIEWED_EXPANSION_EXERCISES.map((exercise) => ({
      slug: exercise.slug,
      name: exercise.name,
      alternateNames: exercise.alternateNames ?? [],
    })),
  ]) {
    rowsBySlug.set(row.slug, row);
  }

  return [...rowsBySlug.values()];
}

function seededExerciseSlugs() {
  return new Set(seededExerciseRows().map((exercise) => exercise.slug));
}

function aliasEntries() {
  return AI_VOCABULARY_ALIAS_REPAIRS.flatMap((repair) =>
    repair.aliases.map((alias) => ({
      slug: repair.slug,
      alias,
      normalizedAlias: normalizeExerciseName(alias),
    })),
  );
}

describe("Exercise Library AI vocabulary alias repair", () => {
  it("references only real seeded Exercise Library slugs", () => {
    const knownSlugs = seededExerciseSlugs();

    for (const repair of AI_VOCABULARY_ALIAS_REPAIRS) {
      expect(knownSlugs, `missing alias repair target ${repair.slug}`).toContain(repair.slug);
    }
  });

  it("keeps reviewed aliases unique so resolution remains exact", () => {
    const aliasesByNormalized = new Map<string, string[]>();

    for (const entry of aliasEntries()) {
      aliasesByNormalized.set(entry.normalizedAlias, [
        ...(aliasesByNormalized.get(entry.normalizedAlias) ?? []),
        entry.slug,
      ]);
    }

    for (const [alias, slugs] of aliasesByNormalized) {
      expect(new Set(slugs).size, `${alias} maps to multiple exercises`).toBe(1);
    }
  });

  it("does not duplicate aliases within a reviewed repair target", () => {
    for (const repair of AI_VOCABULARY_ALIAS_REPAIRS) {
      const normalizedAliases = repair.aliases.map(normalizeExerciseName);
      expect(new Set(normalizedAliases).size, `${repair.slug} duplicate aliases`).toBe(normalizedAliases.length);
    }
  });

  it("does not introduce aliases that collide with another canonical exercise name", () => {
    const canonicalByNormalized = new Map<string, string[]>();

    for (const exercise of seededExerciseRows()) {
      const normalized = normalizeExerciseName(exercise.name);
      canonicalByNormalized.set(normalized, [...(canonicalByNormalized.get(normalized) ?? []), exercise.slug]);
    }

    for (const entry of aliasEntries()) {
      const canonicalSlugs = canonicalByNormalized.get(entry.normalizedAlias) ?? [];
      const conflictingCanonicalSlugs = canonicalSlugs.filter((slug) => slug !== entry.slug);
      expect(conflictingCanonicalSlugs, `${entry.alias} aliases another canonical exercise`).toEqual([]);
    }
  });

  it("does not introduce normalized collisions against existing seed aliases", () => {
    const knownByNormalized = new Map<string, string[]>();

    for (const exercise of seededExerciseRows()) {
      for (const alias of exercise.alternateNames) {
        const normalized = normalizeExerciseName(alias);
        knownByNormalized.set(normalized, [...(knownByNormalized.get(normalized) ?? []), exercise.slug]);
      }
    }

    for (const entry of aliasEntries()) {
      const existingSlugs = knownByNormalized.get(entry.normalizedAlias) ?? [];
      const conflictingSeedAliasSlugs = existingSlugs.filter((slug) => slug !== entry.slug);
      expect(conflictingSeedAliasSlugs, `${entry.alias} collides with existing seed aliases`).toEqual([]);
    }
  });

  it("does not add intentionally ambiguous generic names as aliases", () => {
    const aliases = new Set(aliasEntries().map((entry) => entry.normalizedAlias));

    for (const name of INTENTIONALLY_AMBIGUOUS_AI_NAMES) {
      expect(aliases, `${name} should remain unresolved/ambiguous`).not.toContain(name.toLowerCase());
    }
  });

  it("adds high-value launch vocabulary for common AI and coach phrasing", () => {
    const aliasBySlug = new Map(
      AI_VOCABULARY_ALIAS_REPAIRS.map((repair) => [repair.slug, new Set(repair.aliases)]),
    );

    expect(aliasBySlug.get("push-up")?.has("Pushup")).toBe(true);
    expect(aliasBySlug.get("push-up")?.has("Push Up")).toBe(true);
    expect(aliasBySlug.get("pull-up")?.has("Pullup")).toBe(true);
    expect(aliasBySlug.get("pull-up")?.has("Pull Up")).toBe(true);
    expect(aliasBySlug.get("lat-pulldown")?.has("Lat Pull Down")).toBe(true);
    expect(aliasBySlug.get("lat-pulldown")?.has("Cable Lat Pulldown")).toBe(true);
    expect(aliasBySlug.get("dumbbell-bench-press")?.has("DB Bench Press")).toBe(true);
    expect(aliasBySlug.get("dumbbell-bench-press")?.has("Dumbbell Chest Press")).toBe(true);
    expect(aliasBySlug.get("barbell-romanian-deadlift")?.has("Barbell RDL")).toBe(true);
    expect(aliasBySlug.get("dumbbell-romanian-deadlift")?.has("Dumbbell RDL")).toBe(true);
    expect(aliasBySlug.get("dumbbell-romanian-deadlift")?.has("DB RDL")).toBe(true);
    expect(aliasBySlug.get("rowing-machine")?.has("Rower")).toBe(true);
    expect(aliasBySlug.get("rowing-machine")?.has("Row Erg")).toBe(true);
    expect(aliasBySlug.get("stationary-bike")?.has("Exercise Bike")).toBe(true);
    expect(aliasBySlug.get("stationary-bike")?.has("Upright Bike")).toBe(true);
    expect(aliasBySlug.get("incline-dumbbell-bench-press")?.has("Incline DB Press")).toBe(true);
    expect(aliasBySlug.get("bent-over-barbell-row")?.has("BB Row")).toBe(true);
    expect(aliasBySlug.get("standing-dumbbell-lateral-raise")?.has("DB Lateral Raise")).toBe(true);
    expect(aliasBySlug.get("cable-lateral-raise")?.has("Cable Side Raise")).toBe(true);
    expect(aliasBySlug.get("leg-extension")?.has("Quad Extension")).toBe(true);
    expect(aliasBySlug.get("ez-bar-curl")?.has("EZ Curl")).toBe(true);
    expect(aliasBySlug.get("cable-triceps-pressdown")?.has("Cable Tricep Pressdown")).toBe(true);
    expect(aliasBySlug.get("recumbent-bike")?.has("Recumbent Cycling")).toBe(true);
    expect(aliasBySlug.get("worlds-greatest-stretch")?.has("Worlds Greatest Stretch")).toBe(true);
  });

  it("keeps the alias repair idempotent and non-destructive", () => {
    const repairSource = sourceText("scripts/repair-exercise-ai-vocabulary-aliases.ts");

    expect(repairSource).toContain("mergeAliases");
    expect(repairSource).toContain("validateAliasCollisions");
    expect(repairSource).toContain("--dry-run");
    expect(repairSource).toContain("WHERE slug IN");
    expect(repairSource).not.toContain("DELETE FROM");
  });
});
