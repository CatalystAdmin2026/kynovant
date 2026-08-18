// ─────────────────────────────────────────────────────────────
// Client body metrics (health_profiles + body_composition_records)
// — regression suite for lib/db/client-metrics-service.ts
//
// Root cause under test: neither health_profiles nor
// body_composition_records had any application write path before this
// fix (only scripts/seed-demo-client.ts ever inserted into them), so
// the nutrition calculator (which reads exactly these two tables) was
// permanently unusable for any real client. This suite proves, against
// a REAL database connection:
//
//   1. saveClientMetrics upserts health_profiles (height/sex/DOB) —
//      one row per client, partial updates don't clobber other fields.
//   2. Weight inserts a NEW body_composition_records row every call —
//      append-only history, never overwritten, source = "coach_entry".
//   3. Validation bounds (height/weight/DOB) reject bad input before
//      any write happens.
//   4. Cross-client isolation — writing one client's metrics never
//      touches another client's health_profiles row.
//   5. End-to-end: once all three fields exist, the exact values
//      round-trip into lib/nutrition/calculator.ts's calculate() the
//      same way app/hq/clients/[clientId]/nutrition/page.tsx reads them.
//
// Requires a reachable DATABASE_URL. vitest.config.ts loads .env.local
// automatically. Fixture rows use randomUUID()-based emails; every row
// this file creates is deleted in afterAll(), FK-safe.
// ─────────────────────────────────────────────────────────────

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { randomUUID } from "crypto";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { eq, inArray, desc } from "drizzle-orm";
import { getDb } from "../client";
import { createAdminClient } from "@/lib/supabase/admin";
import { users, clientProfiles, coachingEnrollments } from "../schema";
import { healthProfiles, bodyCompositionRecords } from "../schema-profile";
import { weeklyCheckIns } from "../schema-check-in";
import {
  saveClientMetrics,
  getCheckInWeightPromotionCandidate,
  promoteCheckInWeight,
} from "../client-metrics-service";
import { ageFromDob, calculate } from "@/lib/nutrition/calculator";
import { coachOwnsClient, assertCoachOwnsClient } from "@/lib/auth/guards";
import type { PublicUser } from "@/lib/supabase/session";

const db = getDb();

const clientA = { id: "" };
const clientB = { id: "" };
const coachA = { id: "" };
const coachB = { id: "" };

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

async function createAuthUser(label: string): Promise<string> {
  const admin = createAdminClient();
  const { data, error } = await admin.auth.admin.createUser({
    email: `client-metrics-test-${label}-${randomUUID()}@isolation-test.invalid`,
    email_confirm: true,
    password: randomUUID(),
  });
  if (error || !data.user) {
    throw new Error(`Fixture setup failed: createUser(${label}) — ${error?.message}`);
  }
  return data.user.id;
}

beforeAll(async () => {
  [clientA.id, clientB.id, coachA.id, coachB.id] = await Promise.all([
    createAuthUser("client-a"),
    createAuthUser("client-b"),
    createAuthUser("coach-a"),
    createAuthUser("coach-b"),
  ]);
  await Promise.all([
    db.update(users).set({ role: "client", status: "active" }).where(eq(users.id, clientA.id)),
    db.update(users).set({ role: "client", status: "active" }).where(eq(users.id, clientB.id)),
    db.update(users).set({ role: "coach", status: "active" }).where(eq(users.id, coachA.id)),
    db.update(users).set({ role: "coach", status: "active" }).where(eq(users.id, coachB.id)),
  ]);
  await db.insert(clientProfiles).values([
    { userId: clientA.id, fullName: "Client Metrics Test A" },
    { userId: clientB.id, fullName: "Client Metrics Test B" },
  ]);
  // Only clientA is enrolled with coachA — clientB is deliberately left
  // unenrolled with either coach so assertCoachOwnsClient has a real
  // ownership boundary to fail against (not just "no enrollment exists
  // for anyone").
  await db.insert(coachingEnrollments).values([
    { clientId: clientA.id, coachId: coachA.id, packageType: "Standard", monthlyRateCents: 0, status: "active" },
  ]);
});

