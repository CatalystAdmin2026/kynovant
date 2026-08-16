// ─────────────────────────────────────────────────────────────
// Exercise Resolution — real-DB test suite
//
// Requires a reachable DATABASE_URL — vitest.config.ts loads .env.local
// automatically. Reads only (this suite never inserts/mutates
// exercises rows — see program-generator-integration.test.ts for the
// ambiguous-blocks-approval scenario, which needs a temporary
// duplicate-name fixture and therefore lives alongside the existing
// coach/draft fixture rig instead of here).
// ─────────────────────────────────────────────────────────────

import { describe, it, expect, beforeAll } from "vitest";
import { randomUUID } from "crypto";
import { and, asc, eq } from "drizzle-orm";
import { getDb } from "@/lib/db/client";
import { exercises } from "@/lib/db/schema-exercise";
import {
  resolveExerciseNames,
  resolveProgramDraftExercises,
  normalizeExerciseName,
} from "../exercise-resolution";
import type { ModelProgramDraft } from "../contracts";

const db = getDb();

// A resolver call now requires a coachId (tenant-scoping — see
// exercise-resolution.ts). This suite never creates coach-owned
// exercises and its own fixture query below is scoped to scope='system'
// only, so every row it reads is visible to everyone — this id exists
// purely to exercise that the parameter is threaded through, not to
// gate visibility of anything in this file. It is deliberately a
// random, unrelated coach: resolveExerciseNames() must resolve a
// scope='system' row for ANY coachId, so a random id is actually a
// stronger check than reusing a real fixture coach's id here.
const TEST_COACH_ID = randomUUID();

let sampleExerciseId: string;
let sampleExerciseName: string;
let secondSampleExerciseName: string;
let alternateNameFixture: { canonicalId: string; canonicalName: string; alternateName: string } | null = null;
let activeNameSet: Set<string>;

beforeAll(async () => {
  // ROOT CAUSE (fixed here): this used to select every status='active'
  // row with no scope filter and no ORDER BY, then take rows[0]/rows[1]
  // as "the" sample exercises. Postgres makes no ordering guarantee for
  // an unordered SELECT, and — more importantly — scope='coach' rows
  // (private fixtures belonging to a specific coach, created by other
  // suites such as program-generator-integration.test.ts) were eligible
  // to be selected. resolveExerciseNames() correctly refuses to resolve
  // a scope='coach' exercise for TEST_COACH_ID (a random, unrelated
  // coach) — that's tenant isolation working as designed, not a bug —
  // but it meant this suite's "exact match" assertions could
  // nondeterministically fail whenever rows[0]/rows[1] happened to land
  // on a leaked private fixture instead of a real system exercise. The
  // fix is scoping fixture SELECTION here to scope='system' (the only
  // scope this suite's own doc comment already claimed to be reading)
  // plus a deterministic ORDER BY — never touching
  // resolveExerciseNames()'s actual tenant-isolation behavior.
  const rows = await db
    .select({ id: exercises.id, name: exercises.name, alternateNames: exercises.alternateNames })
    .from(exercises)
    .where(and(eq(exercises.status, "active"), eq(exercises.scope, "system")))
    .orderBy(asc(exercises.id));

  if (rows.length < 2) {
    throw new Error("Fixture setup failed: need at least 2 active scope='system' exercises seeded to run this suite.");
  }

  sampleExerciseId = rows[0].id;
  sampleExerciseName = rows[0].name;
  secondSampleExerciseName = rows[1].name;
  activeNameSet = new Set(rows.map((r) => normalizeExerciseName(r.name)));

  const withAlt = rows.find((r) => {
    const alt = r.alternateNames;
    return Array.isArray(alt) && alt.length > 0 && typeof alt[0] === "string";
  });
  if (withAlt) {
    const alt = withAlt.alternateNames as string[];
    alternateNameFixture = {
      canonicalId: withAlt.id,
      canonicalName: withAlt.name,
      alternateName: alt[0],
    };
  }
});

function buildModelDraft(exerciseNames: string[]): ModelProgramDraft {
  return {
    name: "Resolution Test Draft",
    category: "muscle_growth",
    experienceLevel: "intermediate",
    defaultDurationWeeks: exerciseNames.length,
    recommendedDaysPerWeek: 1,
    weeks: exerciseNames.map((name, i) => ({
      id: randomUUID(),
      weekNumber: i + 1,
      days: [
        {
          id: randomUUID(),
          dayOfWeek: 1,
          workout: {
            id: randomUUID(),
            name: `Week ${i + 1} Session`,
            sections: [
              {
                id: randomUUID(),
                name: "Main",
                sectionType: "main_lift",
                orderIndex: 0,
                prescriptions: [
                  { id: randomUUID(), exerciseName: name, orderIndex: 0, isRequired: true },
                ],
              },
            ],
          },
        },
      ],
    })),
  };
}

