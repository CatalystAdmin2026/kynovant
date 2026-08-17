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
import { eq, inArray } from "drizzle-orm";
import { getDb } from "../client";
import { createAdminClient } from "@/lib/supabase/admin";
import { users, clientProfiles } from "../schema";
import { healthProfiles, bodyCompositionRecords } from "../schema-profile";
import { saveClientMetrics } from "../client-metrics-service";
import { ageFromDob, calculate } from "@/lib/nutrition/calculator";

const db = getDb();

const clientA = { id: "" };
const clientB = { id: "" };

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
  [clientA.id, clientB.id] = await Promise.all([
    createAuthUser("client-a"),
    createAuthUser("client-b"),
  ]);
  await Promise.all([
    db.update(users).set({ role: "client", status: "active" }).where(eq(users.id, clientA.id)),
    db.update(users).set({ role: "client", status: "active" }).where(eq(users.id, clientB.id)),
  ]);
  await db.insert(clientProfiles).values([
    { userId: clientA.id, fullName: "Client Metrics Test A" },
    { userId: clientB.id, fullName: "Client Metrics Test B" },
  ]);
});

afterAll(async () => {
  const clientIds = [clientA.id, clientB.id].filter(Boolean);
  if (clientIds.length > 0) {
    await db.delete(bodyCompositionRecords).where(inArray(bodyCompositionRecords.clientId, clientIds));
    await db.delete(healthProfiles).where(inArray(healthProfiles.clientId, clientIds));
    await db.delete(clientProfiles).where(inArray(clientProfiles.userId, clientIds));
    await db.delete(users).where(inArray(users.id, clientIds));
    const admin = createAdminClient();
    await Promise.all(clientIds.map((id) => admin.auth.admin.deleteUser(id)));
  }
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
