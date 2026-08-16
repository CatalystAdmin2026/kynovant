// ─────────────────────────────────────────────────────────────
// Checkout eligibility — regression suite for the two billing
// hardening items from the pre-launch audit:
//
//   1. startCheckoutAction previously relied on the page-level
//      entitlement redirect (app/account-status/page.tsx's own
//      `if (entitlement.allowed) redirect("/hq")`) rather than
//      enforcing entitlement inside the Server Action itself — a
//      direct/replayed invocation of the action bypassed that
//      entirely. resolveCheckoutEligibility() closes this: proven
//      below for every entitlement status this app models.
//
//   2. Every Checkout Session unconditionally included
//      trial_period_days, so a coach could receive a fresh 14-day
//      trial on every new Checkout Session, including after
//      cancelling a prior one. resolveCheckoutEligibility() grants a
//      trial ONLY when coach_subscriptions has no row at all — the
//      existing, already-durable evidence this architecture has for
//      "has this coach ever been through checkout before" (rows are
//      never hard-deleted by application code — see
//      schema-billing.ts and coach-subscription-service.ts's own
//      header comments).
//
// Proves, against a REAL database connection (same rationale as
// coach-entitlement.test.ts, which this file's fixture pattern
// mirrors exactly): resolveCheckoutEligibility() is a pure derivation
// of getCoachEntitlement() — no parallel entitlement system, no
// Stripe API call.
//
// Deliberately does NOT call the real Stripe API anywhere in this
// file (same discipline as lib/billing/__tests__/checkout.test.ts) —
// every scenario here is fully provable from coach_subscriptions rows
// alone. No real Checkout Session, no real charge, no production
// subscription mutated.
// ─────────────────────────────────────────────────────────────

import { describe, it, expect, beforeAll, afterAll, afterEach } from "vitest";
import { randomUUID } from "crypto";
import { eq, inArray } from "drizzle-orm";
import { getDb } from "../client";
import { createAdminClient } from "@/lib/supabase/admin";
import { users } from "../schema";
import { coachSubscriptions } from "../schema-billing";
import { resolveCheckoutEligibility } from "../coach-subscription-service";

const db = getDb();

const coach = { id: "" };

async function createAuthUser(label: string): Promise<string> {
  const supa = createAdminClient();
  const { data, error } = await supa.auth.admin.createUser({
    email: `checkout-eligibility-test-${label}-${randomUUID()}@isolation-test.invalid`,
    email_confirm: true,
    password: randomUUID(),
  });
  if (error || !data.user) {
    throw new Error(`Fixture setup failed: createUser(${label}) — ${error?.message}`);
  }
  return data.user.id;
}

beforeAll(async () => {
  coach.id = await createAuthUser("coach");
  await db.update(users).set({ role: "coach", status: "active" }).where(eq(users.id, coach.id));
});

afterEach(async () => {
  await db.delete(coachSubscriptions).where(eq(coachSubscriptions.coachId, coach.id));
});

afterAll(async () => {
  if (coach.id) {
    await db.delete(users).where(inArray(users.id, [coach.id]));
    const supa = createAdminClient();
    await supa.auth.admin.deleteUser(coach.id);
  }
});

async function setSubscriptionRow(overrides: Partial<typeof coachSubscriptions.$inferInsert>) {
  await db
    .insert(coachSubscriptions)
    .values({ coachId: coach.id, status: "active", ...overrides })
    .onConflictDoUpdate({
      target: coachSubscriptions.coachId,
      set: { coachId: coach.id, status: "active", ...overrides },
    });
}

// ─────────────────────────────────────────────────────────────

describe("resolveCheckoutEligibility — first-time coach", () => {
  it("no coach_subscriptions row at all: allowed, WITH a trial", async () => {
    // afterEach already clears the row, but be explicit — this is the
    // scenario the test name promises.
    await db.delete(coachSubscriptions).where(eq(coachSubscriptions.coachId, coach.id));

    const result = await resolveCheckoutEligibility(coach.id);
    expect(result.allowed).toBe(true);
    if (result.allowed) expect(result.grantTrial).toBe(true);
  });
});