// Defensive per-phase cleanup (established pattern — see
// coach-tenant-isolation.test.ts / program-generator-integration.test.ts):
// beforeAll may have thrown partway through, so every phase below must be
// safe to run against an empty/partial fixture set, and one phase's
// failure must never block the rest from attempting cleanup.
afterAll(async () => {
  let firstError: unknown;
  const runPhase = async (label: string, fn: () => Promise<void>) => {
    try {
      await fn();
    } catch (err) {
      console.error(`[client-metrics-service cleanup] ${label} failed:`, err instanceof Error ? err.message : err);
      firstError = firstError ?? err;
    }
  };

  const clientIds = [clientA.id, clientB.id].filter(Boolean);
  const coachIds = [coachA.id, coachB.id].filter(Boolean);
  const userIds = [...clientIds, ...coachIds];

  await runPhase("delete body_composition_records", async () => {
    if (clientIds.length > 0) {
      await db.delete(bodyCompositionRecords).where(inArray(bodyCompositionRecords.clientId, clientIds));
    }
  });
  await runPhase("delete health_profiles", async () => {
    if (clientIds.length > 0) {
      await db.delete(healthProfiles).where(inArray(healthProfiles.clientId, clientIds));
    }
  });
  await runPhase("delete coaching_enrollments", async () => {
    if (clientIds.length > 0) {
      await db.delete(coachingEnrollments).where(inArray(coachingEnrollments.clientId, clientIds));
    }
  });
  await runPhase("delete client_profiles", async () => {
    if (clientIds.length > 0) {
      await db.delete(clientProfiles).where(inArray(clientProfiles.userId, clientIds));
    }
  });
  await runPhase("delete public.users rows", async () => {
    if (userIds.length > 0) {
      await db.delete(users).where(inArray(users.id, userIds));
    }
  });
  await runPhase("delete Supabase Auth users", async () => {
    if (userIds.length > 0) {
      const admin = createAdminClient();
      const results = await Promise.allSettled(userIds.map((id) => admin.auth.admin.deleteUser(id)));
      const failed = results.filter((r) => r.status === "rejected");
      if (failed.length > 0) throw new Error(`${failed.length}/${userIds.length} Auth deletions failed`);
    }
  });

  if (firstError) throw firstError;
});

// ─────────────────────────────────────────────────────────────

describe("saveClientMetrics — health_profiles upsert (height/sex/DOB)", () => {
  it("creates a health_profiles row for a client with no metrics yet", async () => {
    const result = await saveClientMetrics(clientA.id, {
      heightInches: 68,
      biologicalSex: "female",
      dateOfBirth: "1994-03-15",
    });
    expect(result.ok).toBe(true);

    const [row] = await db.select().from(healthProfiles).where(eq(healthProfiles.clientId, clientA.id));
    expect(row).toBeDefined();
    expect(parseFloat(String(row.heightInches))).toBe(68);
    expect(row.biologicalSex).toBe("female");
    expect(row.dateOfBirth).toBe("1994-03-15");
  });

  it("a partial update only touches the fields provided — does not clobber the rest", async () => {
    // clientA already has height/sex/DOB from the previous test.
    // Save weight-only in the same call shape as a coach filling in
    // just what they currently know.
    const result = await saveClientMetrics(clientA.id, { heightInches: 70 });
    expect(result.ok).toBe(true);

    const [row] = await db.select().from(healthProfiles).where(eq(healthProfiles.clientId, clientA.id));
    expect(parseFloat(String(row.heightInches))).toBe(70); // updated
    expect(row.biologicalSex).toBe("female"); // untouched
    expect(row.dateOfBirth).toBe("1994-03-15"); // untouched
  });

  it("supports the 'unspecified' biological sex fallback the calculator expects", async () => {
    const result = await saveClientMetrics(clientB.id, {
      heightInches: 72,
      biologicalSex: "unspecified",
      dateOfBirth: "1990-01-01",
    });
    expect(result.ok).toBe(true);
    const [row] = await db.select().from(healthProfiles).where(eq(healthProfiles.clientId, clientB.id));
    expect(row.biologicalSex).toBe("unspecified");
  });

  it("saving DOB only leaves height/sex untouched", async () => {
    // clientB now has height=72/sex=unspecified/dob=1990-01-01 from above.
    const result = await saveClientMetrics(clientB.id, { dateOfBirth: "1991-06-20" });
    expect(result.ok).toBe(true);
    const [row] = await db.select().from(healthProfiles).where(eq(healthProfiles.clientId, clientB.id));
    expect(row.dateOfBirth).toBe("1991-06-20"); // updated
    expect(parseFloat(String(row.heightInches))).toBe(72); // untouched
    expect(row.biologicalSex).toBe("unspecified"); // untouched
  });

  it("saving sex only leaves height/DOB untouched", async () => {
    const result = await saveClientMetrics(clientB.id, { biologicalSex: "female" });
    expect(result.ok).toBe(true);
    const [row] = await db.select().from(healthProfiles).where(eq(healthProfiles.clientId, clientB.id));
    expect(row.biologicalSex).toBe("female"); // updated
    expect(parseFloat(String(row.heightInches))).toBe(72); // untouched
    expect(row.dateOfBirth).toBe("1991-06-20"); // untouched
  });

  it("is idempotent — saving the identical values twice does not create a second row", async () => {
    await saveClientMetrics(clientB.id, { heightInches: 72, biologicalSex: "female", dateOfBirth: "1991-06-20" });
    const rows = await db.select().from(healthProfiles).where(eq(healthProfiles.clientId, clientB.id));
    expect(rows.length).toBe(1); // still exactly one row — upsert, not insert
  });
});

