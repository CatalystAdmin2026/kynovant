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
// already-known orphaned rows were repaired manually and separately
// (2026-08-05) — this suite does not re-touch them and does not assume
// anything about their current count.
//
// The safety predicate now requires slug membership in the canonical
// seeded-exercise set (see orphaned-system-exercises.ts's header), not
// just scope+null-owner — exercises.slug has a unique index, so this
// suite can't insert a second row reusing an already-seeded canonical
// slug. Instead it picks, at run time, one of the canonical slugs the
// seed pipeline DEFINES but that isn't in the database yet (there are
// several — see canonical-seed-exercise-slugs.ts's own header on why
// the canonical set is deliberately a superset of what's currently
// seeded) to use as its "genuine canonical orphan" fixture.
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
// Two distinct unseeded canonical slugs — separate tests each insert
// their own fixture row, and exercises.slug is unique, so no two tests
// (nor any pre-existing row) can share one.
let unseededCanonicalSlugA = "";
let unseededCanonicalSlugB = "";
const insertedExerciseIds: string[] = [];

async function insertExercise(overrides: {
  slug: string;
  scope: "system" | "organization" | "coach";
  createdBy: string | null;
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

  // Find two canonical slugs the seed pipeline defines but hasn't
  // inserted into this database yet — exercises.slug is unique, so a
  // fixture row can't reuse a slug that's already seeded, and separate
  // tests below each need their own.
  const canonical = getCanonicalSeedExerciseSlugs();
  const existingRows = await db.select({ slug: exercises.slug }).from(exercises);
  const existingSlugs = new Set(existingRows.map((r) => r.slug));
  const candidates = [...canonical].filter((slug) => !existingSlugs.has(slug));
  if (candidates.length < 2) {
    throw new Error(
      "Fixture setup failed: fewer than 2 canonical seed slugs are free in this database — " +
        "these tests need at least two to use as separate fixtures.",
    );
  }
  [unseededCanonicalSlugA, unseededCanonicalSlugB] = candidates;
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

    const found = await findOrphanedSystemExercises(sql);
    expect(found.some((r) => r.id === orphan.id)).toBe(true);
  });

  it("does NOT match a coach-scope, no-owner row whose slug is NOT in the canonical seed set — 'repair orphaned canonical seed rows', not 'repair every coach-scope null-owner row'", async () => {
    const nonCanonicalOrphan = await insertExercise({
      slug: `repair-test-non-canonical-${randomUUID()}`,
      scope: "coach",
      createdBy: null,
    });

    const found = await findOrphanedSystemExercises(sql);
    expect(found.some((r) => r.id === nonCanonicalOrphan.id)).toBe(false);
  });

  it("does not match a real coach-owned exercise, even with a canonical-looking name", async () => {
    const owned = await insertExercise({
      slug: `repair-test-owned-${randomUUID()}`,
      scope: "coach",
      createdBy: coachOwnerId,
    });

    const found = await findOrphanedSystemExercises(sql);
    expect(found.some((r) => r.id === owned.id)).toBe(false);
  });

  it("does not match an organization-scoped row, even with no owner", async () => {
    const org = await insertExercise({
      slug: `repair-test-org-${randomUUID()}`,
      scope: "organization",
      createdBy: null,
    });

    const found = await findOrphanedSystemExercises(sql);
    expect(found.some((r) => r.id === org.id)).toBe(false);
  });
});

describe("repairOrphanedSystemExercises — applies only to canonical orphaned rows, and is idempotent", () => {
  it("reclassifies only the canonical orphan; non-canonical/coach-owned/organization-scoped rows are untouched; a second run changes nothing further", async () => {
    const canonicalOrphan = await insertExercise({
      slug: unseededCanonicalSlugB,
      scope: "coach",
      createdBy: null,
    });
    const nonCanonicalOrphan = await insertExercise({
      slug: `repair-test-apply-non-canonical-${randomUUID()}`,
      scope: "coach",
      createdBy: null,
    });
    const owned = await insertExercise({
      slug: `repair-test-apply-owned-${randomUUID()}`,
      scope: "coach",
      createdBy: coachOwnerId,
    });
    const org = await insertExercise({
      slug: `repair-test-apply-org-${randomUUID()}`,
      scope: "organization",
      createdBy: null,
    });

    const firstRun = await repairOrphanedSystemExercises(sql);
    expect(firstRun.repairedIds).toContain(canonicalOrphan.id);
    expect(firstRun.repairedIds).not.toContain(nonCanonicalOrphan.id);
    expect(firstRun.repairedIds).not.toContain(owned.id);
    expect(firstRun.repairedIds).not.toContain(org.id);

    const [canonicalAfter] = await db.select().from(exercises).where(eq(exercises.id, canonicalOrphan.id));
    expect(canonicalAfter.scope).toBe("system");

    const [nonCanonicalAfter] = await db.select().from(exercises).where(eq(exercises.id, nonCanonicalOrphan.id));
    expect(nonCanonicalAfter.scope).toBe("coach"); // unchanged — not a canonical seed row

    const [ownedAfter] = await db.select().from(exercises).where(eq(exercises.id, owned.id));
    expect(ownedAfter.scope).toBe("coach"); // unchanged — real coach-owned data preserved
    expect(ownedAfter.createdBy).toBe(coachOwnerId);

    const [orgAfter] = await db.select().from(exercises).where(eq(exercises.id, org.id));
    expect(orgAfter.scope).toBe("organization"); // unchanged — not in scope for this repair

    // Idempotency: nothing left to repair after the first run — a
    // second run must report zero further changes, and definitely must
    // not touch any of the four rows again.
    const secondRun = await repairOrphanedSystemExercises(sql);
    expect(secondRun.repairedCount).toBe(0);
    expect(secondRun.repairedIds).not.toContain(canonicalOrphan.id);
    expect(secondRun.repairedIds).not.toContain(nonCanonicalOrphan.id);
    expect(secondRun.repairedIds).not.toContain(owned.id);
    expect(secondRun.repairedIds).not.toContain(org.id);

    // Confirm scope values are still exactly as the first run left them
    // — a second run truly changed nothing, not just "nothing new".
    const [canonicalAfterSecond] = await db.select().from(exercises).where(eq(exercises.id, canonicalOrphan.id));
    expect(canonicalAfterSecond.scope).toBe("system");
    const [nonCanonicalAfterSecond] = await db.select().from(exercises).where(eq(exercises.id, nonCanonicalOrphan.id));
    expect(nonCanonicalAfterSecond.scope).toBe("coach");
    const [ownedAfterSecond] = await db.select().from(exercises).where(eq(exercises.id, owned.id));
    expect(ownedAfterSecond.scope).toBe("coach");
    const [orgAfterSecond] = await db.select().from(exercises).where(eq(exercises.id, org.id));
    expect(orgAfterSecond.scope).toBe("organization");
  });

  it("is a no-op (never throws, reports zero) when nothing currently matches the predicate", async () => {
    // No orphaned fixture inserted in this test — whatever the table's
    // current state, calling repair twice in a row with no new orphan
    // in between must never report a change on the second call.
    await repairOrphanedSystemExercises(sql);
    const result = await repairOrphanedSystemExercises(sql);
    expect(result.repairedCount).toBe(0);
    expect(result.repairedIds).toEqual([]);
  });
});
