// ─────────────────────────────────────────────────────────────
// Exercise Library — alternate_names integrity regression suite
//
// Four production rows (Barbell Curl, Face Pull, Cable Curl (Straight
// Bar), Dumbbell Chest Fly) had alternate_names stored as a double-
// encoded JSON string ("[\"...\"]") instead of a real jsonb array,
// repaired directly in the database. Root cause: scripts/repair-
// exercise-ai-vocabulary-aliases.ts called JSON.stringify() on a real
// array before interpolating it into a raw `postgres` package tagged
// template targeting a jsonb column — the postgres package serializes
// any bound parameter targeting a jsonb column itself, so the
// already-stringified value was serialized a second time. Every other
// write path (Drizzle inserts/updates) was unaffected — this suite
// proves that remains true, and that the two defenses added alongside
// the fix (schema .$type<string[]>() + exercise-admin-service.ts's
// runtime guard) actually reject a malformed value rather than
// silently persisting it.
//
// Real DB connection required — vitest.config.ts loads .env.local.
// ─────────────────────────────────────────────────────────────

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { randomUUID } from "crypto";
import { eq, inArray } from "drizzle-orm";
import postgres from "postgres";
import { getDb } from "../client";
import { exercises } from "../schema-exercise";
import { users } from "../schema";
import { createExercise, updateExercise } from "../exercise-admin-service";

const db = getDb();
const createdExerciseIds: string[] = [];
let realUserId = "";

function fixtureSlug(label: string): string {
  return `alt-names-integrity-test-${label}-${randomUUID()}`;
}

beforeAll(async () => {
  // exercises.createdBy has a real FK to users.id — reuse whatever
  // real user already exists rather than provisioning a throwaway auth
  // user for a suite that isn't testing ownership. Read-only, nothing
  // to clean up.
  const [anyUser] = await db.select({ id: users.id }).from(users).limit(1);
  if (!anyUser) throw new Error("Fixture setup failed: no user rows exist to satisfy exercises.created_by's FK.");
  realUserId = anyUser.id;
});

afterAll(async () => {
  if (createdExerciseIds.length > 0) {
    await db.delete(exercises).where(inArray(exercises.id, createdExerciseIds));
  }
});

describe("createExercise / updateExercise — reject a double-encoded string", () => {
  it("createExercise throws when alternateNames is a JSON-encoded string instead of an array", async () => {
    const doubleEncoded = JSON.stringify(["Barbell Bicep Curl"]);
    expect(typeof doubleEncoded).toBe("string");

    await expect(
      createExercise({
        name: "Integrity Test Exercise",
        slug: fixtureSlug("create-reject"),
        movementPattern: "push_horizontal",
        classification: "compound",
        difficulty: "beginner",
        createdBy: randomUUID(),
        // Cast bypasses the schema's own .$type<string[]>() the same
        // way the historical bug's actual writer did — a raw, unchecked
        // value from outside Drizzle's type system (e.g. an
        // unvalidated request body).
        alternateNames: doubleEncoded as unknown as string[],
      }),
    ).rejects.toThrow(/must be an array/i);
  });

  it("updateExercise throws when alternateNames is a JSON-encoded string instead of an array", async () => {
    const [row] = await db
      .insert(exercises)
      .values({
        slug: fixtureSlug("update-reject"),
        name: "Integrity Test Exercise",
        movementPattern: "push_horizontal",
        classification: "compound",
        difficulty: "beginner",
        status: "active",
        alternateNames: ["Existing Real Alias"],
      })
      .returning({ id: exercises.id });
    createdExerciseIds.push(row.id);

    const doubleEncoded = JSON.stringify(["Barbell Bicep Curl"]);
    await expect(
      updateExercise(row.id, { alternateNames: doubleEncoded as unknown as string[] }),
    ).rejects.toThrow(/must be an array/i);

    // The reject must be all-or-nothing — the existing, valid value is
    // still there, untouched.
    const [after] = await db.select({ alternateNames: exercises.alternateNames }).from(exercises).where(eq(exercises.id, row.id));
    expect(after.alternateNames).toEqual(["Existing Real Alias"]);
  });

  it("createExercise throws when an array element itself is not a string", async () => {
    await expect(
      createExercise({
        name: "Integrity Test Exercise",
        slug: fixtureSlug("create-reject-element"),
        movementPattern: "push_horizontal",
        classification: "compound",
        difficulty: "beginner",
        createdBy: randomUUID(),
        alternateNames: [123 as unknown as string],
      }),
    ).rejects.toThrow(/must contain only strings/i);
  });
});