describe("resolveCheckoutEligibility — already-entitled coach: checkout blocked entirely", () => {
  it("active subscription: not allowed (direct-action bypass closed)", async () => {
    await setSubscriptionRow({ status: "active" });
    const result = await resolveCheckoutEligibility(coach.id);
    expect(result.allowed).toBe(false);
    if (!result.allowed) expect(result.entitlement.status).toBe("active");
  });

  it("trialing subscription: not allowed (cannot start a second trial via replay)", async () => {
    await setSubscriptionRow({ status: "trialing" });
    const result = await resolveCheckoutEligibility(coach.id);
    expect(result.allowed).toBe(false);
    if (!result.allowed) expect(result.entitlement.status).toBe("trialing");
  });

  it("manually_activated coach: not allowed (no Stripe session needed or wanted)", async () => {
    await setSubscriptionRow({ status: "manually_activated" });
    const result = await resolveCheckoutEligibility(coach.id);
    expect(result.allowed).toBe(false);
    if (!result.allowed) expect(result.entitlement.status).toBe("manually_activated");
  });

  it("past_due within the 7-day grace window: not allowed (still entitled — Billing Portal, not a new session, is correct here)", async () => {
    const graceEnd = new Date(Date.now() + 3 * 24 * 60 * 60 * 1000);
    await setSubscriptionRow({ status: "past_due", gracePeriodEnd: graceEnd });
    const result = await resolveCheckoutEligibility(coach.id);
    expect(result.allowed).toBe(false);
    if (!result.allowed) expect(result.entitlement.status).toBe("past_due");
  });
});

describe("resolveCheckoutEligibility — returning coach: checkout allowed, trial withheld", () => {
  it("cancelled former subscriber: allowed, but NO trial (repeat-trial abuse closed)", async () => {
    await setSubscriptionRow({ status: "cancelled", cancelledAt: new Date() });
    const result = await resolveCheckoutEligibility(coach.id);
    expect(result.allowed).toBe(true);
    if (result.allowed) expect(result.grantTrial).toBe(false);
  });

  it("suspended coach: allowed to reactivate, but NO trial", async () => {
    await setSubscriptionRow({ status: "suspended" });
    const result = await resolveCheckoutEligibility(coach.id);
    expect(result.allowed).toBe(true);
    if (result.allowed) expect(result.grantTrial).toBe(false);
  });

  it("past_due with an EXPIRED grace window: getCoachEntitlement lazily suspends it, then checkout is allowed without a trial", async () => {
    const graceEnd = new Date(Date.now() - 1000); // already elapsed
    await setSubscriptionRow({ status: "past_due", gracePeriodEnd: graceEnd });

    const result = await resolveCheckoutEligibility(coach.id);
    expect(result.allowed).toBe(true);
    if (result.allowed) expect(result.grantTrial).toBe(false);

    // Confirm the lazy transition was actually persisted (same
    // guarantee coach-entitlement.test.ts proves for getCoachEntitlement
    // directly) — resolveCheckoutEligibility must not bypass or
    // duplicate that side effect.
    const [row] = await db
      .select({ status: coachSubscriptions.status })
      .from(coachSubscriptions)
      .where(eq(coachSubscriptions.coachId, coach.id))
      .limit(1);
    expect(row.status).toBe("suspended");
  });
});

describe("resolveCheckoutEligibility — concurrency", () => {
  it("two concurrent calls for a cancelled coach both correctly withhold the trial", async () => {
    await setSubscriptionRow({ status: "cancelled", cancelledAt: new Date() });

    const [first, second] = await Promise.all([
      resolveCheckoutEligibility(coach.id),
      resolveCheckoutEligibility(coach.id),
    ]);

    expect(first.allowed).toBe(true);
    expect(second.allowed).toBe(true);
    if (first.allowed) expect(first.grantTrial).toBe(false);
    if (second.allowed) expect(second.grantTrial).toBe(false);
  });
});