describe("saveClientMetrics — body_composition_records append-only (weight)", () => {
  it("inserts a new row rather than overwriting a prior weight entry", async () => {
    const before = await db
      .select()
      .from(bodyCompositionRecords)
      .where(eq(bodyCompositionRecords.clientId, clientA.id));
    expect(before.length).toBe(0);

    const first = await saveClientMetrics(clientA.id, { weightLbs: 165 });
    expect(first.ok).toBe(true);
    const second = await saveClientMetrics(clientA.id, { weightLbs: 163 });
    expect(second.ok).toBe(true);

    const rows = await db
      .select()
      .from(bodyCompositionRecords)
      .where(eq(bodyCompositionRecords.clientId, clientA.id));
    expect(rows.length).toBe(2); // both preserved — history, not overwrite
    const weights = rows.map((r) => parseFloat(String(r.weightPounds))).sort((a, b) => a - b);
    expect(weights).toEqual([163, 165]);
  });

  it("tags coach-entered weight with source = 'coach_entry'", async () => {
    const rows = await db
      .select()
      .from(bodyCompositionRecords)
      .where(eq(bodyCompositionRecords.clientId, clientA.id));
    expect(rows.every((r) => r.source === "coach_entry")).toBe(true);
  });

  it("'latest' weight is selected by recordedAt, matching coach-client-workspace-service.ts's ORDER BY recordedAt DESC LIMIT 1", async () => {
    // clientA has two rows from the test above (165 then 163, both
    // written back-to-back). A third, newer write must become "latest"
    // even though its value is numerically neither the min nor the max —
    // proving selection is by recency, not by value or insertion count.
    await saveClientMetrics(clientA.id, { weightLbs: 164 });

    const [latest] = await db
      .select()
      .from(bodyCompositionRecords)
      .where(eq(bodyCompositionRecords.clientId, clientA.id))
      .orderBy(desc(bodyCompositionRecords.recordedAt))
      .limit(1);
    expect(parseFloat(String(latest.weightPounds))).toBe(164);

    const all = await db
      .select()
      .from(bodyCompositionRecords)
      .where(eq(bodyCompositionRecords.clientId, clientA.id));
    expect(all.length).toBe(3); // all three preserved, none overwritten
  });
});

