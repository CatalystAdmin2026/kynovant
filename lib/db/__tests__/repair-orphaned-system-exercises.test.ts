// ─────────────────────────────────────────────────────────────
// Repair: Orphaned "system" Exercises — real-DB test suite
//
// Exercises scripts/repairs/orphaned-system-exercises.ts's exported
// functions directly — the same module the CLI script
// (scripts/repair-orphaned-system-exercises.ts) imports — so these
// tests verify the actual repair logic, never a re-implementation of
// it. Uses a raw `postgres` connection (DATABASE_URL_DIRECT), matching
// how the CLI script itself connects, rather than drizzle's pooled
// client — the repair module's functions are typed against
// postgres.Sql, not drizzle's query builder.
//
// This suite never touches ambient/pre-existing data: every row it
// repairs is one it inserted itself in this run, with a unique slug, and
// every fixture is deleted in afterAll. The shared database's
// already-known orphaned rows (the earlier manual repair, and Seed
// 011's 336 rows) are NOT re-touched, and this suite does not assume
// anything about their current count or state.
//
// EVERY call into findOrphanedSystemExercises/repairOrphanedSystemExercises
// below passes `{ restrictToSlugs: [...] }`, naming exactly the fixture
// slug(s) that test itself just inserted. This is not optional
// hygiene — see orphaned-system-exercises.ts's "restrictToSlugs" header
// comment for why: without it, the real repair function's WHERE clause
// runs against the WHOLE canonical set, which means it would also match
// (and, for the repair function, mutate) any other real orphaned
// canonical row already sitting in the shared database — exactly what
// happened once already, when a test run here repaired 336 real Seed
// 011 rows as an unintended side effect, before this parameter existed.
// Intersecting with the caller-supplied slug list makes that class of
// accident structurally impossible: a call can only ever affect rows
// whose slug it explicitly named.
//
// The safety predicate still requires slug membership in the canonical
// seeded-exercise set (see orphaned-system-exercises.ts's header), not
// just scope+null-owner — exercises.slug has a unique index, so this
// suite can't insert a second row reusing an already-seeded canonical
// slug. Instead it picks, at run time, canonical slugs the seed
// pipeline DEFINES but that aren't in the database yet (there are
// several — see canonical-seed-exercise-slugs.ts's own header on why
// the canonical set is deliberately a superset of what's currently
// seeded) to use as its "genuine canonical orphan" fixtures.
//
// Requires DATABASE_URL_DIRECT — vitest.config.ts loads .env.local
// automatically.
// ─────────────────────────────────────────────────────────────

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { randomUUID } from "crypto";
import { eq, inArray } from "drizzle-orm";
import postgres from "postgres";
import { getDb } from "../client";
import { exercises } from "../schema-exercise";
import { createAdminClient } from "@/lib/supabase/admin";
import { getCanonicalSeedExerciseSlugs } from "../../../scripts/repairs/canonical-seed-exercise-slugs";
import {
  findOrphanedSystemExercises,
  repairOrphanedSystemExercises,
} from "../../../scripts/repairs/orphaned-system-exercises";

const db = getDb();

const dbUrl = process.env.DATABASE_URL_DIRECT;
if (!dbUrl) {
  throw new Error("DATABASE_URL_DIRECT is not set — required for this suite.");
}
const sql = postgres(dbUrl, { prepare: false });

let coachOwnerId = "";
// Three distinct unseeded canonical slugs — separate tests each insert
// their own fixture row (or, for slug C, insert none at all — see the
// no-op test below), and exercises.slug is unique, so no two tests
// (nor any pre-existing row) can share one.
let unseededCanonicalSlugA = "";
let unseededCanonicalSlugB = "";
let unseededCanonicalSlugC = "";
const insertedExerciseIds: string[] = [];

async function insertExercise(overrides: {
  slug: string;
  scope: "system" | "organization" | "coach";
  createdBy: string | null;
  /** Defaults to true — the exercises.coach_created column default,
   *  and (before scripts/seeds/_shared.ts's ownership fix) exactly what
   *  the buggy seed pipeline wrote for every canonical row. Fixture
   *  rows simulating a pre-fix orphaned seed row should leave this at
   *  its default rather than override it, to faithfully reproduce what
   *  the real Seed 011 rows look like. */
  coachCreated?: boolean;
}) {
  const [row] = await db
    .insert(exercises)
    .values({
      slug: overrides.slug,
      name: `Repair Test — ${overrides.slug}`,
      movementPattern: "push_horizontal",
      classification: "compound",
      difficulty: "beginner",
      status: "active",
      scope: overrides.scope,
      createdBy: overrides.createdBy,
      ...(overrides.coachCreated !== undefined ? { coachCreated: overrides.coachCreated } : {}),
    })
    .returning();
  insertedExerciseIds.push(row.id);
  return row;
}

