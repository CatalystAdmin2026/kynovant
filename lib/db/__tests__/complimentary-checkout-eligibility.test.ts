// ─────────────────────────────────────────────────────────────
// Complimentary access × checkout eligibility — closes a gap in the
// pre-existing checkout-eligibility.test.ts, which predates the
// complimentary-access feature and never exercised it. Written for the
// controlled production rollout's explicit truth-table requirement:
//
//   L. A complimentary coach cannot start checkout (and therefore
//      cannot receive a second/duplicate trial or session) merely
//      because their complimentary grant exists.
//   M. Once complimentary access is revoked, a coach who NEVER had a
//      coach_subscriptions row is eligible for the normal first-time
//      14-day trial — CONFIRMED INTENTIONAL product decision (do not
//      change): complimentary access does not consume a coach's future
//      first-trial eligibility.
//   N. A coach who HAD prior coach_subscriptions history (e.g. a real,
//      later-cancelled subscription) before/around a complimentary
//      grant does NOT get a second trial once that grant is revoked —
//      resolveCheckoutEligibility's existing "any row at all withholds
//      the trial" rule is untouched by complimentary access.
//
// resolveCheckoutEligibility() itself is completely unmodified by the
// complimentary-access feature — this suite proves that fact holds in
// practice, not just by inspection.
// ─────────────────────────────────────────────────────────────

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { randomUUID } from "crypto";
import { eq, inArray } from "drizzle-orm";
import { getDb } from "../client";
import { createAdminClient } from "@/lib/supabase/admin";
import { users } from "../schema";
import { coachSubscriptions, coachComplimentaryAccess } from "../schema-billing";
import { resolveCheckoutEligibility, getCoachEntitlement } from "../coach-subscription-service";
import { grantComplimentaryAccess, revokeComplimentaryAccess } from "../coach-complimentary-access-service";

const db = getDb();

const coachNeverBilled = { id: "" }; // scenario M — never had a coach_subscriptions row
const coachPriorHistory = { id: "" }; // scenario N — had a real (now cancelled) subscription
const admin = { id: "" };

async function createAuthUser(label: string): Promise<string> {
  const supa = createAdminClient();
  const { data, error } = await supa.auth.admin.createUser({
    email: `comp-checkout-test-${label}-${randomUUID()}@isolation-test.invalid`,
    email_confirm: true,
    password: randomUUID(),
  });
  if (error || !data.user) {
    throw new Error(`Fixture setup failed: createUser(${label}) — ${error?.message}`);
  }
  return data.user.id;
}

beforeAll(async () => {
  [coachNeverBilled.id, coachPriorHistory.id, admin.id] = await Promise.all([
    createAuthUser("never-billed"),
    createAuthUser("prior-history"),
    createAuthUser("admin"),
  ]);
  await Promise.all([
    db.update(users).set({ role: "coach", status: "active" }).where(eq(users.id, coachNeverBilled.id)),
    db.update(users).set({ role: "coach", status: "active" }).where(eq(users.id, coachPriorHistory.id)),
    db.update(users).set({ role: "admin", status: "active" }).where(eq(users.id, admin.id)),
  ]);
});

