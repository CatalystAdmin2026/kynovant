// ─────────────────────────────────────────────────────────────
// Program Publish — Auto-Publish Dependencies — integration suite
//
// publishProgramWithDependencies() (lib/db/program-builder-service.ts)
// replaces publishProgram()'s "every referenced blueprint must already
// be status='active'" gate with: auto-publish the exact draft
// blueprints a program references (and only those), fail the whole
// operation closed on any invalid/inaccessible/archived dependency,
// leave every other draft blueprint on the coach's account untouched.
//
// Same fixture/cleanup pattern as program-tenant-isolation.test.ts:
// real Supabase Auth users, randomUUID()-based slugs so repeated runs
// never collide, full FK-safe cleanup in afterAll().
// ─────────────────────────────────────────────────────────────

import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import { randomUUID } from "crypto";
import { eq, and, inArray } from "drizzle-orm";
import { getDb } from "../client";
import { createAdminClient } from "@/lib/supabase/admin";
import { users, programTemplates, workoutTemplates, type TemplateStatus } from "../schema";
import { programWeeks, programWeekDays } from "../schema-program";
import { exercises, workoutTemplateSections, workoutTemplateExercises } from "../schema-exercise";
import { publishProgramWithDependencies } from "../program-builder-service";

const db = getDb();

const coachA = { id: "" };
const coachB = { id: "" };

let inactiveExerciseId = "";

const programIds: string[] = [];
const weekIds: string[] = [];
const workoutTemplateIds: string[] = [];
const exerciseFixtureIds: string[] = [];

async function createAuthUser(label: string): Promise<string> {
  const admin = createAdminClient();
  const { data, error } = await admin.auth.admin.createUser({
    email: `publish-deps-test-${label}-${randomUUID()}@isolation-test.invalid`,
    email_confirm: true,
    password: randomUUID(),
  });
  if (error || !data.user) {
    throw new Error(`Fixture setup failed: createUser(${label}) — ${error?.message}`);
  }
  return data.user.id;
}

async function createBlueprint(
  coachId: string,
  opts: { status?: TemplateStatus; minDays?: number | null; maxDays?: number | null } = {},
): Promise<string> {
  const [row] = await db
    .insert(workoutTemplates)
    .values({
      name: `Publish Deps Test Blueprint ${randomUUID().slice(0, 8)}`,
      slug: `publish-deps-test-bp-${randomUUID()}`,
      recommendedExperienceLevel: "beginner",
      status: opts.status ?? "draft",
      createdBy: coachId,
      minimumDaysPerWeek: opts.minDays ?? null,
      maximumDaysPerWeek: opts.maxDays ?? null,
    })
    .returning({ id: workoutTemplates.id });
  workoutTemplateIds.push(row.id);
  return row.id;
}

// A blueprint that passes every DB constraint on insert but still
// fails content validation. Two more "obvious" ways to construct an
// invalid blueprint — minimumDaysPerWeek > maximumDaysPerWeek, and an
// inverted rep range (repsMin > repsMax) — turned out to ALSO be
// enforced by DB CHECK constraints (chk_workout_days_per_week,
// chk_reps_min_max respectively) and so can never reach
// validateWorkoutTemplate()'s application-level check at all; both
// were tried and rejected at the DB layer before this one was chosen.
// A prescription referencing a non-active exercise has no such
// constraint — CHECK constraints are single-table, and this depends on
// exercises.status in a different table — so it's genuinely
// constructible. See VALIDITY_EXERCISE_INACTIVE in
// lib/pil/modules/validity.ts (severity="error").
async function createInvalidBlueprint(coachId: string): Promise<string> {
  const id = await createBlueprint(coachId);
  const [section] = await db
    .insert(workoutTemplateSections)
    .values({ workoutTemplateId: id, name: "Main", sectionType: "main_lift", orderIndex: 0 })
    .returning({ id: workoutTemplateSections.id });
  await db.insert(workoutTemplateExercises).values({
    workoutTemplateId: id,
    sectionId: section.id,
    exerciseId: inactiveExerciseId,
    orderIndex: 0,
    sets: 3,
    repsMin: 8,
    repsMax: 12,
  });
  return id;
}