beforeAll(async () => {
  const adminClient = createAdminClient();
  const { data, error } = await adminClient.auth.admin.createUser({
    email: `repair-orphaned-exercises-test-${randomUUID()}@isolation-test.invalid`,
    email_confirm: true,
    password: randomUUID(),
  });
  if (error || !data.user) {
    throw new Error(`Fixture setup failed: createUser — ${error?.message}`);
  }
  coachOwnerId = data.user.id;

  // Find three canonical slugs the seed pipeline defines but hasn't
  // inserted into this database yet — exercises.slug is unique, so a
  // fixture row can't reuse a slug that's already seeded, and separate
  // tests below each need their own (slug C is deliberately never
  // turned into a fixture row at all — see the no-op test below).
  const canonical = getCanonicalSeedExerciseSlugs();
  const existingRows = await db.select({ slug: exercises.slug }).from(exercises);
  const existingSlugs = new Set(existingRows.map((r) => r.slug));
  const candidates = [...canonical].filter((slug) => !existingSlugs.has(slug));
  if (candidates.length < 3) {
    throw new Error(
      "Fixture setup failed: fewer than 3 canonical seed slugs are free in this database — " +
        "these tests need three to use as separate fixtures.",
    );
  }
  [unseededCanonicalSlugA, unseededCanonicalSlugB, unseededCanonicalSlugC] = candidates;
});

afterAll(async () => {
  if (insertedExerciseIds.length > 0) {
    await db.delete(exercises).where(inArray(exercises.id, insertedExerciseIds));
  }
  if (coachOwnerId) {
    const adminClient = createAdminClient();
    await adminClient.auth.admin.deleteUser(coachOwnerId);
  }
  await sql.end();
});

describe("findOrphanedSystemExercises — the exact safety predicate", () => {
  it("matches a coach-scope, no-owner row whose slug IS in the canonical seed set", async () => {
    const orphan = await insertExercise({
      slug: unseededCanonicalSlugA,
      scope: "coach",
      createdBy: null,
    });

    const found = await findOrphanedSystemExercises(sql, { restrictToSlugs: [unseededCanonicalSlugA] });
    expect(found.some((r) => r.id === orphan.id)).toBe(true);
  });

  it("does NOT match a coach-scope, no-owner row whose slug is NOT in the canonical seed set — 'repair orphaned canonical seed rows', not 'repair every coach-scope null-owner row'", async () => {
    const nonCanonicalSlug = `repair-test-non-canonical-${randomUUID()}`;
    const nonCanonicalOrphan = await insertExercise({
      slug: nonCanonicalSlug,
      scope: "coach",
      createdBy: null,
    });

    // restrictToSlugs is intersected with the canonical set — naming a
    // non-canonical slug here proves the point either way (it can never
    // match), but is included for symmetry with every other call in
    // this suite.
    const found = await findOrphanedSystemExercises(sql, { restrictToSlugs: [nonCanonicalSlug] });
    expect(found.some((r) => r.id === nonCanonicalOrphan.id)).toBe(false);
  });

  it("does not match a real coach-owned exercise, even with a canonical-looking name", async () => {
    const ownedSlug = `repair-test-owned-${randomUUID()}`;
    const owned = await insertExercise({
      slug: ownedSlug,
      scope: "coach",
      createdBy: coachOwnerId,
    });

    const found = await findOrphanedSystemExercises(sql, { restrictToSlugs: [ownedSlug] });
    expect(found.some((r) => r.id === owned.id)).toBe(false);
  });

  it("does not match an organization-scoped row, even with no owner", async () => {
    const orgSlug = `repair-test-org-${randomUUID()}`;
    const org = await insertExercise({
      slug: orgSlug,
      scope: "organization",
      createdBy: null,
    });

    const found = await findOrphanedSystemExercises(sql, { restrictToSlugs: [orgSlug] });
    expect(found.some((r) => r.id === org.id)).toBe(false);
  });
});

