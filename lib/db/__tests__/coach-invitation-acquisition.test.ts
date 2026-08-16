// ─────────────────────────────────────────────────────────────
// Overwatch "Invite Coach" — acquisition service + funnel-integrity
// suite
//
// Exercises the REAL, EXISTING service-layer functions the invite
// route (app/api/internal/overwatch/invite-coach/route.ts) reuses —
// findExistingAccountByEmail, recordAcquisitionSignup,
// markAcquisitionInviteStatus, provisionInvitedCoach — against a real
// database connection, plus the real getOverwatchMetrics() to prove
// funnel integrity. Does NOT call the route's POST handler directly
// (that would require a real Next.js request/cookie scope AND would
// invoke real admin.auth.admin.generateLink()/Resend sends — see
// lib/auth/__tests__/overwatch-invite-coach-security.test.ts for the
// source-inspection coverage of that request-scoped/side-effecting
// path, matching this codebase's established precedent for this class
// of guarantee — coach-signup-security.test.ts,
// rd-credential-gate.test.ts).
//
// PRODUCTION INCIDENT THIS SUITE SPECIFICALLY GUARDS AGAINST:
//   acquisitionLeadPredicate() (lib/db/overwatch-service.ts) was
//   recently fixed after silently counting every @isolation-test.invalid
//   fixture lead as real acquisition activity. This suite proves that
//   fix generalizes to source="founder_invite" too, not just the
//   "start_trial" source it was originally proven against — a fresh
//   source value routed through the SAME coach_acquisition_leads table
//   must not reopen that hole.
//
// Requires DATABASE_URL_DIRECT — vitest.config.ts loads .env.local.
// ─────────────────────────────────────────────────────────────

import { describe, it, expect, afterAll } from "vitest";
import { randomUUID } from "crypto";
import { eq, inArray } from "drizzle-orm";
import { getDb } from "../client";
import { createAdminClient } from "@/lib/supabase/admin";
import { users, coachProfiles } from "../schema";
import { coachAcquisitionLeads } from "../schema-coach-acquisition";
import { findExistingAccountByEmail } from "../coach-signup-service";
import {
  recordAcquisitionSignup,
  markAcquisitionInviteStatus,
} from "../coach-acquisition-service";
import { provisionInvitedCoach } from "../coach-provisioning-service";
import { getOverwatchMetrics } from "../overwatch-service";

const db = getDb();

const createdUserIds: string[] = [];
const createdEmails: string[] = [];

async function createAuthUser(label: string, domain = "isolation-test.invalid"): Promise<string> {
  const supa = createAdminClient();
  const email = `founder-invite-test-${label}-${randomUUID()}@${domain}`;
  const { data, error } = await supa.auth.admin.createUser({
    email,
    email_confirm: true,
    password: randomUUID(),
  });
  if (error || !data.user) {
    throw new Error(`Fixture setup failed: createUser(${label}) — ${error?.message}`);
  }
  createdUserIds.push(data.user.id);
  createdEmails.push(email.toLowerCase());
  return data.user.id;
}

afterAll(async () => {
  if (createdEmails.length > 0) {
    await db.delete(coachAcquisitionLeads).where(inArray(coachAcquisitionLeads.normalizedEmail, createdEmails));
  }
  if (createdUserIds.length > 0) {
    await db.delete(coachProfiles).where(inArray(coachProfiles.userId, createdUserIds));
    await db.delete(users).where(inArray(users.id, createdUserIds));
    const supa = createAdminClient();
    await Promise.all(createdUserIds.map((id) => supa.auth.admin.deleteUser(id).catch(() => {})));
  }
});

describe("findExistingAccountByEmail — the invite route's duplicate/collision pre-check", () => {
  it("returns null for a brand-new email", async () => {
    const result = await findExistingAccountByEmail(`nobody-${randomUUID()}@isolation-test.invalid`);
    expect(result).toBeNull();
  });

  it("finds an existing client account (the route's client_conflict branch)", async () => {
    const userId = await createAuthUser("client-collision");
    await db.update(users).set({ role: "client", status: "active" }).where(eq(users.id, userId));
    const email = (await db.select({ e: users.normalizedEmail }).from(users).where(eq(users.id, userId)))[0].e;

    const result = await findExistingAccountByEmail(email);
    expect(result?.role).toBe("client");
    expect(result?.id).toBe(userId);
  });

  it("finds an existing active admin account (the route's already_active branch)", async () => {
    const userId = await createAuthUser("admin-collision");
    await db.update(users).set({ role: "admin", status: "active" }).where(eq(users.id, userId));
    const email = (await db.select({ e: users.normalizedEmail }).from(users).where(eq(users.id, userId)))[0].e;

    const result = await findExistingAccountByEmail(email);
    expect(result?.role).toBe("admin");
    expect(result?.status).toBe("active");
  });

  it("finds an existing invited-but-unconfirmed coach (the route's already_invited branch — no automatic resend)", async () => {
    const userId = await createAuthUser("pending-invite-collision");
    await db.update(users).set({ role: "coach", status: "invited" }).where(eq(users.id, userId));
    const email = (await db.select({ e: users.normalizedEmail }).from(users).where(eq(users.id, userId)))[0].e;

    const result = await findExistingAccountByEmail(email);
    expect(result?.role).toBe("coach");
    expect(result?.status).toBe("invited");
  });
});