describe("createExercise / updateExercise — a real array is stored correctly", () => {
  it("['Barbell Bicep Curl'] is stored as a real jsonb array, never as the string '[\"Barbell Bicep Curl\"]'", async () => {
    const exercise = await createExercise({
      name: "Integrity Test Exercise",
      slug: fixtureSlug("create-accept"),
      movementPattern: "push_horizontal",
      classification: "compound",
      difficulty: "beginner",
      createdBy: realUserId,
      alternateNames: ["Barbell Bicep Curl"],
    });
    createdExerciseIds.push(exercise.id);

    expect(Array.isArray(exercise.alternateNames)).toBe(true);
    expect(exercise.alternateNames).toEqual(["Barbell Bicep Curl"]);
    expect(exercise.alternateNames).not.toBe(JSON.stringify(["Barbell Bicep Curl"]));

    // Assert against the real column type at the database level, not
    // just what Drizzle happens to hand back in JS — jsonb_typeof is
    // the ground truth the production corruption was actually detected
    // with.
    const raw = postgres(process.env.DATABASE_URL!, { prepare: false });
    try {
      const [row] = await raw`
        SELECT jsonb_typeof(alternate_names) AS type
        FROM exercises
        WHERE id = ${exercise.id}
      `;
      expect(row.type).toBe("array");
    } finally {
      await raw.end();
    }
  });

  it("updateExercise persists a real array update correctly", async () => {
    const [row] = await db
      .insert(exercises)
      .values({
        slug: fixtureSlug("update-accept"),
        name: "Integrity Test Exercise",
        movementPattern: "push_horizontal",
        classification: "compound",
        difficulty: "beginner",
        status: "active",
        alternateNames: [],
      })
      .returning({ id: exercises.id });
    createdExerciseIds.push(row.id);

    const updated = await updateExercise(row.id, { alternateNames: ["Cable Bicep Curl", "Straight-Bar Cable Curl"] });
    expect(updated?.alternateNames).toEqual(["Cable Bicep Curl", "Straight-Bar Cable Curl"]);

    const raw = postgres(process.env.DATABASE_URL!, { prepare: false });
    try {
      const [check] = await raw`SELECT jsonb_typeof(alternate_names) AS type FROM exercises WHERE id = ${row.id}`;
      expect(check.type).toBe("array");
    } finally {
      await raw.end();
    }
  });
});

describe("raw postgres writer — the fixed repair-script pattern", () => {
  it("sql.json(array) produces a real jsonb array; manual JSON.stringify(array) does not", async () => {
    const raw = postgres(process.env.DATABASE_URL!, { prepare: false });
    try {
      const [row] = await db
        .insert(exercises)
        .values({
          slug: fixtureSlug("raw-writer"),
          name: "Integrity Test Exercise",
          movementPattern: "push_horizontal",
          classification: "compound",
          difficulty: "beginner",
          status: "active",
          alternateNames: [],
        })
        .returning({ id: exercises.id });
      createdExerciseIds.push(row.id);

      const aliases = ["Barbell Bicep Curl", "Barbell Biceps Curl"];

      // The fixed pattern — scripts/repair-exercise-ai-vocabulary-aliases.ts
      // now writes exactly this.
      await raw`UPDATE exercises SET alternate_names = ${raw.json(aliases)} WHERE id = ${row.id}`;
      const [fixed] = await raw`SELECT alternate_names, jsonb_typeof(alternate_names) AS type FROM exercises WHERE id = ${row.id}`;
      expect(fixed.type).toBe("array");
      expect(fixed.alternate_names).toEqual(aliases);

      // The historical bug, reproduced directly against a disposable
      // fixture row (not a real exercise) to document exactly what
      // going back to the old pattern would do — this is what
      // corrupted the four production rows.
      await raw`UPDATE exercises SET alternate_names = ${JSON.stringify(aliases)}::jsonb WHERE id = ${row.id}`;
      const [broken] = await raw`SELECT alternate_names, jsonb_typeof(alternate_names) AS type FROM exercises WHERE id = ${row.id}`;
      expect(broken.type).toBe("string");
      expect(broken.alternate_names).toBe(JSON.stringify(aliases));

      // Restore a valid array before cleanup deletes the row anyway —
      // leaves no ambiguity about final state if this test is ever run
      // with afterAll disabled for debugging.
      await raw`UPDATE exercises SET alternate_names = ${raw.json(aliases)} WHERE id = ${row.id}`;
    } finally {
      await raw.end();
    }
  });
});