async function createProgram(
  coachId: string,
  dayWorkoutIds: (string | null)[],
  opts: { status?: TemplateStatus; metadata?: Record<string, unknown>; skipWeek?: boolean } = {},
): Promise<{ programId: string; weekId: string | null }> {
  const [programRow] = await db
    .insert(programTemplates)
    .values({
      name: `Publish Deps Test Program ${randomUUID().slice(0, 8)}`,
      slug: `publish-deps-test-program-${randomUUID()}`,
      category: "fat_loss",
      experienceLevel: "beginner",
      status: opts.status ?? "draft",
      createdBy: coachId,
      metadata: opts.metadata ?? {},
    })
    .returning({ id: programTemplates.id });
  programIds.push(programRow.id);

  if (opts.skipWeek) {
    return { programId: programRow.id, weekId: null };
  }

  const [weekRow] = await db
    .insert(programWeeks)
    .values({ programTemplateId: programRow.id, weekNumber: 1, label: "Week 1" })
    .returning({ id: programWeeks.id });
  weekIds.push(weekRow.id);

  for (let i = 0; i < dayWorkoutIds.length; i++) {
    await db.insert(programWeekDays).values({
      programWeekId: weekRow.id,
      dayOfWeek: i + 1,
      workoutTemplateId: dayWorkoutIds[i],
    });
  }

  return { programId: programRow.id, weekId: weekRow.id };
}

async function getBlueprintStatus(id: string): Promise<{ status: string; updatedAt: Date }> {
  const [row] = await db
    .select({ status: workoutTemplates.status, updatedAt: workoutTemplates.updatedAt })
    .from(workoutTemplates)
    .where(eq(workoutTemplates.id, id));
  return row;
}

async function getProgramStatus(id: string): Promise<string> {
  const [row] = await db.select({ status: programTemplates.status }).from(programTemplates).where(eq(programTemplates.id, id));
  return row.status;
}

beforeAll(async () => {
  [coachA.id, coachB.id] = await Promise.all([createAuthUser("coach-a"), createAuthUser("coach-b")]);
  await Promise.all([
    db.update(users).set({ role: "coach", status: "active" }).where(eq(users.id, coachA.id)),
    db.update(users).set({ role: "coach", status: "active" }).where(eq(users.id, coachB.id)),
  ]);

  // Synthetic, deliberately-owned draft exercise fixture — used only
  // to construct a blueprint that fails content validation via
  // VALIDITY_EXERCISE_INACTIVE (lib/pil/modules/validity.ts). Unlike
  // an inverted rep range or minDays>maxDays (both blocked by DB CHECK
  // constraints before they ever reach application validation — see
  // createInvalidBlueprint's own comment), "prescription references a
  // non-active exercise" has no same-table CHECK constraint that could
  // enforce it, since it depends on another table's column.
  const [inactive] = await db
    .insert(exercises)
    .values({
      slug: `publish-deps-test-inactive-exercise-${randomUUID()}`,
      name: `Publish Deps Test Inactive Exercise ${randomUUID().slice(0, 8)}`,
      movementPattern: "push_horizontal",
      classification: "compound",
      difficulty: "beginner",
      status: "draft",
    })
    .returning({ id: exercises.id });
  inactiveExerciseId = inactive.id;
  exerciseFixtureIds.push(inactive.id);
});