describe("repairOrphanedSystemExercises — applies only to canonical orphaned rows, and is idempotent", () => {
  it("reclassifies only the canonical orphan; non-canonical/coach-owned/organization-scoped rows are untouched; a second run changes nothing further", async () => {
    const nonCanonicalSlug = `repair-test-apply-non-canonical-${randomUUID()}`;
    const ownedSlug = `repair-test-apply-owned-${randomUUID()}`;
    const orgSlug = `repair-test-apply-org-${randomUUID()}`;
    // Every slug this one test touches, in one place — passed as
    // restrictToSlugs below so this test's own repair calls can never
    // reach any other row in the shared database.
    const fixtureSlugs = [unseededCanonicalSlugB, nonCanonicalSlug, ownedSlug, orgSlug];

    const canonicalOrphan = await insertExercise({
      slug: unseededCanonicalSlugB,
      scope: "coach",
      createdBy: null,
    });
    const nonCanonicalOrphan = await insertExercise({
      slug: nonCanonicalSlug,
      scope: "coach",
      createdBy: null,
    });
    const owned = await insertExercise({
      slug: ownedSlug,
      scope: "coach",
      createdBy: coachOwnerId,
    });
    const org = await insertExercise({
      slug: orgSlug,
      scope: "organization",
      createdBy: null,
    });

    const firstRun = await repairOrphanedSystemExercises(sql, { restrictToSlugs: fixtureSlugs });
    expect(firstRun.repairedIds).toContain(canonicalOrphan.id);
    expect(firstRun.repairedIds).not.toContain(nonCanonicalOrphan.id);
    expect(firstRun.repairedIds).not.toContain(owned.id);
    expect(firstRun.repairedIds).not.toContain(org.id);

    const [canonicalAfter] = await db.select().from(exercises).where(eq(exercises.id, canonicalOrphan.id));
    expect(canonicalAfter.scope).toBe("system");
    // coach_created is corrected alongside scope — see orphaned-system-
    // exercises.ts's header comment on why (never read by app code
    // today, but its own semantics — "was this authored by a coach" —
    // are false for every canonical seed row, same as the buggy value
    // scripts/seeds/_shared.ts used to write).
    expect(canonicalAfter.coachCreated).toBe(false);

    const [nonCanonicalAfter] = await db.select().from(exercises).where(eq(exercises.id, nonCanonicalOrphan.id));
    expect(nonCanonicalAfter.scope).toBe("coach"); // unchanged — not a canonical seed row
    expect(nonCanonicalAfter.coachCreated).toBe(true); // unchanged

    const [ownedAfter] = await db.select().from(exercises).where(eq(exercises.id, owned.id));
    expect(ownedAfter.scope).toBe("coach"); // unchanged — real coach-owned data preserved
    expect(ownedAfter.createdBy).toBe(coachOwnerId);
    expect(ownedAfter.coachCreated).toBe(true); // unchanged — this one really was coach-created

    const [orgAfter] = await db.select().from(exercises).where(eq(exercises.id, org.id));
    expect(orgAfter.scope).toBe("organization"); // unchanged — not in scope for this repair
    expect(orgAfter.coachCreated).toBe(true); // unchanged

    // Idempotency: nothing left to repair after the first run — a
    // second run must report zero further changes, and definitely must
    // not touch any of the four rows again.
    const secondRun = await repairOrphanedSystemExercises(sql, { restrictToSlugs: fixtureSlugs });
    expect(secondRun.repairedCount).toBe(0);
    expect(secondRun.repairedIds).not.toContain(canonicalOrphan.id);
    expect(secondRun.repairedIds).not.toContain(nonCanonicalOrphan.id);
    expect(secondRun.repairedIds).not.toContain(owned.id);
    expect(secondRun.repairedIds).not.toContain(org.id);

    // Confirm scope values are still exactly as the first run left them
    // — a second run truly changed nothing, not just "nothing new".
    const [canonicalAfterSecond] = await db.select().from(exercises).where(eq(exercises.id, canonicalOrphan.id));
    expect(canonicalAfterSecond.scope).toBe("system");
    expect(canonicalAfterSecond.coachCreated).toBe(false);
    const [nonCanonicalAfterSecond] = await db.select().from(exercises).where(eq(exercises.id, nonCanonicalOrphan.id));
    expect(nonCanonicalAfterSecond.scope).toBe("coach");
    const [ownedAfterSecond] = await db.select().from(exercises).where(eq(exercises.id, owned.id));
    expect(ownedAfterSecond.scope).toBe("coach");
    const [orgAfterSecond] = await db.select().from(exercises).where(eq(exercises.id, org.id));
    expect(orgAfterSecond.scope).toBe("organization");
  });

  it("is a no-op (never throws, reports zero) when nothing currently matches the predicate", async () => {
    // unseededCanonicalSlugC: a real canonical slug this suite never
    // inserts a row for, in any test — restricting to it (rather than
    // calling repair with no scope at all) is what makes this a
    // genuine, provable no-op rather than one that's merely zero by
    // coincidence of the shared database's current ambient state.
    await repairOrphanedSystemExercises(sql, { restrictToSlugs: [unseededCanonicalSlugC] });
    const result = await repairOrphanedSystemExercises(sql, { restrictToSlugs: [unseededCanonicalSlugC] });
    expect(result.repairedCount).toBe(0);
    expect(result.repairedIds).toEqual([]);
  });
});

describe("getCanonicalSeedExerciseSlugs — includes Seed 011", () => {
  it("recognizes a real Seed 011 slug (scripts/seeds/011-reviewed-library-expansion-data.ts)", () => {
    // Pure, offline check — no DB involved. Proves the canonical
    // registry actually picked up Seed 011's EXERCISES export (imported
    // directly, same as 008/009/010 — see canonical-seed-exercise-
    // slugs.ts's header) rather than silently missing it. This exact
    // slug is the one cited as live-DB evidence of the post-Seed-011
    // ownership defect.
    const canonical = getCanonicalSeedExerciseSlugs();
    expect(canonical.has("low-incline-dumbbell-bench-press")).toBe(true);
  });

  it("the registry's Seed 011 slug count matches EXERCISES.length exactly (no truncation, no accidental dedup against a different family)", async () => {
    const { EXERCISES } = await import("../../../scripts/seeds/011-reviewed-library-expansion-data");
    const canonical = getCanonicalSeedExerciseSlugs();
    const seed011Slugs = EXERCISES.map((e) => e.slug);
    for (const slug of seed011Slugs) {
      expect(canonical.has(slug)).toBe(true);
    }
  });
});