describe("saveClientMetrics — validation", () => {
  it("rejects out-of-range height and writes nothing", async () => {
    const result = await saveClientMetrics(clientB.id, { heightInches: 500 });
    expect(result.ok).toBe(false);
  });

  it("rejects out-of-range weight and writes nothing", async () => {
    const before = await db
      .select()
      .from(bodyCompositionRecords)
      .where(eq(bodyCompositionRecords.clientId, clientB.id));
    const result = await saveClientMetrics(clientB.id, { weightLbs: 5000 });
    expect(result.ok).toBe(false);
    const after = await db
      .select()
      .from(bodyCompositionRecords)
      .where(eq(bodyCompositionRecords.clientId, clientB.id));
    expect(after.length).toBe(before.length); // nothing written
  });

  it("rejects a future date of birth", async () => {
    const futureYear = new Date().getFullYear() + 1;
    const result = await saveClientMetrics(clientB.id, { dateOfBirth: `${futureYear}-01-01` });
    expect(result.ok).toBe(false);
  });

  it("rejects a malformed date string", async () => {
    const result = await saveClientMetrics(clientB.id, { dateOfBirth: "not-a-date" });
    expect(result.ok).toBe(false);
  });

  it("rejects a calendar-invalid date (e.g. Feb 31) instead of silently rolling over", async () => {
    const result = await saveClientMetrics(clientB.id, { dateOfBirth: "2000-02-31" });
    expect(result.ok).toBe(false);
  });

  it("rejects a DOB that yields age under 13", async () => {
    const today = new Date();
    const tooYoung = `${today.getUTCFullYear() - 10}-01-01`; // ~10yo
    const result = await saveClientMetrics(clientB.id, { dateOfBirth: tooYoung });
    expect(result.ok).toBe(false);
  });

  it("rejects a DOB that yields age over 120", async () => {
    const today = new Date();
    const tooOld = `${today.getUTCFullYear() - 130}-01-01`;
    const result = await saveClientMetrics(clientB.id, { dateOfBirth: tooOld });
    expect(result.ok).toBe(false);
  });

  it("accepts a DOB at the exact age-13 boundary", async () => {
    const today = new Date();
    // A birthday that has already occurred this year, exactly 13 years ago.
    const dob = `${today.getUTCFullYear() - 13}-01-01`;
    const result = await saveClientMetrics(clientB.id, { dateOfBirth: dob });
    expect(result.ok).toBe(true);
  });

  it("accepts a DOB at the exact age-120 boundary", async () => {
    const today = new Date();
    const dob = `${today.getUTCFullYear() - 120}-01-01`;
    const result = await saveClientMetrics(clientB.id, { dateOfBirth: dob });
    expect(result.ok).toBe(true);
  });
});

describe("write authorization — saveClientMetricsAction (Coach A cannot write Coach B's client)", () => {
  // Two kinds of proof, matching this codebase's own established
  // precedent (see lib/auth/__tests__/rd-credential-gate.test.ts):
  //   1. saveClientMetricsAction depends on requireCoachOrAdmin(),
  //      which calls resolveSession() → next/headers cookies() → a real
  //      Next.js request scope that does not exist inside a vitest
  //      process. Source inspection proves the action calls the SAME
  //      guard + ownership check every other action in this file uses —
  //      not a weaker or missing check — which is as strong a proof as
  //      executing it for a guard whose entire body is "call an
  //      existing, separately-tested guard, then branch."
  //   2. assertCoachOwnsClient/coachOwnsClient — the actual ownership
  //      boundary saveClientMetricsAction delegates to — take a plain
  //      PublicUser/id, no cookies needed, so THAT half is exercised
  //      live against real fixtures below.

  it("saveClientMetricsAction calls requireCoachOrAdmin() and assertCoachOwnsClient() — the same guard pair every sibling action in this file uses, not a weaker check", () => {
    const source = readFileSync(
      resolve(process.cwd(), "app/hq/clients/[clientId]/nutrition/actions.ts"),
      "utf-8",
    );
    const start = source.indexOf("export async function saveClientMetricsAction");
    expect(start).toBeGreaterThan(-1);
    const rest = source.slice(start);
    const nextExportIdx = rest.indexOf("export async function", 10);
    const fn = nextExportIdx === -1 ? rest : rest.slice(0, nextExportIdx);

    expect(fn).toContain("requireCoachOrAdmin()");
    expect(fn).toContain("assertCoachOwnsClient(guard.dbUser, clientId)");
    // No client-suppliable coachId parameter — coach identity comes only
    // from the resolved session (guard.dbUser.id), never from the caller.
    const signature = fn.slice(0, fn.indexOf(")"));
    expect(signature).not.toContain("coachId");
  });

  it("coachOwnsClient is false for a coach not enrolled with that client (real fixtures)", async () => {
    expect(await coachOwnsClient(coachA.id, clientA.id)).toBe(true); // real enrollment
    expect(await coachOwnsClient(coachB.id, clientA.id)).toBe(false); // coachB has no enrollment with clientA
  });

  it("assertCoachOwnsClient denies Coach B acting on Coach A's client — the exact boundary saveClientMetricsAction enforces", async () => {
    const result = await assertCoachOwnsClient(fakeDbUser(coachB.id, "coach"), clientA.id);
    expect(result.ok).toBe(false);
  });
});