describe("resolveExerciseNames — matching tiers", () => {
  it("resolves an exact canonical-name match, case/whitespace-insensitively", async () => {
    const results = await resolveExerciseNames([`  ${sampleExerciseName.toUpperCase()}  `], TEST_COACH_ID);
    const resolution = results.get(normalizeExerciseName(sampleExerciseName));
    expect(resolution?.outcome).toBe("exact");
    expect(resolution?.exerciseId).toBe(sampleExerciseId);
    expect(resolution?.exerciseName).toBe(sampleExerciseName);
  });

  it("resolves an exact alternate-name match to the canonical exercise", async () => {
    if (!alternateNameFixture) {
      // No seeded exercise currently has an alternate name — nothing to
      // assert against. Documented rather than silently skipped.
      console.warn("No active exercise with alternateNames found in seed data — alternate-name tier not exercised.");
      return;
    }
    const results = await resolveExerciseNames([alternateNameFixture.alternateName], TEST_COACH_ID);
    const resolution = results.get(normalizeExerciseName(alternateNameFixture.alternateName));
    expect(resolution?.outcome).toBe("alternate_name");
    expect(resolution?.exerciseId).toBe(alternateNameFixture.canonicalId);
    expect(resolution?.exerciseName).toBe(alternateNameFixture.canonicalName);
  });

  it("returns unresolved for a name matching nothing in the library, and never fabricates an id", async () => {
    const nonsenseName = `Zzyzx Nonexistent Movement ${randomUUID().slice(0, 8)}`;
    const results = await resolveExerciseNames([nonsenseName], TEST_COACH_ID);
    const resolution = results.get(normalizeExerciseName(nonsenseName));
    expect(resolution?.outcome).toBe("unresolved");
    expect(resolution?.exerciseId).toBeNull();
    // The specific failure mode this whole feature exists to prevent.
    expect(resolution?.exerciseId).not.toBe("00000000-0000-0000-0000-000000000000");
  });

  it("resolves each unique (normalized) name only once, reusing the result for every repeat", async () => {
    const repeated = [
      sampleExerciseName,
      sampleExerciseName.toUpperCase(),
      `  ${sampleExerciseName}  `,
      sampleExerciseName,
    ];
    const results = await resolveExerciseNames(repeated, TEST_COACH_ID);
    // One Map entry regardless of how many times the name (in any
    // casing/whitespace variant) appeared in the input.
    expect(results.size).toBe(1);
    const resolution = results.get(normalizeExerciseName(sampleExerciseName));
    expect(resolution?.exerciseId).toBe(sampleExerciseId);
  });

  it("deduplicates across an entire draft — the nil UUID never appears anywhere in the resolved output", async () => {
    const draft = buildModelDraft([
      sampleExerciseName,
      secondSampleExerciseName,
      sampleExerciseName, // repeat, different week
      sampleExerciseName, // repeat again
    ]);
    const resolved = await resolveProgramDraftExercises(draft, TEST_COACH_ID);

    const ids = resolved.weeks.flatMap((w) =>
      w.days.flatMap((d) => d.workout?.sections.flatMap((s) => s.prescriptions.map((p) => p.exerciseId)) ?? []),
    );
    expect(ids).not.toContain("00000000-0000-0000-0000-000000000000");
    expect(ids.every((id) => id !== null)).toBe(true);

    // Requirement: repeated exercises across weeks reuse the same
    // resolution result — every occurrence of sampleExerciseName
    // resolved to the exact same real id.
    const sampleIds = resolved.weeks
      .filter((_, i) => i === 0 || i === 2 || i === 3)
      .map((w) => w.days[0].workout!.sections[0].prescriptions[0].exerciseId);
    expect(new Set(sampleIds).size).toBe(1);
    expect(sampleIds[0]).toBe(sampleExerciseId);
  });

  it("resolves real generated exercise names against the seeded library where the name exists", async () => {
    const candidateNames = ["Incline Dumbbell Press", "Romanian Deadlift", "Leg Press", "Lat Pulldown"];
    const applicable = candidateNames.filter((n) => activeNameSet.has(normalizeExerciseName(n)));
    // "Where applicable" — the seeded catalog varies by environment; at
    // least SOME of these very common exercises are expected to exist,
    // but this suite doesn't hardcode which.
    if (applicable.length === 0) {
      console.warn("None of the sample real exercise names were found in the active seeded library.");
      return;
    }

    const results = await resolveExerciseNames(applicable, TEST_COACH_ID);
    for (const name of applicable) {
      const resolution = results.get(normalizeExerciseName(name));
      expect(resolution?.outcome).toBe("exact");
      expect(resolution?.exerciseId).toBeTruthy();
    }
  });
});