afterAll(async () => {
  let firstError: unknown;
  const runPhase = async (label: string, fn: () => Promise<void>) => {
    try {
      await fn();
    } catch (err) {
      console.error(`[complimentary-checkout-eligibility cleanup] ${label} failed:`, err instanceof Error ? err.message : err);
      firstError = firstError ?? err;
    }
  };

  const coachIds = [coachNeverBilled.id, coachPriorHistory.id].filter(Boolean);
  await runPhase("delete coach_complimentary_access rows", async () => {
    if (coachIds.length === 0) return;
    await db.delete(coachComplimentaryAccess).where(inArray(coachComplimentaryAccess.coachId, coachIds));
  });
  await runPhase("delete coach_subscriptions rows", async () => {
    if (coachIds.length === 0) return;
    await db.delete(coachSubscriptions).where(inArray(coachSubscriptions.coachId, coachIds));
  });

  const userIds = [coachNeverBilled.id, coachPriorHistory.id, admin.id].filter(Boolean);
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

describe("L — a complimentary coach cannot start checkout while comp is active", () => {
  it("resolveCheckoutEligibility denies checkout for an actively-complimentary coach — no second trial/session is reachable", async () => {
    await grantComplimentaryAccess({ coachId: coachNeverBilled.id, grantedBy: admin.id, reason: "Truth-table test L" });

    const entitlement = await getCoachEntitlement(coachNeverBilled.id);
    expect(entitlement.allowed).toBe(true);
    expect(entitlement.status).toBe("complimentary");

    const eligibility = await resolveCheckoutEligibility(coachNeverBilled.id);
    expect(eligibility.allowed).toBe(false);
    if (!eligibility.allowed) expect(eligibility.entitlement.status).toBe("complimentary");
  });
});

describe("M — revoked complimentary access, never billed before, is eligible for the normal FIRST trial (confirmed intentional, do not change)", () => {
  it("resolveCheckoutEligibility grants a trial once comp is revoked for a coach with no coach_subscriptions row ever", async () => {
    const revokeResult = await revokeComplimentaryAccess(coachNeverBilled.id, admin.id, "Truth-table test M");
    expect(revokeResult.ok).toBe(true);

    const entitlement = await getCoachEntitlement(coachNeverBilled.id);
    expect(entitlement.allowed).toBe(false);
    expect(entitlement.status).toBe("none");

    const eligibility = await resolveCheckoutEligibility(coachNeverBilled.id);
    expect(eligibility.allowed).toBe(true);
    if (eligibility.allowed) expect(eligibility.grantTrial).toBe(true);
  });
});

describe.each([
  { label: "G/H — trialing", status: "trialing" as const, revokedFallbackStatus: "trialing" as const },
  { label: "I/J — cancelled", status: "cancelled" as const, revokedFallbackStatus: "cancelled" as const },
  { label: "K — suspended", status: "suspended" as const, revokedFallbackStatus: "suspended" as const },
])("$label — active comp always wins while active; revoking falls through to the coach's real $status subscription state", ({ status, revokedFallbackStatus }) => {
  it(`active comp + ${status} subscription → allowed via comp, subscription row untouched`, async () => {
    await db
      .insert(coachSubscriptions)
      .values({ coachId: coachPriorHistory.id, status, cancelledAt: status === "cancelled" ? new Date() : null })
      .onConflictDoUpdate({
        target: coachSubscriptions.coachId,
        set: { status, cancelledAt: status === "cancelled" ? new Date() : null, gracePeriodEnd: null },
      });

    await grantComplimentaryAccess({ coachId: coachPriorHistory.id, grantedBy: admin.id, reason: `Truth-table ${status}` });

    const entitlement = await getCoachEntitlement(coachPriorHistory.id);
    expect(entitlement.allowed).toBe(true);
    expect(entitlement.status).toBe("complimentary");

    const [row] = await db.select({ status: coachSubscriptions.status }).from(coachSubscriptions).where(eq(coachSubscriptions.coachId, coachPriorHistory.id));
    expect(row.status).toBe(status);
  });

  it(`revoking comp falls through to the real ${status} subscription state — ${
    revokedFallbackStatus === "trialing" ? "still allowed (trialing stays usable)" : "not allowed (matches that status's own denied behavior)"
  }`, async () => {
    const revokeResult = await revokeComplimentaryAccess(coachPriorHistory.id, admin.id);
    expect(revokeResult.ok).toBe(true);

    const entitlement = await getCoachEntitlement(coachPriorHistory.id);
    expect(entitlement.status).toBe(revokedFallbackStatus);
    expect(entitlement.allowed).toBe(revokedFallbackStatus === "trialing");

    // Clean this coach's subscription row back out before the next
    // iteration in this describe.each reuses coachPriorHistory.
    await db.delete(coachSubscriptions).where(eq(coachSubscriptions.coachId, coachPriorHistory.id));
  });
});

describe("N — a coach with prior real subscription history does NOT get a second trial after a complimentary grant is revoked", () => {
  it("resolveCheckoutEligibility withholds the trial for a coach whose coach_subscriptions row (now cancelled) predates/coexists with a since-revoked complimentary grant", async () => {
    // Real (fixture) billing history — a cancelled subscription, exactly
    // the same shape resolveCheckoutEligibility's own pre-existing
    // "any row at all withholds the trial" rule already covers for a
    // non-complimentary coach.
    await db.insert(coachSubscriptions).values({
      coachId: coachPriorHistory.id,
      status: "cancelled",
      cancelledAt: new Date(),
    });

    await grantComplimentaryAccess({ coachId: coachPriorHistory.id, grantedBy: admin.id, reason: "Truth-table test N" });
    expect((await getCoachEntitlement(coachPriorHistory.id)).status).toBe("complimentary");

    const revokeResult = await revokeComplimentaryAccess(coachPriorHistory.id, admin.id);
    expect(revokeResult.ok).toBe(true);

    const entitlement = await getCoachEntitlement(coachPriorHistory.id);
    expect(entitlement.allowed).toBe(false);
    expect(entitlement.status).toBe("cancelled");

    const eligibility = await resolveCheckoutEligibility(coachPriorHistory.id);
    expect(eligibility.allowed).toBe(true);
    if (eligibility.allowed) expect(eligibility.grantTrial).toBe(false);
  });
});