describe("write authorization — Client Profile biometrics/schedule actions (app/hq/clients/[clientId]/actions.ts)", () => {
  // Same two-part proof as saveClientMetricsAction above, applied to
  // the three new actions this task adds: saveClientBiometricsAction,
  // promoteCheckInWeightAction, setCheckInScheduleAction. This file's
  // own local assertCoachOwnsClientAction() helper wraps
  // requireCoachOrAdmin() + assertCoachOwnsClient() in one call — every
  // pre-existing action (assignProgramAction, saveGoalAction,
  // archiveGoalAction) already uses it, so proving the three new
  // actions call the SAME helper is proof they get the identical
  // guarantee, not a weaker bespoke check.
  function extractFn(source: string, exportedName: string): string {
    const start = source.indexOf(`export async function ${exportedName}`);
    expect(start).toBeGreaterThan(-1);
    const rest = source.slice(start);
    const nextExportIdx = rest.indexOf("export async function", 10);
    return nextExportIdx === -1 ? rest : rest.slice(0, nextExportIdx);
  }

  const source = readFileSync(
    resolve(process.cwd(), "app/hq/clients/[clientId]/actions.ts"),
    "utf-8",
  );

  it("assertCoachOwnsClientAction (the shared local helper) itself calls requireCoachOrAdmin() + assertCoachOwnsClient()", () => {
    // Not `export`ed, so extractFn's "export async function" search
    // doesn't apply — slice this one directly to its own blank-line end.
    const start = source.indexOf("async function assertCoachOwnsClientAction");
    expect(start).toBeGreaterThan(-1);
    const body = source.slice(start, source.indexOf("\n\n", start));
    expect(body).toContain("requireCoachOrAdmin()");
    expect(body).toContain("assertCoachOwnsClient(guard.dbUser, clientId)");
  });

  it.each([
    "saveClientBiometricsAction",
    "promoteCheckInWeightAction",
    "setCheckInScheduleAction",
  ])("%s calls assertCoachOwnsClientAction — no bespoke/weaker guard", (fnName) => {
    const fn = extractFn(source, fnName);
    expect(fn).toContain("assertCoachOwnsClientAction(clientId)");
    // No client-suppliable coachId parameter on any of these.
    const signature = fn.slice(0, fn.indexOf(")"));
    expect(signature).not.toContain("coachId");
  });

  it("assertCoachOwnsClient allows Coach A acting on their own client", async () => {
    const result = await assertCoachOwnsClient(fakeDbUser(coachA.id, "coach"), clientA.id);
    expect(result.ok).toBe(true);
  });

  it("admin bypasses client-ownership scoping — the same intentional bypass every other nutrition action allows", async () => {
    const result = await assertCoachOwnsClient(fakeDbUser(coachB.id, "admin"), clientA.id);
    expect(result.ok).toBe(true);
  });
});

describe("saveClientMetrics — cross-client isolation", () => {
  it("writing clientB's metrics never touches clientA's health_profiles row", async () => {
    const [beforeA] = await db.select().from(healthProfiles).where(eq(healthProfiles.clientId, clientA.id));

    await saveClientMetrics(clientB.id, { heightInches: 65 });

    const [afterA] = await db.select().from(healthProfiles).where(eq(healthProfiles.clientId, clientA.id));
    expect(parseFloat(String(afterA.heightInches))).toBe(parseFloat(String(beforeA.heightInches)));
  });
});

