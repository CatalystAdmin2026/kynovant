import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const legacySeedFiles = [
  "scripts/seeds/001-upper-push.ts",
  "scripts/seeds/002-upper-pull.ts",
  "scripts/seeds/003-lower-quad.ts",
  "scripts/seeds/004-hip-hinge.ts",
  "scripts/seeds/005-core-carries.ts",
  "scripts/seeds/006-arms.ts",
  "scripts/seeds/007-shoulders.ts",
];

function sourceText(file: string) {
  return readFileSync(resolve(process.cwd(), file), "utf8");
}

function legacyPrimaryRows(file: string) {
  return Array.from(
    sourceText(file).matchAll(/\["([^"]+)",\s*"([^"]+)",\s*"primary"\]/g),
    (match) => ({
      slug: match[1],
      muscleGroup: match[2],
    }),
  );
}

describe("Exercise Library release-candidate source quality", () => {
  it("keeps legacy seed source rows to one primary muscle per exercise", () => {
    for (const file of legacySeedFiles) {
      const primaryBySlug = new Map<string, string[]>();

      for (const row of legacyPrimaryRows(file)) {
        primaryBySlug.set(row.slug, [
          ...(primaryBySlug.get(row.slug) ?? []),
          row.muscleGroup,
        ]);
      }

      for (const [slug, primaryMuscles] of primaryBySlug) {
        expect(primaryMuscles, `${file}:${slug}`).toHaveLength(1);
      }
    }
  });

  it("keeps the push-up progression chain directionally correct", () => {
    const source = sourceText("scripts/seeds/001-upper-push.ts");

    expect(source).toContain('["push-up", "incline-push-up", "regression"');
    expect(source).toContain('["push-up", "decline-push-up", "progression"');
    expect(source).toContain('["push-up", "ring-push-up", "progression"');
  });
});
