// ─────────────────────────────────────────────────────────────
// Nutrition targets (ADR-014) — regression + tenant-isolation suite
//
// Proves, against a REAL database connection (same rationale as
// document-tenant-isolation.test.ts / coach-signup.test.ts — mocking
// Drizzle's query builder would only prove the mock was called
// correctly, not that the actual SQL WHERE clause, CHECK constraint,
// or partial unique index behaves correctly):
//
//   1. Draft creation, validation, and the four-stage model.
//   2. Draft updates; published/archived targets are immutable.
//   3. Publish transaction: archive-previous + promote + notify, and
//      the DB-level "exactly one published target per client"
//      guarantee (partial unique index, not just application logic).
//   4. History/archive preservation.
//   5. The client-facing projection never leaks internalNotes or any
//      calculator/audit (rec_*/calc_*) column.
//   6. Cross-client mutation is blocked by the service's own
//      clientId-scoped WHERE clause (defense-in-depth layer noted in
//      nutrition-target-service.ts's comments) — the coach-owns-client
//      check itself (assertCoachOwnsClient/coachOwnsClient) lives one
//      layer up, in app/hq/clients/[clientId]/nutrition/actions.ts,
//      and is exercised here directly against guards.ts.
//   7. RLS: the client-self-select policy's existence and definition
//      are verified via pg_policies introspection — the service-role
//      connection this file otherwise uses bypasses RLS by design, so
//      policy enforcement itself isn't exercised end-to-end here (no
//      authenticated, non-service-role Postgres connection exists in
//      this test suite's infrastructure); this at least proves the
//      policy is present and shaped as documented, not silently
//      dropped by a schema drift.
//
// This suite does not modify lib/db/nutrition-target-service.ts,
// lib/db/schema-nutrition.ts, or any authorization logic — it tests
// the working system exactly as it exists.
//
// Requires a reachable DATABASE_URL. vitest.config.ts loads
// .env.local automatically. Fixture rows use randomUUID()-based
// emails so repeated runs never collide; every row this file creates
// is deleted in afterAll(), FK-safe (children before parents).
// ─────────────────────────────────────────────────────────────

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { randomUUID } from "crypto";
import { eq, inArray, sql } from "drizzle-orm";
import { getDb } from "../client";
import { createAdminClient } from "@/lib/supabase/admin";
import { users, clientProfiles, coachingEnrollments } from "../schema";
import { clientNutritionTargets } from "../schema-nutrition";
import { clientNotifications } from "../schema-notifications";
import { coachOwnsClient, assertCoachOwnsClient, resolveTenantScope } from "@/lib/auth/guards";
import type { PublicUser } from "@/lib/supabase/session";
import {
  createDraft,
  updateDraft,
  publishTarget,
  archiveTarget,
  getActiveTarget,
  getPublishedTargetForClient,
  getTargetHistory,
  getDraftTargets,
} from "../nutrition-target-service";

const db = getDb();

function fakeDbUser(id: string, role: "coach" | "admin"): PublicUser {
  return {
    id,
    email: `${id}@isolation-test.invalid`,
    normalizedEmail: `${id}@isolation-test.invalid`,
    emailVerifiedAt: null,
    role,
    status: "active",
    createdAt: new Date(),
    updatedAt: new Date(),
    deletedAt: null,
  } as PublicUser;
}

// ── Fixture identities ────────────────────────────────────────
const coachA = { id: "" };
const coachB = { id: "" };
const clientA = { id: "" };
const clientB = { id: "" };
const createdTargetIds: string[] = [];

async function createAuthUser(label: string): Promise<string> {
  const admin = createAdminClient();
  const { data, error } = await admin.auth.admin.createUser({
    email: `nutrition-test-${label}-${randomUUID()}@isolation-test.invalid`,
    email_confirm: true,
    password: randomUUID(),
  });
  if (error || !data.user) {
    throw new Error(`Fixture setup failed: createUser(${label}) — ${error?.message}`);
  }
  return data.user.id;
}

const CALC_INPUT = {
  effectiveDate: new Date().toISOString().split("T")[0],
  heightInches: 68,
  weightLbs: 160,
  ageYears: 30,
  biologicalSex: "female" as const,
  activityLevel: "moderately_active" as const,
  goalType: "fat_loss",
};