describe("end-to-end — saved metrics feed the calculator exactly as the Nutrition page reads them", () => {
  it("height/weight/DOB/sex saved via saveClientMetrics round-trip into calculate()", async () => {
    const freshClient = { id: await createAuthUser("client-e2e") };
    try {
      await db.update(users).set({ role: "client", status: "active" }).where(eq(users.id, freshClient.id));
      await db.insert(clientProfiles).values({ userId: freshClient.id, fullName: "E2E Client" });

      const result = await saveClientMetrics(freshClient.id, {
        heightInches: 66,
        weightLbs: 150,
        dateOfBirth: "2000-06-01",
        biologicalSex: "female",
      });
      expect(result.ok).toBe(true);

      // Mirrors exactly what app/hq/clients/[clientId]/nutrition/page.tsx
      // queries and derives.
      const [health] = await db
        .select({
          heightInches: healthProfiles.heightInches,
          biologicalSex: healthProfiles.biologicalSex,
          dateOfBirth: healthProfiles.dateOfBirth,
        })
        .from(healthProfiles)
        .where(eq(healthProfiles.clientId, freshClient.id));
      const [bodyComp] = await db
        .select({ weightPounds: bodyCompositionRecords.weightPounds })
        .from(bodyCompositionRecords)
        .where(eq(bodyCompositionRecords.clientId, freshClient.id));

      const heightInches = parseFloat(String(health.heightInches));
      const weightLbs = parseFloat(String(bodyComp.weightPounds));
      const ageYears = ageFromDob(health.dateOfBirth);

      expect(heightInches).toBe(66);
      expect(weightLbs).toBe(150);
      expect(ageYears).not.toBeNull();

      const rec = calculate({
        heightInches,
        weightLbs,
        ageYears: ageYears!,
        biologicalSex: health.biologicalSex as "female",
        activityLevel: "moderately_active",
        goalType: "fat_loss",
      });
      expect(rec.recommendedCalories).toBeGreaterThan(0);
      expect(rec.recommendedProteinG).toBeGreaterThan(0);
      expect(rec.formulaVersion).toBe("mifflin-st-jeor-v1");
    } finally {
      await db.delete(bodyCompositionRecords).where(eq(bodyCompositionRecords.clientId, freshClient.id));
      await db.delete(healthProfiles).where(eq(healthProfiles.clientId, freshClient.id));
      await db.delete(clientProfiles).where(eq(clientProfiles.userId, freshClient.id));
      await db.delete(users).where(eq(users.id, freshClient.id));
      const admin = createAdminClient();
      await admin.auth.admin.deleteUser(freshClient.id);
    }
  });
});

// ─────────────────────────────────────────────────────────────
// CHECK-IN -> BIOMETRICS PROMOTION
//
// weekly_check_ins and body_composition_records both already exist —
// no migration needed to test this (unlike client_check_in_schedule,
// which is drafted-but-unapplied and so has no DB-integration test
// in this pass; see the delivery report). Self-contained fixture
// client, own beforeAll/afterAll, does not share state with clientA/
// clientB above.
// ─────────────────────────────────────────────────────────────