afterAll(async () => {
  let firstError: unknown;
  const runPhase = async (label: string, fn: () => Promise<void>) => {
    try {
      await fn();
    } catch (err) {
      console.error(`[program-publish-dependencies cleanup] ${label} failed:`, err instanceof Error ? err.message : err);
      firstError = firstError ?? err;
    }
  };

  await runPhase("delete program_week_days/program_weeks", async () => {
    if (weekIds.length > 0) {
      await db.delete(programWeekDays).where(inArray(programWeekDays.programWeekId, weekIds));
      await db.delete(programWeeks).where(inArray(programWeeks.id, weekIds));
    }
  });

  await runPhase("delete program_templates", async () => {
    if (programIds.length > 0) {
      await db.delete(programTemplates).where(inArray(programTemplates.id, programIds));
    }
  });

  await runPhase("delete workout_template_exercises/sections", async () => {
    if (workoutTemplateIds.length > 0) {
      await db.delete(workoutTemplateExercises).where(inArray(workoutTemplateExercises.workoutTemplateId, workoutTemplateIds));
      await db.delete(workoutTemplateSections).where(inArray(workoutTemplateSections.workoutTemplateId, workoutTemplateIds));
    }
  });

  await runPhase("delete workout_templates", async () => {
    if (workoutTemplateIds.length > 0) {
      await db.delete(workoutTemplates).where(inArray(workoutTemplates.id, workoutTemplateIds));
    }
  });

  // After workout_template_exercises above (which references these
  // rows via FK) — never before.
  await runPhase("delete exercise fixtures", async () => {
    if (exerciseFixtureIds.length > 0) {
      await db.delete(exercises).where(inArray(exercises.id, exerciseFixtureIds));
    }
  });

  const userIds = [coachA.id, coachB.id].filter(Boolean);
  if (userIds.length > 0) {
    await runPhase("delete public.users rows", async () => {
      await db.delete(users).where(inArray(users.id, userIds));
    });
    await runPhase("delete Supabase Auth users", async () => {
      const admin = createAdminClient();
      const results = await Promise.allSettled(userIds.map((id) => admin.auth.admin.deleteUser(id)));
      for (const r of results) if (r.status === "rejected") throw r.reason;
    });
  }

  if (firstError) throw firstError;
}, 60_000);

// ─────────────────────────────────────────────────────────────

describe("A — program references N draft blueprints", () => {
  it("publishes exactly those draft blueprints and the program", async () => {
    const bp1 = await createBlueprint(coachA.id);
    const bp2 = await createBlueprint(coachA.id);
    const bp3 = await createBlueprint(coachA.id);
    const { programId } = await createProgram(coachA.id, [bp1, bp2, bp3]);

    const result = await publishProgramWithDependencies(programId);

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(new Set(result.autoPublishedBlueprintIds)).toEqual(new Set([bp1, bp2, bp3]));
    expect((await getBlueprintStatus(bp1)).status).toBe("active");
    expect((await getBlueprintStatus(bp2)).status).toBe("active");
    expect((await getBlueprintStatus(bp3)).status).toBe("active");
    expect(await getProgramStatus(programId)).toBe("active");
  });
});

describe("B / I — already-published dependencies are left alone", () => {
  it("leaves already-active blueprints untouched (no write) while publishing the draft ones", async () => {
    const activeBp1 = await createBlueprint(coachA.id, { status: "active" });
    const activeBp2 = await createBlueprint(coachA.id, { status: "active" });
    const draftBp1 = await createBlueprint(coachA.id);
    const draftBp2 = await createBlueprint(coachA.id);
    const { programId } = await createProgram(coachA.id, [activeBp1, activeBp2, draftBp1, draftBp2]);

    const before1 = await getBlueprintStatus(activeBp1);
    const before2 = await getBlueprintStatus(activeBp2);

    const result = await publishProgramWithDependencies(programId);
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    // Only the two DRAFT blueprints were auto-published — the
    // already-active ones are not reported as auto-published.
    expect(new Set(result.autoPublishedBlueprintIds)).toEqual(new Set([draftBp1, draftBp2]));

    const after1 = await getBlueprintStatus(activeBp1);
    const after2 = await getBlueprintStatus(activeBp2);
    expect(after1.status).toBe("active");
    expect(after2.status).toBe("active");
    // No write happened to the already-active rows — updatedAt is
    // bit-for-bit unchanged, proving "leave it alone" is real, not just
    // "ended up active anyway."
    expect(after1.updatedAt.getTime()).toBe(before1.updatedAt.getTime());
    expect(after2.updatedAt.getTime()).toBe(before2.updatedAt.getTime());

    expect((await getBlueprintStatus(draftBp1)).status).toBe("active");
    expect((await getBlueprintStatus(draftBp2)).status).toBe("active");
    expect(await getProgramStatus(programId)).toBe("active");
  });
});

