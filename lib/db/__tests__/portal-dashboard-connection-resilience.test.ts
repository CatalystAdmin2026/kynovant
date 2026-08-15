// ─────────────────────────────────────────────────────────────
// Portal dashboard — connection-pool resilience + the exact flagged
// production account's data shape.
//
// Real integration tests against a REAL database connection (same
// fixture pattern as document-tenant-isolation.test.ts / coach-
// entitlement.test.ts: real Supabase Auth users where needed, real
// rows inserted directly, cleanup in afterAll()).
//
// PRODUCTION INCIDENT THIS SUITE GUARDS AGAINST:
//   A real client's /portal load threw the app's generic error
//   boundary immediately after a successful password reset + login.
//   Vercel runtime logs showed the actual exception: not a data-shape
//   null-pointer, but "(EMAXCONNSESSION) max clients reached in
//   session mode - max clients are limited to pool_size: 15" —
//   multiple unrelated queries (client_profiles, workout_sessions x2,
//   client_programs) all failed within the same few seconds for the
//   same request. Fixed in lib/db/client.ts (see
//   db-client-pool-config.test.ts for that half of the regression
//   coverage). This file proves the OTHER half: that the flagged
//   account's own data shape was never the problem, and that the
//   portal's real query pattern (a dozen-plus near-simultaneous
//   queries per page load, via nested Promise.all groups in
//   lib/db/portal-dashboard-service.ts) completes correctly under the
//   now-bounded pool instead of exhausting it.
// ─────────────────────────────────────────────────────────────

import { describe, it, expect, afterAll } from "vitest";
import { randomUUID } from "crypto";
import { eq, inArray } from "drizzle-orm";
import { getDb } from "../client";
import { createAdminClient } from "@/lib/supabase/admin";
import { users, clientProfiles } from "../schema";
import { getDashboardData, getCoachData } from "../portal-dashboard-service";
import { getClientProfile } from "@/lib/supabase/session";

const db = getDb();
const createdUserIds: string[] = [];

afterAll(async () => {
  if (createdUserIds.length > 0) {
    await db.delete(clientProfiles).where(inArray(clientProfiles.userId, createdUserIds));
    await db.delete(users).where(inArray(users.id, createdUserIds));
    const supa = createAdminClient();
    await Promise.all(createdUserIds.map((id) => supa.auth.admin.deleteUser(id).catch(() => {})));
  }
});

async function createMinimalClient(label: string): Promise<string> {
  const supa = createAdminClient();
  const { data, error } = await supa.auth.admin.createUser({
    email: `portal-resilience-test-${label}-${randomUUID()}@isolation-test.invalid`,
    email_confirm: true,
    password: randomUUID(),
  });
  if (error || !data.user) {
    throw new Error(`Fixture setup failed: createUser(${label}) — ${error?.message}`);
  }
  const id = data.user.id;
  createdUserIds.push(id);

  await db
    .update(users)
    .set({ role: "client", status: "active" })
    .where(eq(users.id, id));
  await db.insert(clientProfiles).values({ userId: id, fullName: "Portal Resilience Test" });

  return id;
}

describe("the exact flagged production account's data shape — never the actual problem", () => {
  it("db6ce22c-a5bf-4a72-a72b-490efd88d18a's full /portal data chain completes cleanly with safe empty states", async () => {
    // Deliberately NOT a freshly-created fixture — this is the real
    // account from the production incident, inspected read-only. It
    // has zero coaching_enrollments rows despite having client_programs
    // (an architecturally orphaned shape a real client likely could
    // never reach through the app's own flows — flagged separately as
    // a legacy-fixture finding, not fixed here since it isn't what
    // crashed the request). This test proves that shape renders safely
    // regardless: the crash was the connection pool, not this data.
    const clientId = "db6ce22c-a5bf-4a72-a72b-490efd88d18a";

    const [profile, dashboardData, coachData] = await Promise.all([
      getClientProfile(clientId),
      getDashboardData(clientId),
      getCoachData(clientId),
    ]);

    // No assertions on the profile's actual PII content — only that
    // the chain completed and returned well-formed, renderable shapes.
    expect(profile).not.toBeNull();
    expect(dashboardData.promises).toBeDefined();
    expect(dashboardData.weeklyCompliance.dailyStatuses).toHaveLength(7);
    expect(Array.isArray(dashboardData.achievements)).toBe(true);
    // Zero enrollments -> getCoachData's join correctly finds no row
    // and returns null (not an error) — PortalDashboard.tsx already
    // guards on this with `{coachData && (...)}`.
    expect(coachData).toBeNull();
  });
});

describe("portal dashboard queries under concurrent load — the bounded pool holds", () => {
  it("10 simultaneous full-portal-page loads (the exact getDashboardData + getCoachData + getClientProfile trio, in parallel) all succeed", async () => {
    const clientId = await createMinimalClient("concurrent-load");

    // Mirrors app/portal/page.tsx's own Promise.all([...]) exactly,
    // fired 10 times concurrently to simulate several portal viewers
    // (or several warm serverless instances) hitting the DB at once —
    // the load pattern that, pre-fix, could exhaust the shared 15-
    // connection Session Mode pooler.
    const loads = Array.from({ length: 10 }, () =>
      Promise.all([
        getClientProfile(clientId),
        getDashboardData(clientId),
        getCoachData(clientId),
      ]),
    );

    const results = await Promise.all(loads);
    expect(results).toHaveLength(10);
    for (const [profile, dashboardData] of results) {
      expect(profile).not.toBeNull();
      expect(dashboardData.weeklyCompliance.dailyStatuses).toHaveLength(7);
    }
  });
});
