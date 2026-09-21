// ─────────────────────────────────────────────────────────────
// Retired (invalid) SYSTEM exercises — "Bayesian Lat Pulldown".
//
// No database needed: these prove, from the pure seed data, the schema,
// and the query source, that (a) the fabricated exercise can no longer be
// seeded, (b) retirement is an archive (not a delete), (c) every path that
// feeds NEW generation requires status='active', and (d) historical
// references are protected by RESTRICT foreign keys. (The one-time
// production mutation itself is run by a human via
// scripts/retire-invalid-system-exercises.ts.)
// ─────────────────────────────────────────────────────────────

import { readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { getTableConfig } from "drizzle-orm/pg-core";

import { RETIRED_SYSTEM_EXERCISES } from "../../../scripts/repairs/retired-system-exercises";
import { EXERCISES, RELATIONS } from "../../../scripts/seeds/011-reviewed-library-expansion-data";
import { workoutTemplateExercises } from "../schema-exercise";

const root = resolve(__dirname, "../../..");
const source = (rel: string) => readFileSync(resolve(root, rel), "utf8");

describe("retired system exercise list", () => {
  it("has unique slugs and a recorded reason for each", () => {
    const slugs = RETIRED_SYSTEM_EXERCISES.map((e) => e.slug);
    expect(new Set(slugs).size).toBe(slugs.length);
    for (const e of RETIRED_SYSTEM_EXERCISES) {
      expect(e.slug).toMatch(/^[a-z0-9-]+$/);
      expect(e.reason.length).toBeGreaterThan(20);
    }
    expect(slugs).toContain("bayesian-lat-pulldown");
  });

  it("no retired slug can be re-seeded: absent from Seed 011 data, its relations, and every seed source file", () => {
    const retired = new Set(RETIRED_SYSTEM_EXERCISES.map((e) => e.slug));
    expect(EXERCISES.filter((e) => retired.has(e.slug))).toEqual([]);
    expect(RELATIONS.filter(([a, b]) => retired.has(a) || retired.has(b))).toEqual([]);

    const seedDir = resolve(root, "scripts/seeds");
    const seedFiles = readdirSync(seedDir).filter((f) => f.endsWith(".ts")).map((f) => `scripts/seeds/${f}`);
    seedFiles.push("scripts/seed-exercises.ts");
    for (const file of seedFiles) {
      const text = source(file);
      for (const slug of retired) {
        // Only comments may mention it (the do-not-re-add note); never a quoted slug literal.
        expect(text.includes(`"${slug}"`), `${file} must not seed ${slug}`).toBe(false);
      }
    }
  });

  it("the intra-family relation chain remains connected after removal (neighbours still adjacent)", () => {
    const pairs = new Set(RELATIONS.map(([a, b, t]) => `${a}>${b}:${t}`));
    expect(pairs.has("cross-body-lat-pulldown>machine-lat-pulldown-neutral-grip:progression")).toBe(true);
  });
});

describe("retirement is an archive, not a delete", () => {
  const repairModule = source("scripts/repairs/retired-system-exercises.ts");
  it("only updates status to archived, only for scope='system' rows not already archived, and never issues a DELETE", () => {
    expect(repairModule).toContain("SET status = 'archived'");
    expect(repairModule).toContain("scope = 'system'");
    expect(repairModule).toContain("status <> 'archived'");
    expect(/\bDELETE\b/.test(repairModule.replace(/\/\/.*$/gm, ""))).toBe(false);
  });
});

describe("archived exercises cannot enter NEW generation", () => {
  it.each([
    ["lib/program-generator/exercise-candidates.ts", 1],
    ["lib/program-generator/exercise-resolution.ts", 2],
    ["lib/pil/substitution.ts", 1],
  ])("%s filters status = 'active' in its exercise queries", (file, minCount) => {
    const matches = source(file).match(/eq\(exercises\.status, "active"\)/g) ?? [];
    expect(matches.length).toBeGreaterThanOrEqual(minCount);
  });
});

describe("historical references stay valid after retirement", () => {
  it("workout_template_exercises.exercise_id is a RESTRICT foreign key to exercises (no cascade, no set-null)", () => {
    const cfg = getTableConfig(workoutTemplateExercises);
    const fk = cfg.foreignKeys
      .map((f) => f.reference())
      .find((r) => r.columns.some((c) => c.name === "exercise_id"));
    expect(fk).toBeDefined();
    expect(cfg.foreignKeys.find((f) => f.reference().columns.some((c) => c.name === "exercise_id"))?.onDelete).toBe("restrict");
  });

  it("the admin delete path refuses to delete an exercise referenced by any program blueprint", () => {
    expect(source("lib/db/exercise-admin-service.ts")).toContain("Exercise is referenced by one or more blueprints and cannot be deleted.");
  });
});