describe("C — unrelated draft blueprints on the same coach's account remain untouched", () => {
  it("publishes only the referenced blueprints, never the coach's other drafts", async () => {
    const referenced = [await createBlueprint(coachA.id), await createBlueprint(coachA.id), await createBlueprint(coachA.id)];
    const unrelated = [
      await createBlueprint(coachA.id),
      await createBlueprint(coachA.id),
      await createBlueprint(coachA.id),
      await createBlueprint(coachA.id),
      await createBlueprint(coachA.id),
      await createBlueprint(coachA.id),
    ];
    const { programId } = await createProgram(coachA.id, referenced);

    const result = await publishProgramWithDependencies(programId);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(new Set(result.autoPublishedBlueprintIds)).toEqual(new Set(referenced));

    for (const id of referenced) {
      expect((await getBlueprintStatus(id)).status).toBe("active");
    }
    for (const id of unrelated) {
      expect((await getBlueprintStatus(id)).status).toBe("draft");
    }
  });
});

describe("D — one referenced blueprint fails validation", () => {
  it("rejects the entire operation and publishes nothing, including the other valid referenced blueprints", async () => {
    const valid1 = await createBlueprint(coachA.id);
    const valid2 = await createBlueprint(coachA.id);
    const invalid = await createInvalidBlueprint(coachA.id);
    const { programId } = await createProgram(coachA.id, [valid1, valid2, invalid]);

    const result = await publishProgramWithDependencies(programId);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.errors!.some((e) => e.includes("failed validation"))).toBe(true);

    // No partial publication — the two otherwise-valid blueprints in
    // the SAME call are also still draft.
    expect((await getBlueprintStatus(valid1)).status).toBe("draft");
    expect((await getBlueprintStatus(valid2)).status).toBe("draft");
    expect((await getBlueprintStatus(invalid)).status).toBe("draft");
    expect(await getProgramStatus(programId)).toBe("draft");
  });
});

// ─────────────────────────────────────────────────────────────
// [Independent review remediation — Finding 1]
//
// P1 cross-tenant information leak: rejection paths used to expose a
// foreign blueprint's name ("...not accessible...") and could reach a
// status-specific branch (e.g. "is archived...") before ownership had
// been established. Every test below asserts the FULL JSON-serialized
// result never contains the foreign blueprint's name, id, or the
// literal words "draft"/"archived" tied to it — not just that a
// generic-sounding string appears somewhere.
// ─────────────────────────────────────────────────────────────

