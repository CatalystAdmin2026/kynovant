// ─────────────────────────────────────────────────────────────
// Coach HQ Check-In Schedule action — security & wiring proof
//
// setCheckInScheduleAction (app/hq/clients/[clientId]/actions.ts) is
// a "use server" action gated by requireCoachOrAdmin(), which needs a
// real Next.js request context (cookies()) — not invokable directly
// from Vitest, the same constraint documented in
// program-generator-review-triage.test.ts and coach-tenant-isolation
// .test.ts for every other guarded action in this codebase. This
// suite instead exercises, behaviorally, every piece the action
// composes:
//
//   1. validateScheduleWeekdays (lib/checkin/schedule.ts) — the pure
//      input gate the action calls FIRST, before any DB/auth work.
//      Full coverage lives in lib/checkin/__tests__/schedule.test.ts;
//      this file adds two integration-level calls through the real
//      exported action (not just the extracted helper) to prove the
//      action actually short-circuits on bad input before ever
//      reaching assertCoachOwnsClientAction/requireCoachOrAdmin — a
//      malformed-clientId or malformed-weekdays call here executes
//      end-to-end with ZERO database or session dependency, so it
//      runs today with no migration required.
//
//   2. assertCoachOwnsClient (lib/auth/guards.ts) — the ownership
//      gate assertCoachOwnsClientAction wraps and the action calls
//      immediately after validation passes. Real-DB, real fixtures,
//      dedicated to this feature's own coach/client pairing (the
//      general cross-coach/admin-bypass guarantee is already proven
//      generically in coach-tenant-isolation.test.ts; this suite
//      proves the SAME function with fixtures scoped to check-in
//      schedule ownership, then exercises the actual
//      setClientSchedule() write once ownership passes).
//
//   3. Signature-level proof that no coachId parameter exists for a
//      caller to supply — coach identity is derivable ONLY from the
//      session inside assertCoachOwnsClientAction, never from an
//      argument.
//
// setClientSchedule() itself requires drizzle/0031
// (client_check_in_schedule) applied — NOT applied in this pass, so
// the write-after-ownership-check test is expected to fail against
// the current database with "relation does not exist," exactly like
// every other test in check-in-schedule-service.test.ts and
// check-in-occurrence-model.test.ts. That failure mode is called out
// explicitly at its own test, not hidden.
//
// Requires a reachable DATABASE_URL. vitest.config.ts loads .env.local
// automatically.
// ─────────────────────────────────────────────────────────────

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { randomUUID } from "crypto";
import { eq, inArray } from "drizzle-orm";
import { getDb } from "../client";
import { createAdminClient } from "@/lib/supabase/admin";
import { users, clientProfiles, coachingEnrollments } from "../schema";
import { clientCheckInSchedule } from "../schema-check-in";
import { assertCoachOwnsClient } from "@/lib/auth/guards";
import type { PublicUser } from "@/lib/supabase/session";
import { setCheckInScheduleAction } from "@/app/hq/clients/[clientId]/actions";
import { getClientSchedule, setClientSchedule } from "../check-in-schedule-service";

const db = getDb();