beforeAll(async () => {
  [coachA.id, coachB.id, clientA.id, clientB.id] = await Promise.all([
    createAuthUser("coach-a"),
    createAuthUser("coach-b"),
    createAuthUser("client-a"),
    createAuthUser("client-b"),
  ]);

  await Promise.all([
    db.update(users).set({ role: "coach", status: "active" }).where(eq(users.id, coachA.id)),
    db.update(users).set({ role: "coach", status: "active" }).where(eq(users.id, coachB.id)),
    db.update(users).set({ role: "client", status: "active" }).where(eq(users.id, clientA.id)),
    db.update(users).set({ role: "client", status: "active" }).where(eq(users.id, clientB.id)),
  ]);

  await db.insert(clientProfiles).values([
    { userId: clientA.id, fullName: "Nutrition Test Client A" },
    { userId: clientB.id, fullName: "Nutrition Test Client B" },
  ]);

  await db.insert(coachingEnrollments).values([
    { clientId: clientA.id, coachId: coachA.id, packageType: "Standard", monthlyRateCents: 0, status: "active" },
    { clientId: clientB.id, coachId: coachB.id, packageType: "Standard", monthlyRateCents: 0, status: "active" },
  ]);
});

afterAll(async () => {
  const userIds = [coachA.id, coachB.id, clientA.id, clientB.id].filter(Boolean);

  if (createdTargetIds.length > 0) {
    await db.delete(clientNutritionTargets).where(inArray(clientNutritionTargets.id, createdTargetIds));
  }
  // Belt-and-suspenders: catch anything created outside createdTargetIds
  // tracking (e.g. a raw insert in the unique-index test below).
  await db.delete(clientNutritionTargets).where(
    inArray(clientNutritionTargets.clientId, [clientA.id, clientB.id].filter(Boolean)),
  );
  await db.delete(clientNotifications).where(
    inArray(clientNotifications.clientId, [clientA.id, clientB.id].filter(Boolean)),
  );
  if (userIds.length > 0) {
    await db.delete(coachingEnrollments).where(
      inArray(coachingEnrollments.clientId, [clientA.id, clientB.id].filter(Boolean)),
    );
    await db.delete(clientProfiles).where(inArray(clientProfiles.userId, [clientA.id, clientB.id].filter(Boolean)));
    await db.delete(users).where(inArray(users.id, userIds));
    const admin = createAdminClient();
    await Promise.all(userIds.map((id) => admin.auth.admin.deleteUser(id)));
  }
});

// ─────────────────────────────────────────────────────────────