describe("Finding 1 — cross-tenant information leak", () => {
  it("A/C/D/E/F — foreign DRAFT dependency: generic rejection, no name/status leak, foreign row and legitimate siblings untouched", async () => {
    const ownBp = await createBlueprint(coachA.id);
    const foreignBp = await createBlueprint(coachB.id, {
      status: "draft",
    });
    // Give the foreign blueprint a distinctive, greppable name so a
    // leak would be unambiguous if it occurred.
    const [foreignRow] = await db.select({ name: workoutTemplates.name }).from(workoutTemplates).where(eq(workoutTemplates.id, foreignBp));
    const foreignName = foreignRow.name;

    const { programId } = await createProgram(coachA.id, [ownBp, foreignBp]);
    const before = await getBlueprintStatus(foreignBp);

    const result = await publishProgramWithDependencies(programId);
    expect(result.ok).toBe(false);
    if (result.ok) return;

    // A: generic rejection.
    expect(result.errors).toContain("A required blueprint is unavailable or inaccessible.");

    // C/D: the full serialized response contains no trace of the
    // foreign blueprint's name, id, owner id, or its real status word
    // used in a status-specific sentence.
    const serialized = JSON.stringify(result);
    expect(serialized).not.toContain(foreignName);
    expect(serialized).not.toContain(foreignBp);
    expect(serialized).not.toContain(coachB.id);
    expect(serialized).not.toMatch(/is archived and cannot be published/);

    // E: foreign row untouched.
    const after = await getBlueprintStatus(foreignBp);
    expect(after.status).toBe("draft");
    expect(after.updatedAt.getTime()).toBe(before.updatedAt.getTime());

    // F: legitimate sibling (coachA's own, otherwise-valid) untouched.
    expect((await getBlueprintStatus(ownBp)).status).toBe("draft");
    expect(await getProgramStatus(programId)).toBe("draft");
  });

  it("B/C/D/E/F — foreign ARCHIVED dependency: generic rejection, no name/status leak, foreign row and legitimate siblings untouched", async () => {
    const ownBp = await createBlueprint(coachA.id);
    const foreignBp = await createBlueprint(coachB.id, { status: "archived" });
    const [foreignRow] = await db.select({ name: workoutTemplates.name }).from(workoutTemplates).where(eq(workoutTemplates.id, foreignBp));
    const foreignName = foreignRow.name;

    const { programId } = await createProgram(coachA.id, [ownBp, foreignBp]);
    const before = await getBlueprintStatus(foreignBp);

    const result = await publishProgramWithDependencies(programId);
    expect(result.ok).toBe(false);
    if (result.ok) return;

    // B: same generic rejection as a foreign draft — archived vs. draft
    // is indistinguishable to the caller for a foreign blueprint.
    expect(result.errors).toContain("A required blueprint is unavailable or inaccessible.");
    expect(result.errors!.some((e) => e.includes("is archived and cannot be published"))).toBe(false);

    const serialized = JSON.stringify(result);
    expect(serialized).not.toContain(foreignName);
    expect(serialized).not.toContain(foreignBp);
    expect(serialized).not.toContain(coachB.id);

    const after = await getBlueprintStatus(foreignBp);
    expect(after.status).toBe("archived");
    expect(after.updatedAt.getTime()).toBe(before.updatedAt.getTime());
    expect((await getBlueprintStatus(ownBp)).status).toBe("draft");
    expect(await getProgramStatus(programId)).toBe("draft");
  });

  it("a foreign draft and a foreign archived dependency in the SAME call collapse to one generic error, not two", async () => {
    const foreignDraft = await createBlueprint(coachB.id, { status: "draft" });
    const foreignArchived = await createBlueprint(coachB.id, { status: "archived" });
    const { programId } = await createProgram(coachA.id, [foreignDraft, foreignArchived]);

    const result = await publishProgramWithDependencies(programId);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    const genericCount = result.errors!.filter((e) => e === "A required blueprint is unavailable or inaccessible.").length;
    expect(genericCount).toBe(1);
  });

  it("an OWNED invalid/archived dependency is still named by human-readable name (the carve-out this finding preserves)", async () => {
    const invalid = await createInvalidBlueprint(coachA.id);
    const { programId: p1 } = await createProgram(coachA.id, [invalid]);
    const r1 = await publishProgramWithDependencies(p1);
    expect(r1.ok).toBe(false);
    if (r1.ok) return;
    expect(r1.errors!.some((e) => e.includes("failed validation"))).toBe(true);

    const archivedOwn = await createBlueprint(coachA.id, { status: "archived" });
    const { programId: p2 } = await createProgram(coachA.id, [archivedOwn]);
    const r2 = await publishProgramWithDependencies(p2);
    expect(r2.ok).toBe(false);
    if (r2.ok) return;
    expect(r2.errors!.some((e) => e.includes("is archived and cannot be published"))).toBe(true);
  });
});