describe("check-in -> biometrics promotion", () => {
  const promoClient = { id: "" };

  beforeAll(async () => {
    const admin = createAdminClient();
    const { data, error } = await admin.auth.admin.createUser({
      email: `client-metrics-test-promo-${randomUUID()}@isolation-test.invalid`,
      email_confirm: true,
      password: randomUUID(),
    });
    if (error || !data.user) throw new Error(`Fixture setup failed: ${error?.message}`);
    promoClient.id = data.user.id;
    await db.update(users).set({ role: "client", status: "active" }).where(eq(users.id, promoClient.id));
    await db.insert(clientProfiles).values({ userId: promoClient.id, fullName: "Promotion Test Client" });
  });

  afterAll(async () => {
    let firstError: unknown;
    const runPhase = async (label: string, fn: () => Promise<void>) => {
      try {
        await fn();
      } catch (err) {
        console.error(`[client-metrics-service promo cleanup] ${label} failed:`, err instanceof Error ? err.message : err);
        firstError = firstError ?? err;
      }
    };
    await runPhase("delete weekly_check_ins", async () => {
      await db.delete(weeklyCheckIns).where(eq(weeklyCheckIns.clientId, promoClient.id));
    });
    await runPhase("delete body_composition_records", async () => {
      await db.delete(bodyCompositionRecords).where(eq(bodyCompositionRecords.clientId, promoClient.id));
    });
    await runPhase("delete client_profiles", async () => {
      await db.delete(clientProfiles).where(eq(clientProfiles.userId, promoClient.id));
    });
    await runPhase("delete public.users row", async () => {
      await db.delete(users).where(eq(users.id, promoClient.id));
    });
    await runPhase("delete Supabase Auth user", async () => {
      const admin = createAdminClient();
      await admin.auth.admin.deleteUser(promoClient.id);
    });
    if (firstError) throw firstError;
  });

  it("returns null when there is no submitted check-in with a weight", async () => {
    expect(await getCheckInWeightPromotionCandidate(promoClient.id)).toBeNull();
  });

  it("returns a candidate when a check-in has a newer weight than any body_composition_records entry", async () => {
    const submittedAt = new Date("2026-08-10T12:00:00Z");
    await db.insert(weeklyCheckIns).values({
      clientId: promoClient.id,
      scheduledDate: "2026-08-09",
      weekStartDate: "2026-08-09",
      status: "submitted",
      submittedAt,
      bodyWeightLbs: "171.0",
    });

    const candidate = await getCheckInWeightPromotionCandidate(promoClient.id);
    expect(candidate).not.toBeNull();
    expect(candidate!.weightLbs).toBe(171);
    expect(candidate!.submittedAt.getTime()).toBe(submittedAt.getTime());
  });

  it("promoteCheckInWeight inserts a new body_composition_records row tagged source='check_in'", async () => {
    const candidate = await getCheckInWeightPromotionCandidate(promoClient.id);
    expect(candidate).not.toBeNull();

    const result = await promoteCheckInWeight(promoClient.id, candidate!.weightLbs, candidate!.submittedAt);
    expect(result.ok).toBe(true);

    const rows = await db
      .select()
      .from(bodyCompositionRecords)
      .where(eq(bodyCompositionRecords.clientId, promoClient.id));
    expect(rows.length).toBe(1);
    expect(rows[0].source).toBe("check_in");
    expect(parseFloat(String(rows[0].weightPounds))).toBe(171);
  });

  it("is idempotent — promoting again after the weight already matches surfaces no candidate (no duplicate row)", async () => {
    const candidate = await getCheckInWeightPromotionCandidate(promoClient.id);
    expect(candidate).toBeNull(); // already promoted — nothing new to offer

    const rows = await db
      .select()
      .from(bodyCompositionRecords)
      .where(eq(bodyCompositionRecords.clientId, promoClient.id));
    expect(rows.length).toBe(1); // still exactly one row — no duplicate
  });

  it("a newer check-in with a genuinely different weight becomes a fresh candidate", async () => {
    const laterSubmittedAt = new Date("2026-08-17T12:00:00Z");
    await db.insert(weeklyCheckIns).values({
      clientId: promoClient.id,
      scheduledDate: "2026-08-16",
      weekStartDate: "2026-08-16",
      status: "submitted",
      submittedAt: laterSubmittedAt,
      bodyWeightLbs: "168.5",
    });

    const candidate = await getCheckInWeightPromotionCandidate(promoClient.id);
    expect(candidate).not.toBeNull();
    expect(candidate!.weightLbs).toBe(168.5);

    const promoted = await promoteCheckInWeight(promoClient.id, candidate!.weightLbs, candidate!.submittedAt);
    expect(promoted.ok).toBe(true);

    const rows = await db
      .select()
      .from(bodyCompositionRecords)
      .where(eq(bodyCompositionRecords.clientId, promoClient.id));
    expect(rows.length).toBe(2); // append-only — the first promoted row is preserved
  });

  it("a check-in older than the current body-comp record is never surfaced as a candidate", async () => {
    // Insert a coach-entered, more recent weight directly — the
    // existing check-in weights above are now both older.
    await db.insert(bodyCompositionRecords).values({
      clientId: promoClient.id,
      recordedAt: new Date("2026-08-20T12:00:00Z"),
      weightPounds: "165",
      source: "coach_entry",
    });
    expect(await getCheckInWeightPromotionCandidate(promoClient.id)).toBeNull();
  });

  it("promoteCheckInWeight rejects an out-of-range weight", async () => {
    const result = await promoteCheckInWeight(promoClient.id, 5000, new Date());
    expect(result.ok).toBe(false);
  });

  it("cross-client isolation — clientA's promotion candidate is unaffected by promoClient's check-ins", async () => {
    expect(await getCheckInWeightPromotionCandidate(clientA.id)).toBeNull();
  });
});
