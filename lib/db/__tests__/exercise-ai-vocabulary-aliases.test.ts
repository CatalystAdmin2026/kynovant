import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

import {
  AI_VOCABULARY_ALIAS_REPAIRS,
  INTENTIONALLY_AMBIGUOUS_AI_NAMES,
} from "../../../scripts/repairs/exercise-ai-vocabulary-aliases-data";

function sourceText(file: string) {
  return readFileSync(resolve(process.cwd(), file), "utf8");
}

function seededExerciseSlugs() {
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
    "scripts/seeds/010-ai-vocabulary-coverage-data.ts",
  ];

  return new Set(
    seedFiles.flatMap((file) => Array.from(sourceText(file).matchAll(/slug:\s*"([^"]+)"/g), (match) => match[1])),
  );
}

function aliasEntries() {
  return AI_VOCABULARY_ALIAS_REPAIRS.flatMap((repair) =>
    repair.aliases.map((alias) => ({
      slug: repair.slug,
      alias,
      normalizedAlias: alias.trim().toLowerCase(),
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
  });

  it("keeps the alias repair idempotent and non-destructive", () => {
    const repairSource = sourceText("scripts/repair-exercise-ai-vocabulary-aliases.ts");

    expect(repairSource).toContain("mergeAliases");
    expect(repairSource).toContain("--dry-run");
    expect(repairSource).toContain("WHERE slug IN");
    expect(repairSource).not.toContain("DELETE FROM");
  });
});