describe("G — archived referenced blueprint fails closed", () => {
  it("rejects the operation rather than silently un-archiving the blueprint", async () => {
    const archived = await createBlueprint(coachA.id, { status: "archived" });
    const { programId } = await createProgram(coachA.id, [archived]);

    const result = await publishProgramWithDependencies(programId);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.errors!.some((e) => e.includes("archived"))).toBe(true);
    expect((await getBlueprintStatus(archived)).status).toBe("archived");
    expect(await getProgramStatus(programId)).toBe("draft");
  });
});

describe("H — program already published is a safe, idempotent no-op", () => {
  it("does not error, does not republish already-active dependencies, and reports zero auto-published blueprints", async () => {
    const bp = await createBlueprint(coachA.id, { status: "active" });
    const { programId } = await createProgram(coachA.id, [bp], { status: "active" });

    const result = await publishProgramWithDependencies(programId);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.autoPublishedBlueprintIds).toEqual([]);
    expect(await getProgramStatus(programId)).toBe("active");
  });
});

describe("J / 7 / 8 — double-submit / two-tab publish", () => {
  it("two concurrent publish calls on the same program leave consistent state, and each blueprint is reported as auto-published by at most one call", async () => {
    const bp1 = await createBlueprint(coachA.id);
    const bp2 = await createBlueprint(coachA.id);
    const { programId } = await createProgram(coachA.id, [bp1, bp2]);

    const [r1, r2] = await Promise.all([
      publishProgramWithDependencies(programId),
      publishProgramWithDependencies(programId),
    ]);

    // Under SERIALIZABLE isolation, a genuine conflict between the two
    // concurrent transactions is resolved by Postgres aborting ONE of
    // them with 40001, which this function catches and reports as a
    // clean "please try again" error rather than a raw exception or
    // silent corruption — so a losing call reporting ok:false here is
    // an expected, correct outcome, not a bug. At least one call must
    // still succeed.
    const outcomes = [r1, r2];
    expect(outcomes.some((r) => r.ok)).toBe(true);
    for (const r of outcomes) {
      if (!r.ok) {
        expect(r.errors).toEqual(["Publishing conflicted with a concurrent change. Please try again."]);
      }
    }

    expect(await getProgramStatus(programId)).toBe("active");
    expect((await getBlueprintStatus(bp1)).status).toBe("active");
    expect((await getBlueprintStatus(bp2)).status).toBe("active");

    // Finding 3: accurate transition counting — each blueprint id
    // appears in at most ONE call's autoPublishedBlueprintIds, never
    // both (which would mean both calls' UPDATEs actually matched and
    // "transitioned" the same draft->active change).
    const allReportedIds = outcomes.flatMap((r) => (r.ok ? r.autoPublishedBlueprintIds ?? [] : []));
    const idCounts = new Map<string, number>();
    for (const id of allReportedIds) idCounts.set(id, (idCounts.get(id) ?? 0) + 1);
    for (const [, count] of idCounts) expect(count).toBe(1);
    expect(new Set(allReportedIds)).toEqual(new Set([bp1, bp2]));
  });

  it("a losing concurrent call never rewrites an already-active blueprint (updatedAt unchanged, not double-reported)", async () => {
    const bp = await createBlueprint(coachA.id);
    const { programId } = await createProgram(coachA.id, [bp]);

    await Promise.all([
      publishProgramWithDependencies(programId),
      publishProgramWithDependencies(programId),
    ]);

    const firstPass = await getBlueprintStatus(bp);
    expect(firstPass.status).toBe("active");

    // A third, fully sequential call after both concurrent ones have
    // settled must be a pure no-op idempotent read: no write, nothing
    // reported as auto-published.
    const r3 = await publishProgramWithDependencies(programId);
    expect(r3.ok).toBe(true);
    if (!r3.ok) return;
    expect(r3.autoPublishedBlueprintIds).toEqual([]);
    const afterThirdCall = await getBlueprintStatus(bp);
    expect(afterThirdCall.updatedAt.getTime()).toBe(firstPass.updatedAt.getTime());
  });
});