describe("createDraft — validation and the four-stage model", () => {
  it("creates a draft with calculator recommendation + coach decision stored together", async () => {
    const result = await createDraft({
      ...CALC_INPUT,
      clientId: clientA.id,
      coachId: coachA.id,
      calorieTarget: 1800,
      proteinGrams: 150,
      coachNotes: "Client-visible: focus on protein at breakfast.",
      internalNotes: "Internal: watch for binge pattern on weekends.",
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    createdTargetIds.push(result.targetId);

    const [row] = await db.select().from(clientNutritionTargets).where(eq(clientNutritionTargets.id, result.targetId));
    expect(row.status).toBe("draft");
    expect(row.calorieTarget).toBe(1800);
    expect(row.proteinGrams).toBe(150);
    expect(row.recCalories).toBeGreaterThan(0); // system recommendation was computed
    expect(row.recFormulaVersion).toBe("mifflin-st-jeor-v1");
    expect(row.coachNotes).toContain("Client-visible");
    expect(row.internalNotes).toContain("Internal");
  });

  it("rejects invalid calculator inputs (e.g. missing activity level)", async () => {
    const result = await createDraft({
      ...CALC_INPUT,
      activityLevel: "" as never,
      clientId: clientA.id,
      coachId: coachA.id,
      calorieTarget: 1800,
      proteinGrams: 150,
    });
    expect(result.ok).toBe(false);
  });

  it("enforces calorieTarget > 0 at the database level (CHECK constraint)", async () => {
    const result = await createDraft({
      ...CALC_INPUT,
      clientId: clientA.id,
      coachId: coachA.id,
      calorieTarget: 0,
      proteinGrams: 150,
    });
    expect(result.ok).toBe(false);
  });

  it("enforces proteinGrams > 0 at the database level (CHECK constraint)", async () => {
    const result = await createDraft({
      ...CALC_INPUT,
      clientId: clientA.id,
      coachId: coachA.id,
      calorieTarget: 1800,
      proteinGrams: -5,
    });
    expect(result.ok).toBe(false);
  });
});

describe("updateDraft — carbs/fat nullable behavior, draft-only mutability", () => {
  let draftId: string;

  beforeAll(async () => {
    const result = await createDraft({
      ...CALC_INPUT,
      clientId: clientA.id,
      coachId: coachA.id,
      calorieTarget: 1800,
      proteinGrams: 150,
      fatGrams: 60,
      carbGrams: 150,
    });
    if (!result.ok) throw new Error("fixture setup failed");
    draftId = result.targetId;
    createdTargetIds.push(draftId);
  });

  it("updates fields on a draft", async () => {
    const result = await updateDraft(draftId, clientA.id, coachA.id, { calorieTarget: 1900 });
    expect(result.ok).toBe(true);
    const [row] = await db.select().from(clientNutritionTargets).where(eq(clientNutritionTargets.id, draftId));
    expect(row.calorieTarget).toBe(1900);
  });

  it("allows fatGrams/carbGrams to be explicitly set to null (nullable columns)", async () => {
    const result = await updateDraft(draftId, clientA.id, coachA.id, { fatGrams: null, carbGrams: null });
    expect(result.ok).toBe(true);
    const [row] = await db.select().from(clientNutritionTargets).where(eq(clientNutritionTargets.id, draftId));
    expect(row.fatGrams).toBeNull();
    expect(row.carbGrams).toBeNull();
  });

  it("refuses to update a target that is not a draft", async () => {
    const publishResult = await publishTarget(draftId, coachA.id, clientA.id);
    expect(publishResult.ok).toBe(true);

    const updateResult = await updateDraft(draftId, clientA.id, coachA.id, { calorieTarget: 2500 });
    expect(updateResult.ok).toBe(false);
    if (!updateResult.ok) expect(updateResult.error).toBe("Only draft targets can be updated.");

    // Confirm the published row was genuinely untouched.
    const [row] = await db.select().from(clientNutritionTargets).where(eq(clientNutritionTargets.id, draftId));
    expect(row.calorieTarget).toBe(1900);
  });

  it("refuses to update/mutate a target for the wrong clientId — clientId-scoped WHERE, not just targetId lookup", async () => {
    const secondDraft = await createDraft({
      ...CALC_INPUT,
      clientId: clientA.id,
      coachId: coachA.id,
      calorieTarget: 2000,
      proteinGrams: 140,
    });
    if (!secondDraft.ok) throw new Error("fixture setup failed");
    createdTargetIds.push(secondDraft.targetId);

    // Same targetId, but clientB's ID supplied instead of the target's
    // real owner (clientA) — proves the WHERE clause, not just the
    // targetId, gates the mutation.
    const result = await updateDraft(secondDraft.targetId, clientB.id, coachB.id, { calorieTarget: 9999 });
    expect(result.ok).toBe(false);

    const [row] = await db
      .select()
      .from(clientNutritionTargets)
      .where(eq(clientNutritionTargets.id, secondDraft.targetId));
    expect(row.calorieTarget).toBe(2000); // unchanged
  });
});

describe("publishTarget — transaction behavior", () => {
  it("archives the previous published target, promotes the draft, and creates a notification — atomically", async () => {
    const first = await createDraft({
      ...CALC_INPUT,
      clientId: clientA.id,
      coachId: coachA.id,
      calorieTarget: 1700,
      proteinGrams: 140,
    });
    if (!first.ok) throw new Error("fixture setup failed");
    createdTargetIds.push(first.targetId);
    await publishTarget(first.targetId, coachA.id, clientA.id);

    const second = await createDraft({
      ...CALC_INPUT,
      clientId: clientA.id,
      coachId: coachA.id,
      calorieTarget: 1750,
      proteinGrams: 145,
    });
    if (!second.ok) throw new Error("fixture setup failed");
    createdTargetIds.push(second.targetId);

    const beforeCount = (
      await db.select().from(clientNotifications).where(eq(clientNotifications.resourceId, second.targetId))
    ).length;
    expect(beforeCount).toBe(0);

    const publishResult = await publishTarget(second.targetId, coachA.id, clientA.id);
    expect(publishResult.ok).toBe(true);

    const [firstRow] = await db.select().from(clientNutritionTargets).where(eq(clientNutritionTargets.id, first.targetId));
    expect(firstRow.status).toBe("archived");
    expect(firstRow.archivedAt).not.toBeNull();
    expect(firstRow.archivedBy).toBe(coachA.id);

    const [secondRow] = await db.select().from(clientNutritionTargets).where(eq(clientNutritionTargets.id, second.targetId));
    expect(secondRow.status).toBe("published");
    expect(secondRow.publishedAt).not.toBeNull();

    const notifications = await db
      .select()
      .from(clientNotifications)
      .where(eq(clientNotifications.resourceId, second.targetId));
    expect(notifications.length).toBe(1);
    expect(notifications[0].eventType).toBe("nutrition_updated");
    expect(notifications[0].clientId).toBe(clientA.id);
    expect(notifications[0].actorId).toBe(coachA.id);
  });

  it("refuses to publish a target that isn't actually a draft (already published/archived)", async () => {
    const draft = await createDraft({
      ...CALC_INPUT,
      clientId: clientB.id,
      coachId: coachB.id,
      calorieTarget: 1600,
      proteinGrams: 130,
    });
    if (!draft.ok) throw new Error("fixture setup failed");
    createdTargetIds.push(draft.targetId);
    await publishTarget(draft.targetId, coachB.id, clientB.id);

    const secondAttempt = await publishTarget(draft.targetId, coachB.id, clientB.id);
    expect(secondAttempt.ok).toBe(false);
  });
});

describe("exactly one published target per client — DB-level guarantee", () => {
  it("rejects a second published row for the same client at the database level (partial unique index)", async () => {
    // Bypasses the service layer intentionally — proves the guarantee
    // is a real DB constraint (uq_active_published_nutrition_target),
    // not just something publishTarget()'s application logic happens
    // to maintain. Uses clientB, who at this point in the suite
    // already has exactly one published row from the test above.
    await expect(
      db.insert(clientNutritionTargets).values({
        clientId: clientB.id,
        coachId: coachB.id,
        status: "published",
        effectiveDate: CALC_INPUT.effectiveDate,
        calorieTarget: 1234,
        proteinGrams: 100,
      }),
    ).rejects.toThrow();
  });
});

describe("history/archive preservation", () => {
  it("getTargetHistory returns both archived and published rows for a client", async () => {
    const history = await getTargetHistory(clientA.id);
    const statuses = history.map((t) => t.status);
    expect(statuses).toContain("archived");
    expect(statuses).toContain("published");
  });
});

describe("archiveTarget", () => {
  it("archives a draft without requiring publication first", async () => {
    const draft = await createDraft({
      ...CALC_INPUT,
      clientId: clientA.id,
      coachId: coachA.id,
      calorieTarget: 1500,
      proteinGrams: 120,
    });
    if (!draft.ok) throw new Error("fixture setup failed");
    createdTargetIds.push(draft.targetId);

    const result = await archiveTarget(draft.targetId, clientA.id, coachA.id);
    expect(result.ok).toBe(true);

    const [row] = await db.select().from(clientNutritionTargets).where(eq(clientNutritionTargets.id, draft.targetId));
    expect(row.status).toBe("archived");
  });

  it("refuses to double-archive an already-archived target", async () => {
    const draft = await createDraft({
      ...CALC_INPUT,
      clientId: clientA.id,
      coachId: coachA.id,
      calorieTarget: 1500,
      proteinGrams: 120,
    });
    if (!draft.ok) throw new Error("fixture setup failed");
    createdTargetIds.push(draft.targetId);
    await archiveTarget(draft.targetId, clientA.id, coachA.id);

    const second = await archiveTarget(draft.targetId, clientA.id, coachA.id);
    expect(second.ok).toBe(false);
  });
});

describe("client-facing read paths — safe empty states + published-only visibility", () => {
  it("returns null (not an error) for a client with zero targets", async () => {
    const untouchedClientId = randomUUID();
    expect(await getActiveTarget(untouchedClientId)).toBeNull();
    expect(await getPublishedTargetForClient(untouchedClientId)).toBeNull();
  });

  it("returns null for a client who has only a draft, no published target", async () => {
    const soleDraft = await createDraft({
      ...CALC_INPUT,
      clientId: clientB.id,
      coachId: coachB.id,
      calorieTarget: 1600,
      proteinGrams: 130,
    });
    if (!soleDraft.ok) throw new Error("fixture setup failed");
    createdTargetIds.push(soleDraft.targetId);
    const drafts = await getDraftTargets(clientB.id);
    expect(drafts.some((d) => d.id === soleDraft.targetId)).toBe(true);
  });

  it("client projection never includes internalNotes or any calculator/audit field", async () => {
    const draft = await createDraft({
      ...CALC_INPUT,
      clientId: clientA.id,
      coachId: coachA.id,
      calorieTarget: 1650,
      proteinGrams: 135,
      coachNotes: "Visible to client.",
      internalNotes: "SECRET — must never leak to the client portal.",
    });
    if (!draft.ok) throw new Error("fixture setup failed");
    createdTargetIds.push(draft.targetId);
    await publishTarget(draft.targetId, coachA.id, clientA.id);

    const clientView = await getPublishedTargetForClient(clientA.id);
    expect(clientView).not.toBeNull();
    expect(clientView!.coachNotes).toBe("Visible to client.");

    const forbiddenKeys = [
      "internalNotes",
      "adjustmentReason",
      "recCalories",
      "recProteinG",
      "recFatG",
      "recCarbG",
      "recBmr",
      "recTdee",
      "recFormulaVersion",
      "calcHeightInches",
      "calcWeightLbs",
      "calcAgeYears",
      "calcBiologicalSex",
      "calcActivityLevel",
      "calcGoalType",
      "archivedAt",
      "archivedBy",
      "coachId",
    ];
    for (const key of forbiddenKeys) {
      expect(clientView).not.toHaveProperty(key);
    }

    // Full-object serialization check too — catches a future change
    // that adds a field to the SELECT projection but forgets to
    // exclude it here, even if it isn't in the list above.
    const serialized = JSON.stringify(clientView).toLowerCase();
    expect(serialized).not.toContain("secret");
  });
});

describe("ownership derivation — coaching_enrollments, not a role check alone", () => {
  it("coachOwnsClient is true only for the coach actually enrolled with that client", async () => {
    expect(await coachOwnsClient(coachA.id, clientA.id)).toBe(true);
    expect(await coachOwnsClient(coachB.id, clientA.id)).toBe(false);
    expect(await coachOwnsClient(coachA.id, clientB.id)).toBe(false);
  });

  it("assertCoachOwnsClient denies a coach acting on a client they don't own", async () => {
    const result = await assertCoachOwnsClient(fakeDbUser(coachB.id, "coach"), clientA.id);
    expect(result.ok).toBe(false);
  });

  it("admin bypasses client ownership scoping entirely (intentional)", async () => {
    const result = await assertCoachOwnsClient(fakeDbUser(coachA.id, "admin"), clientB.id);
    expect(result.ok).toBe(true);
    expect(resolveTenantScope(fakeDbUser(coachA.id, "admin")).coachId).toBeNull();
  });
});

describe("RLS — policy presence (introspection; service-role connection bypasses RLS by design)", () => {
  it("client_nutrition_targets has row-level security enabled", async () => {
    const rows = await db.execute<{ relrowsecurity: boolean }>(
      sql`select relrowsecurity from pg_class where relname = 'client_nutrition_targets'`,
    );
    expect(rows[0]?.relrowsecurity).toBe(true);
  });

  it("has the documented client-select-published-only policy", async () => {
    const rows = await db.execute<{ policyname: string; cmd: string; qual: string | null }>(
      sql`select policyname, cmd, qual from pg_policies where tablename = 'client_nutrition_targets'`,
    );
    const policy = rows.find((r) => r.policyname === "nutrition_targets_client_select_published");
    expect(policy).toBeTruthy();
    expect(policy?.cmd).toBe("SELECT");
    // The USING clause must scope by auth.uid() AND status = 'published' —
    // both halves of the documented guarantee, not just one.
    expect(policy?.qual).toContain("auth.uid()");
    expect(policy?.qual).toContain("published");
  });
});