describe("provisionInvitedCoach — same canonical role-grant path, first-name-only displayName", () => {
  it("grants role=coach, status=invited, and creates a coach_profiles row from just a first name", async () => {
    const userId = await createAuthUser("provision");
    await provisionInvitedCoach({ userId, email: `x-${randomUUID()}@isolation-test.invalid`, displayName: "Alex" });

    const [row] = await db.select().from(users).where(eq(users.id, userId));
    expect(row.role).toBe("coach");

    const [profile] = await db.select().from(coachProfiles).where(eq(coachProfiles.userId, userId));
    expect(profile.displayName).toBe("Alex");
  });

  it("is idempotent — calling it twice for the same userId does not error or duplicate the profile row", async () => {
    const userId = await createAuthUser("provision-idempotent");
    await provisionInvitedCoach({ userId, email: "a@isolation-test.invalid", displayName: "Sam" });
    await provisionInvitedCoach({ userId, email: "a@isolation-test.invalid", displayName: "Sam" });

    const profiles = await db.select().from(coachProfiles).where(eq(coachProfiles.userId, userId));
    expect(profiles).toHaveLength(1);
  });
});

describe("acquisition attribution — source='founder_invite' via the existing coach_acquisition_leads column, no schema change", () => {
  it("persists source='founder_invite' distinctly from 'start_trial'", async () => {
    const email = `attribution-${randomUUID()}@isolation-test.invalid`;
    createdEmails.push(email);
    await recordAcquisitionSignup({ normalizedEmail: email, submittedName: "Alex", source: "founder_invite" });

    const [row] = await db.select().from(coachAcquisitionLeads).where(eq(coachAcquisitionLeads.normalizedEmail, email));
    expect(row.source).toBe("founder_invite");
  });

  it("markAcquisitionInviteStatus transitions correctly for a founder_invite lead (sent, already_invited, already_active, client_conflict)", async () => {
    const email = `status-transitions-${randomUUID()}@isolation-test.invalid`;
    createdEmails.push(email);
    await recordAcquisitionSignup({ normalizedEmail: email, submittedName: "Jordan", source: "founder_invite" });

    await markAcquisitionInviteStatus({ normalizedEmail: email, status: "sent", inviteSentAt: new Date() });
    let [row] = await db.select().from(coachAcquisitionLeads).where(eq(coachAcquisitionLeads.normalizedEmail, email));
    expect(row.inviteStatus).toBe("sent");
    expect(row.inviteSentAt).not.toBeNull();

    await markAcquisitionInviteStatus({ normalizedEmail: email, status: "client_conflict" });
    [row] = await db.select().from(coachAcquisitionLeads).where(eq(coachAcquisitionLeads.normalizedEmail, email));
    expect(row.inviteStatus).toBe("client_conflict");
  });
});

describe("funnel integrity — the @isolation-test.invalid exclusion survives a new source value", () => {
  it("a founder_invite lead on @isolation-test.invalid is EXCLUDED from the acquisition funnel, exactly like a start_trial one", async () => {
    const before = await getOverwatchMetrics();
    const email = `funnel-exclusion-${randomUUID()}@isolation-test.invalid`;
    createdEmails.push(email);
    const lead = await recordAcquisitionSignup({
      normalizedEmail: email,
      submittedName: "Excluded Fixture",
      source: "founder_invite",
    }).then(async () => {
      const [row] = await db.select().from(coachAcquisitionLeads).where(eq(coachAcquisitionLeads.normalizedEmail, email));
      return row;
    });

    const after = await getOverwatchMetrics();
    expect(after.acquisition.startedSignup).toBe(before.acquisition.startedSignup);
    expect(after.acquisition.recentLeads.some((l) => l.id === lead.id)).toBe(false);
  });

  it("a founder_invite lead on a real-looking domain COUNTS toward the funnel — the fixture exclusion does not accidentally suppress legitimate founder invitations", async () => {
    const before = await getOverwatchMetrics();
    const email = `real-prospect-founder-invite-${randomUUID()}@gmail.com`;
    createdEmails.push(email);
    await recordAcquisitionSignup({ normalizedEmail: email, submittedName: "Real Prospect", source: "founder_invite" });
    const [lead] = await db.select().from(coachAcquisitionLeads).where(eq(coachAcquisitionLeads.normalizedEmail, email));

    const after = await getOverwatchMetrics();
    expect(after.acquisition.startedSignup).toBe(before.acquisition.startedSignup + 1);
    expect(after.acquisition.recentLeads.some((l) => l.id === lead.id)).toBe(true);
  });
});