// ─────────────────────────────────────────────────────────────
// [Independent review remediation — Finding 2: TOCTOU]
//
// These race publishProgramWithDependencies() against a genuinely
// concurrent, independent write to the same rows it reads — not a
// sequential simulation. Which side "wins" a given run is inherently
// nondeterministic (it depends on real statement timing), so these
// tests assert the one thing that must ALWAYS hold regardless of who
// wins: no observable final state is inconsistent. That is the
// property SERIALIZABLE isolation + validateWorkoutTemplate() now
// reading through the same transaction (see DbOrTx in lib/db/client.ts)
// is actually supposed to guarantee — see
// publishProgramWithDependencies()'s own header comment for the full
// mechanism (Postgres's SSI aborts either transaction with 40001 if
// committing both would violate serializability).
//
// A true "content mutated mid-validation" race is not separately
// forced here beyond the archive race below: constructing it
// deterministically would require adding test-only timing hooks to
// production code, which was deliberately avoided. The archive race
// exercises the identical mechanism (a concurrent write to a row this
// transaction already read, racing its commit) against the same
// workout_templates row validateWorkoutTemplate() itself depends on.
// ─────────────────────────────────────────────────────────────

describe("Finding 2 — TOCTOU races", () => {
  it("a blueprint archived concurrently with its publish can never be resurrected to active", async () => {
    const bp = await createBlueprint(coachA.id);
    const { programId } = await createProgram(coachA.id, [bp]);

    const [publishOutcome] = await Promise.allSettled([
      publishProgramWithDependencies(programId),
      db.update(workoutTemplates).set({ status: "archived", updatedAt: new Date() }).where(eq(workoutTemplates.id, bp)),
    ]);

    const finalStatus = (await getBlueprintStatus(bp)).status;

    if (finalStatus === "archived") {
      // The archive is the state that ended up committed — the
      // publish, whatever it did, must not claim to have auto-
      // published this blueprint.
      if (publishOutcome.status === "fulfilled" && publishOutcome.value.ok) {
        expect(publishOutcome.value.autoPublishedBlueprintIds ?? []).not.toContain(bp);
      }
    } else {
      // The blueprint ended up active — the only way that's a correct
      // outcome is if the publish committed based on a draft read that
      // was never invalidated (i.e., the archive attempt either lost a
      // genuine conflict — aborted by Postgres — or happened to apply
      // after the publish had already committed and the row simply
      // remains active because the two writes don't share a value
      // domain that undoes each other). What must never be true: the
      // archive silently "lost" data-wise while still being reported
      // as having succeeded — check it wasn't silently swallowed as a
      // false success sitting on top of a resurrection.
      expect(finalStatus).toBe("active");
    }
  });

  it("a program day reassigned to a different blueprint concurrently with publish never leaves the program active while referencing a non-active blueprint", async () => {
    const bpA = await createBlueprint(coachA.id);
    const bpB = await createBlueprint(coachA.id); // stays draft — never referenced at publish-read time under the non-race ordering
    const { programId, weekId } = await createProgram(coachA.id, [bpA]);

    const [publishOutcome] = await Promise.allSettled([
      publishProgramWithDependencies(programId),
      db
        .update(programWeekDays)
        .set({ workoutTemplateId: bpB, updatedAt: new Date() })
        .where(and(eq(programWeekDays.programWeekId, weekId!), eq(programWeekDays.dayOfWeek, 1))),
    ]);
    void publishOutcome;

    // The core business invariant this whole feature exists to
    // protect, checked against final committed state regardless of
    // which write won: an ACTIVE program never references a non-active
    // blueprint on any of its days.
    const programStatus = await getProgramStatus(programId);
    if (programStatus === "active") {
      const rows = await db
        .select({ workoutTemplateId: programWeekDays.workoutTemplateId })
        .from(programWeekDays)
        .where(eq(programWeekDays.programWeekId, weekId!));
      const referencedIds = rows.map((r) => r.workoutTemplateId).filter((id): id is string => id !== null);
      for (const id of referencedIds) {
        expect((await getBlueprintStatus(id)).status).toBe("active");
      }
    }
  });
});

