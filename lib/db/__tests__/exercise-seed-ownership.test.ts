// ─────────────────────────────────────────────────────────────
// scripts/seeds/_shared.ts's seedExercises() — canonical ownership
// real-DB test suite
//
// Proves the ROOT-CAUSE fix directly, not just its downstream repair:
// the shared seed helper every scripts/seeds/0XX-*.ts file (and any
// future one) calls to insert canonical Exercise Library content now
// writes scope='system' and coach_created=false — never scope='coach'
// with created_by=NULL, which is exactly the shape that made Seed 011's
// 336 rows (and, before that, every earlier canonical seed) invisible
// to the AI Program Generator's tenant-scoped exercise resolution.
//
// This imports scripts/seeds/_shared.ts BY VALUE (not `import type`),
// which opens its own live DATABASE_URL_DIRECT connection as a module-
// evaluation side effect (see that file's own comment on this) — the
// same thing every seed CLI script already does when run for real.
// This is a deliberate, one-time exception to this repo's usual
// "read seed files as source text to avoid a side-effecting import"
// pattern (see canonical-seed-exercise-slugs.ts): proving the ACTUAL
// insert behavior requires actually calling the function that inserts,
// not just reading its source. The inserted row is a uniquely-slugged
// throwaway fixture, deleted in afterAll — this does not touch any
// real seed data.
// ─────────────────────────────────────────────────────────────

import { describe, it, expect, afterAll } from "vitest";
import { randomUUID } from "crypto";
import { eq } from "drizzle-orm";
import { getDb } from "../client";
import { exercises } from "../schema-exercise";
import { seedExercises, sql as sharedSeedSql } from "../../../scripts/seeds/_shared";

const db = getDb();
const insertedExerciseIds: string[] = [];

afterAll(async () => {
  if (insertedExerciseIds.length > 0) {
    for (const id of insertedExerciseIds) {
      await db.delete(exercises).where(eq(exercises.id, id));
    }
  }
  // _shared.ts's own connection, opened as a side effect of importing
  // it above — end it explicitly, same as every seed CLI script does.
  await sharedSeedSql.end();
});

describe("seedExercises() — canonical ownership semantics", () => {
  it("inserts a canonical exercise as scope='system', coach_created=false — never scope='coach' with created_by=NULL", async () => {
    const fakeSlug = `test-seed-ownership-${randomUUID().slice(0, 8)}`;

    await seedExercises(
      [
        {
          slug: fakeSlug,
          name: `Seed Ownership Test — ${fakeSlug}`,
          movementPattern: "push_horizontal",
          classification: "compound",
          difficulty: "beginner",
          fatigueCost: 5,
          technicalComplexity: 5,
          stabilityDemand: 5,
        },
      ],
      new Map(),
      [],
      [],
      [],
      [],
      "ownership test",
    );

    const [row] = await db.select().from(exercises).where(eq(exercises.slug, fakeSlug)).limit(1);
    expect(row).toBeDefined();
    insertedExerciseIds.push(row.id);

    // The exact defect: before the fix, this row would have landed as
    // scope='coach' (the column default) with created_by=NULL (also
    // the default — seedExercises() never set either), invisible to
    // every coach under the AI Program Generator's tenant-scoped
    // resolution. Any FUTURE seed file that calls this same shared
    // helper — there is no other production path that inserts
    // canonical library content — automatically gets this fix; there
    // is no per-seed-file opt-in required, which is exactly why the
    // defect could recur silently across 001 through 011 in the first
    // place once it existed in this one shared function.
    expect(row.scope).toBe("system");
    expect(row.coachCreated).toBe(false);
    expect(row.createdBy).toBeNull();
  });
});
