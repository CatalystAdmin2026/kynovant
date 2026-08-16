// ─────────────────────────────────────────────────────────────
// Coach Complimentary Access — integration test suite
//
// REQUIRES migration 0030 (drizzle/0030_coach_complimentary_access.sql)
// to have been applied — the coach_complimentary_access table does not
// exist until then. Per this task's explicit instruction, that
// migration is NOT applied as part of this change; run this suite
// after applying it (see the rollout steps in the final report).
//
// Proves, against a real database connection:
//   1. grantComplimentaryAccess() → getCoachEntitlement() returns
//      { status: "complimentary", allowed: true }.
//   2. Granting is idempotent — a second grant on an already-active
//      coach updates the same row rather than creating a duplicate
//      (the partial unique index would reject a real duplicate insert;
//      this proves the service never attempts one).
//   3. revokeComplimentaryAccess() on a coach with no active grant
//      fails cleanly (ok:false), same shape as suspendCoachSubscription().
//   4. PRECEDENCE: a coach with a REAL, valid coach_subscriptions row
//      (status: active) who is ALSO granted complimentary access is
//      reported as "complimentary" by getCoachEntitlement() — and,
//      critically, their coach_subscriptions row is completely
//      untouched by the grant (proves "must not accidentally
//      cancel/overwrite billing").
//   5. Revoking complimentary access for that same coach falls back to
//      their real subscription's own state — they remain entitled,
//      now as "active" (proves "existing paid/trialing coach remains
//      entitled if comp is revoked").
//   6. A coach with NO coach_subscriptions row at all, once their
//      complimentary grant is revoked, falls to "none"/not-allowed —
//      fails closed, no stale access (proves "revoked complimentary
//      access actually fails closed").
//   7. Expiration: a grant with expiresAt already in the past is
//      lazily closed out (status → 'expired') on the very next
//      getCoachEntitlement() read, and denies access.
//   8. listActiveComplimentaryCoachIds() reflects only genuinely
//      active, non-expired grants — used by Overwatch's directory.
// ─────────────────────────────────────────────────────────────

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { randomUUID } from "crypto";
import { eq, inArray } from "drizzle-orm";
import { getDb } from "../client";
import { createAdminClient } from "@/lib/supabase/admin";
import { users } from "../schema";
import { coachSubscriptions, coachComplimentaryAccess } from "../schema-billing";
import { getCoachEntitlement } from "../coach-subscription-service";
import {
  grantComplimentaryAccess,
  revokeComplimentaryAccess,
  getActiveComplimentaryAccess,
  listActiveComplimentaryCoachIds,
} from "../coach-complimentary-access-service";

const db = getDb();

const coachA = { id: "" };
const coachB = { id: "" };
const admin = { id: "" };

async function createAuthUser(label: string): Promise<string> {
  const supa = createAdminClient();
  const { data, error } = await supa.auth.admin.createUser({
    email: `comp-access-test-${label}-${randomUUID()}@isolation-test.invalid`,
    email_confirm: true,
    password: randomUUID(),
  });
  if (error || !data.user) {
    throw new Error(`Fixture setup failed: createUser(${label}) — ${error?.message}`);
  }
  return data.user.id;
}

beforeAll(async () => {
  [coachA.id, coachB.id, admin.id] = await Promise.all([
    createAuthUser("coach-a"),
    createAuthUser("coach-b"),
    createAuthUser("admin"),
  ]);
  await Promise.all([
    db.update(users).set({ role: "coach", status: "active" }).where(eq(users.id, coachA.id)),
    db.update(users).set({ role: "coach", status: "active" }).where(eq(users.id, coachB.id)),
    db.update(users).set({ role: "admin", status: "active" }).where(eq(users.id, admin.id)),
  ]);
});