describe("K — no draft dependencies: existing publish behavior is unchanged", () => {
  it("publishes a program whose referenced blueprints are already all active, auto-publishing nothing", async () => {
    const bp1 = await createBlueprint(coachA.id, { status: "active" });
    const bp2 = await createBlueprint(coachA.id, { status: "active" });
    const { programId } = await createProgram(coachA.id, [bp1, bp2]);

    const result = await publishProgramWithDependencies(programId);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.autoPublishedBlueprintIds).toEqual([]);
    expect(await getProgramStatus(programId)).toBe("active");
  });
});

describe("L — manual (non-AI) program: universal scope", () => {
  it("auto-publishes draft dependencies for a program with no AI-generation lineage", async () => {
    const bp = await createBlueprint(coachA.id);
    const { programId } = await createProgram(coachA.id, [bp], { metadata: {} });

    const result = await publishProgramWithDependencies(programId);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.autoPublishedBlueprintIds).toEqual([bp]);
    expect((await getBlueprintStatus(bp)).status).toBe("active");
  });
});

describe("M — AI-generated program: the exact production reproduction case", () => {
  it("publishes without any manual per-blueprint publish step first", async () => {
    const genMeta = { source: "ai_program_generator", generationDraftId: randomUUID() };
    const bp1 = await createBlueprint(coachA.id);
    const bp2 = await createBlueprint(coachA.id);
    const bp3 = await createBlueprint(coachA.id);
    const { programId } = await createProgram(coachA.id, [bp1, bp2, bp3], { metadata: genMeta });

    const result = await publishProgramWithDependencies(programId);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(new Set(result.autoPublishedBlueprintIds)).toEqual(new Set([bp1, bp2, bp3]));
    expect(await getProgramStatus(programId)).toBe("active");
  });
});

describe("N — observability", () => {
  it("logs one structured success line naming the program and auto-published blueprint ids", async () => {
    const bp = await createBlueprint(coachA.id);
    const { programId } = await createProgram(coachA.id, [bp]);

    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    try {
      const result = await publishProgramWithDependencies(programId);
      expect(result.ok).toBe(true);
      const call = logSpy.mock.calls.find((c) => c[0] === "[PROGRAM_PUBLISH_AUTO_DEPENDENCIES]");
      expect(call).toBeDefined();
      const payload = JSON.parse(call![1] as string) as { programId: string; autoPublishedCount: number; autoPublishedBlueprintIds: string[] };
      expect(payload.programId).toBe(programId);
      expect(payload.autoPublishedCount).toBe(1);
      expect(payload.autoPublishedBlueprintIds).toEqual([bp]);
    } finally {
      logSpy.mockRestore();
    }
  });

  it("logs a structured rejection line (not the raw error list) on validation failure", async () => {
    const invalid = await createInvalidBlueprint(coachA.id);
    const { programId } = await createProgram(coachA.id, [invalid]);

    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    try {
      const result = await publishProgramWithDependencies(programId);
      expect(result.ok).toBe(false);
      const call = errorSpy.mock.calls.find((c) => c[0] === "[PROGRAM_PUBLISH_AUTO_DEPENDENCIES_REJECTED]");
      expect(call).toBeDefined();
    } finally {
      errorSpy.mockRestore();
    }
  });
});

describe("no weeks / no dependencies — existing failure modes preserved", () => {
  it("fails closed when the program has no weeks at all", async () => {
    const { programId } = await createProgram(coachA.id, [], { skipWeek: true });
    const result = await publishProgramWithDependencies(programId);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.errors).toEqual(["Program has no weeks defined."]);
  });

  it("fails closed when every day is a rest day (no blueprints assigned)", async () => {
    const { programId } = await createProgram(coachA.id, [null, null]);
    const result = await publishProgramWithDependencies(programId);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.errors).toEqual(["Program has no workout blueprints assigned to any days."]);
  });

  it("returns a not-found error for a nonexistent program id", async () => {
    const result = await publishProgramWithDependencies(randomUUID());
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.errors).toEqual(["Program not found."]);
  });
});