function fakeDbUser(id: string, role: "coach" | "admin"): PublicUser {
  // Only the fields resolveTenantScope()/assertCoachOwnsClient() read.
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

const coachA = { id: "" };
const coachB = { id: "" };
const clientA = { id: "" };

async function createAuthUser(label: string): Promise<string> {
  const admin = createAdminClient();
  const { data, error } = await admin.auth.admin.createUser({
    email: `checkin-schedule-action-test-${label}-${randomUUID()}@isolation-test.invalid`,
    email_confirm: true,
    password: randomUUID(),
  });
  if (error || !data.user) {
    throw new Error(`Fixture setup failed: createUser(${label}) — ${error?.message}`);
  }
  return data.user.id;
}

beforeAll(async () => {
  [coachA.id, coachB.id, clientA.id] = await Promise.all([
    createAuthUser("coach-a"),
    createAuthUser("coach-b"),
    createAuthUser("client-a"),
  ]);
  await Promise.all([
    db.update(users).set({ role: "coach", status: "active" }).where(eq(users.id, coachA.id)),
    db.update(users).set({ role: "coach", status: "active" }).where(eq(users.id, coachB.id)),
    db.update(users).set({ role: "client", status: "active" }).where(eq(users.id, clientA.id)),
  ]);
  await db.insert(clientProfiles).values({ userId: clientA.id, fullName: "Schedule Action Test Client" });
  // Only clientA is enrolled with coachA — coachB has no relationship
  // to clientA at all, the exact "cannot update Coach B's client"
  // shape (from coachB's perspective, clientA is someone else's client).
  await db.insert(coachingEnrollments).values({
    clientId: clientA.id,
    coachId: coachA.id,
    packageType: "Standard",
    monthlyRateCents: 0,
    status: "active",
  });
});

afterAll(async () => {
  const clientIds = [clientA.id].filter(Boolean);
  const userIds = [coachA.id, coachB.id, ...clientIds].filter(Boolean);
  await db.delete(clientCheckInSchedule).where(inArray(clientCheckInSchedule.clientId, clientIds)).catch(() => {});
  await db.delete(coachingEnrollments).where(inArray(coachingEnrollments.clientId, clientIds));
  await db.delete(clientProfiles).where(inArray(clientProfiles.userId, clientIds));
  if (userIds.length > 0) {
    await db.delete(users).where(inArray(users.id, userIds));
    const admin = createAdminClient();
    await Promise.all(userIds.map((id) => admin.auth.admin.deleteUser(id)));
  }
});

describe("setCheckInScheduleAction — input validation short-circuits before any auth/DB work", () => {
  it("rejects a missing clientId with zero database or session dependency", async () => {
    const result = await setCheckInScheduleAction("", [0]);
    expect(result.ok).toBe(false);
    expect(result.error).toMatch(/client id/i);
  });

  it("rejects malformed weekdays before reaching the ownership gate — a bogus clientId never causes a 'not found' error here, proving validation runs first", async () => {
    const result = await setCheckInScheduleAction("not-a-real-client-id", [7, -1]);
    expect(result.ok).toBe(false);
    expect(result.error).toMatch(/invalid weekday/i);
  });

  it("rejects a duplicate weekday the same way, before reaching the ownership gate", async () => {
    const result = await setCheckInScheduleAction("not-a-real-client-id", [0, 3, 0]);
    expect(result.ok).toBe(false);
    expect(result.error).toMatch(/duplicate/i);
  });
});

describe("setCheckInScheduleAction — no coachId parameter exists for a caller to supply", () => {
  it("the exported action's signature accepts exactly (clientId, weekdays) — no third coachId argument", () => {
    // Coach identity is derived exclusively from the session inside
    // assertCoachOwnsClientAction (requireCoachOrAdmin() -> the
    // authenticated dbUser); there is no parameter position for a
    // caller to inject one. Function.length reflects the declared
    // parameter count, so this is a real structural guarantee, not a
    // string search — TypeScript itself would reject a third argument
    // at every call site, including any future Client Component that
    // tries to pass one.
    expect(setCheckInScheduleAction.length).toBe(2);
  });
});

describe("assertCoachOwnsClient — the ownership gate setCheckInScheduleAction calls, scoped to this feature's own fixtures", () => {
  it("allows Coach A to act on their own client (clientA)", async () => {
    const result = await assertCoachOwnsClient(fakeDbUser(coachA.id, "coach"), clientA.id);
    expect(result.ok).toBe(true);
  });

  it("denies Coach B acting on Coach A's client — Coach B has no enrollment with clientA at all", async () => {
    const result = await assertCoachOwnsClient(fakeDbUser(coachB.id, "coach"), clientA.id);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toBe("Not found");
  });

  it("admin bypasses the ownership check entirely", async () => {
    const result = await assertCoachOwnsClient(fakeDbUser(coachB.id, "admin"), clientA.id);
    expect(result.ok).toBe(true);
  });
});

describe("End-to-end: ownership check then the real transactional write (requires drizzle/0031 applied)", () => {
  it("Coach A, once authorized, can actually set clientA's schedule via setClientSchedule — the exact call setCheckInScheduleAction makes after its own auth gate passes", async () => {
    const auth = await assertCoachOwnsClient(fakeDbUser(coachA.id, "coach"), clientA.id);
    expect(auth.ok).toBe(true);

    const result = await setClientSchedule(clientA.id, [3, 0]);
    expect(result.ok).toBe(true);
    expect(await getClientSchedule(clientA.id)).toEqual([0, 3]);
  });

  it("[] intentionally clears clientA's active schedule", async () => {
    await setClientSchedule(clientA.id, [0]);
    const result = await setClientSchedule(clientA.id, []);
    expect(result.ok).toBe(true);
    expect(await getClientSchedule(clientA.id)).toEqual([]);
  });
});