// Cleanup robustness — same philosophy as program-generator-integration.
// test.ts's afterAll: every phase runs in its own try/catch, ALL phases
// are attempted regardless of an earlier one failing, and Auth-user
// deletion (the step that actually keeps @isolation-test.invalid
// accounts from leaking) always runs last, via Promise.allSettled. This
// matters especially here: this suite's own coach_complimentary_access
// cleanup phase will throw outright if migration 0030 hasn't been
// applied yet (relation does not exist) — before this fix, that
// unhandled throw aborted the rest of afterAll and leaked every fixture
// Auth user this suite created. Confirmed and cleaned up once during
// this feature's own development, which is exactly why this exists now.
afterAll(async () => {
  let firstError: unknown;

  const runPhase = async (label: string, fn: () => Promise<void>) => {
    try {
      await fn();
    } catch (err) {
      console.error(`[coach-complimentary-access cleanup] ${label} failed:`, err instanceof Error ? err.message : err);
      firstError = firstError ?? err;
    }
  };

  const coachIds = [coachA.id, coachB.id].filter(Boolean);

  await runPhase("delete coach_complimentary_access rows", async () => {
    if (coachIds.length === 0) return;
    await db.delete(coachComplimentaryAccess).where(inArray(coachComplimentaryAccess.coachId, coachIds));
  });

  await runPhase("delete coach_subscriptions rows", async () => {
    if (coachIds.length === 0) return;
    await db.delete(coachSubscriptions).where(inArray(coachSubscriptions.coachId, coachIds));
  });

  const userIds = [coachA.id, coachB.id, admin.id].filter(Boolean);
  if (userIds.length > 0) {
    await runPhase("delete public.users rows", async () => {
      await db.delete(users).where(inArray(users.id, userIds));
    });

    await runPhase("delete Supabase Auth users", async () => {
      const supa = createAdminClient();
      const results = await Promise.allSettled(userIds.map((id) => supa.auth.admin.deleteUser(id)));
      for (const result of results) {
        if (result.status === "rejected") throw result.reason;
      }
    });
  }

  if (firstError) throw firstError;
});

describe("grantComplimentaryAccess / getCoachEntitlement — basic grant", () => {
  it("a fresh grant makes the coach entitled with status 'complimentary'", async () => {
    await grantComplimentaryAccess({ coachId: coachA.id, grantedBy: admin.id, reason: "Test grant" });
    const entitlement = await getCoachEntitlement(coachA.id);
    expect(entitlement.allowed).toBe(true);
    expect(entitlement.status).toBe("complimentary");
  });

  it("granting again on an already-active coach updates the same row, not a duplicate", async () => {
    const before = await db
      .select({ id: coachComplimentaryAccess.id })
      .from(coachComplimentaryAccess)
      .where(eq(coachComplimentaryAccess.coachId, coachA.id));
    expect(before).toHaveLength(1);

    await grantComplimentaryAccess({ coachId: coachA.id, grantedBy: admin.id, reason: "Updated reason" });

    const after = await db
      .select({ id: coachComplimentaryAccess.id, reason: coachComplimentaryAccess.reason })
      .from(coachComplimentaryAccess)
      .where(eq(coachComplimentaryAccess.coachId, coachA.id));
    expect(after).toHaveLength(1);
    expect(after[0].id).toBe(before[0].id);
    expect(after[0].reason).toBe("Updated reason");
  });
});

describe("revokeComplimentaryAccess", () => {
  it("fails cleanly for a coach with no active grant", async () => {
    const result = await revokeComplimentaryAccess(coachB.id, admin.id);
    expect(result.ok).toBe(false);
  });

  it("revoking removes entitlement — falls to 'none' when there is no coach_subscriptions row at all", async () => {
    await grantComplimentaryAccess({ coachId: coachB.id, grantedBy: admin.id });
    expect((await getCoachEntitlement(coachB.id)).allowed).toBe(true);

    const revokeResult = await revokeComplimentaryAccess(coachB.id, admin.id, "No longer needed");
    expect(revokeResult.ok).toBe(true);

    const entitlement = await getCoachEntitlement(coachB.id);
    expect(entitlement.allowed).toBe(false);
    expect(entitlement.status).toBe("none");
  });
});

describe("precedence — complimentary access never reads or writes coach_subscriptions", () => {
  it("a coach with a real active subscription who is ALSO granted complimentary access is reported as 'complimentary', and their subscription row is untouched", async () => {
    await db
      .insert(coachSubscriptions)
      .values({
        coachId: coachA.id,
        status: "active",
        stripeCustomerId: "cus_test_precedence",
        stripeSubscriptionId: "sub_test_precedence",
      })
      .onConflictDoUpdate({
        target: coachSubscriptions.coachId,
        set: { status: "active", stripeCustomerId: "cus_test_precedence", stripeSubscriptionId: "sub_test_precedence" },
      });

    await grantComplimentaryAccess({ coachId: coachA.id, grantedBy: admin.id, reason: "Precedence test" });

    const entitlement = await getCoachEntitlement(coachA.id);
    expect(entitlement.allowed).toBe(true);
    expect(entitlement.status).toBe("complimentary");

    const [subRow] = await db
      .select({ status: coachSubscriptions.status, stripeSubscriptionId: coachSubscriptions.stripeSubscriptionId })
      .from(coachSubscriptions)
      .where(eq(coachSubscriptions.coachId, coachA.id));
    expect(subRow.status).toBe("active");
    expect(subRow.stripeSubscriptionId).toBe("sub_test_precedence");
  });

  it("revoking complimentary access for that same coach falls back to their real subscription — they remain entitled as 'active', not locked out", async () => {
    const revokeResult = await revokeComplimentaryAccess(coachA.id, admin.id);
    expect(revokeResult.ok).toBe(true);

    const entitlement = await getCoachEntitlement(coachA.id);
    expect(entitlement.allowed).toBe(true);
    expect(entitlement.status).toBe("active");

    const [subRow] = await db
      .select({ status: coachSubscriptions.status })
      .from(coachSubscriptions)
      .where(eq(coachSubscriptions.coachId, coachA.id));
    expect(subRow.status).toBe("active");
  });
});

describe("expiration — lazy transition on read, same shape as past_due → suspended", () => {
  it("a grant with expiresAt already in the past denies access and persists status 'expired'", async () => {
    await db.delete(coachComplimentaryAccess).where(eq(coachComplimentaryAccess.coachId, coachB.id));
    await grantComplimentaryAccess({
      coachId: coachB.id,
      grantedBy: admin.id,
      expiresAt: new Date(Date.now() - 1000),
    });

    const active = await getActiveComplimentaryAccess(coachB.id);
    expect(active).toBeNull();

    const entitlement = await getCoachEntitlement(coachB.id);
    expect(entitlement.allowed).toBe(false);

    const [row] = await db
      .select({ status: coachComplimentaryAccess.status })
      .from(coachComplimentaryAccess)
      .where(eq(coachComplimentaryAccess.coachId, coachB.id));
    expect(row.status).toBe("expired");
  });

  it("a grant with a future expiresAt remains active", async () => {
    await db.delete(coachComplimentaryAccess).where(eq(coachComplimentaryAccess.coachId, coachB.id));
    await grantComplimentaryAccess({
      coachId: coachB.id,
      grantedBy: admin.id,
      expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
    });

    const entitlement = await getCoachEntitlement(coachB.id);
    expect(entitlement.allowed).toBe(true);
    expect(entitlement.status).toBe("complimentary");
  });
});

describe("listActiveComplimentaryCoachIds — Overwatch directory badge source", () => {
  it("includes only coaches with a genuinely active, non-expired grant", async () => {
    await db.delete(coachComplimentaryAccess).where(inArray(coachComplimentaryAccess.coachId, [coachA.id, coachB.id]));
    await grantComplimentaryAccess({ coachId: coachA.id, grantedBy: admin.id });

    const ids = await listActiveComplimentaryCoachIds();
    expect(ids.has(coachA.id)).toBe(true);
    expect(ids.has(coachB.id)).toBe(false);
  });
});
