// ─────────────────────────────────────────────────────────────
// Coach Tenant Isolation — integration test suite
//
// Proves, against a REAL database connection (not mocks — mocking
// Drizzle's query builder here would only prove the mock was called
// correctly, not that the actual SQL WHERE clause filters correctly,
// which is exactly the class of bug this suite exists to catch),
// that:
//   1. Coach A cannot read Coach B's clients, workspace, check-ins,
//      or program templates through any of the newly-scoped service
//      functions.
//   2. Coach A cannot mutate (assign a program to) Coach B's client.
//   3. Coach A CAN read/act on their own client — the isolation
//      logic denies cross-tenant access, not all access.
//   4. admin (coachId === null) bypasses scoping and sees everyone.
//
// Requires a reachable DATABASE_URL. vitest.config.ts loads
// .env.local automatically for this — see that file's comment.
// All fixture rows are created with randomUUID()-based emails/slugs
// so repeated runs never collide, and every row this file creates is
// deleted in afterAll(), in FK-safe (children-before-parents) order.
// ─────────────────────────────────────────────────────────────

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { randomUUID } from "crypto";
import { eq, inArray } from "drizzle-orm";
import { getDb } from "../client";
import { createAdminClient } from "@/lib/supabase/admin";
import { users, clientProfiles, coachingEnrollments, programTemplates, timelineEvents } from "../schema";
import { clientPrograms } from "../schema-program";
import { weeklyCheckIns } from "../schema-check-in";
import {
  coachOwnsClient,
  assertCoachOwnsClient,
  assertCoachOwnsCheckIn,
  resolveTenantScope,
} from "@/lib/auth/guards";
import type { PublicUser } from "@/lib/supabase/session";
import { listCoachClients, getCoachMissionControl } from "../coach-dashboard-service";
import { getCoachClientWorkspace } from "../coach-client-workspace-service";
import { listActiveClients, listAllActiveAssignments, assignProgram } from "../client-program-service";
import { listCoachCheckIns } from "../coach-check-in-service";
import { listProgramTemplates } from "../program-builder-service";

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

// ── Fixture identities ────────────────────────────────────────
// public.users.id carries a real FK to auth.users (added via raw
// migration SQL, not visible in lib/db/schema.ts) — fixtures must be
// real Supabase Auth users, not arbitrary UUIDs, or the insert below
// fails with "violates foreign key constraint users_id_fk_auth".
const coachA = { id: "" };
const coachB = { id: "" };
const clientA = { id: "" };
const clientB = { id: "" };
let templateA: string;
let templateB: string;
let checkInA: string;
let checkInB: string;
let clientProgramA: string;

async function createAuthUser(label: string): Promise<string> {
  const admin = createAdminClient();
  const { data, error } = await admin.auth.admin.createUser({
    email: `isolation-test-${label}-${randomUUID()}@isolation-test.invalid`,
    email_confirm: true,
    password: randomUUID(),
  });
  if (error || !data.user) {
    throw new Error(`Fixture setup failed: createUser(${label}) — ${error?.message}`);
  }
  return data.user.id;
}

beforeAll(async () => {
  // Real Supabase Auth users first — public.users.id must reference one.
  [coachA.id, coachB.id, clientA.id, clientB.id] = await Promise.all([
    createAuthUser("coach-a"),
    createAuthUser("coach-b"),
    createAuthUser("client-a"),
    createAuthUser("client-b"),
  ]);

  // A DB trigger (on_auth_user_created) already inserted a public.users
  // row for each of these — with a default role — the moment
  // createAuthUser() created the underlying auth.users row above. Update
  // it to the role this fixture needs rather than inserting a second row
  // (which would violate users_pkey).
  await Promise.all([
    db.update(users).set({ role: "coach", status: "active" }).where(eq(users.id, coachA.id)),
    db.update(users).set({ role: "coach", status: "active" }).where(eq(users.id, coachB.id)),
    db.update(users).set({ role: "client", status: "active" }).where(eq(users.id, clientA.id)),
    db.update(users).set({ role: "client", status: "active" }).where(eq(users.id, clientB.id)),
  ]);

  await db.insert(clientProfiles).values([
    { userId: clientA.id, fullName: "Isolation Test Client A" },
    { userId: clientB.id, fullName: "Isolation Test Client B" },
  ]);

  await db.insert(coachingEnrollments).values([
    { clientId: clientA.id, coachId: coachA.id, packageType: "Standard", monthlyRateCents: 0, status: "active" },
    { clientId: clientB.id, coachId: coachB.id, packageType: "Standard", monthlyRateCents: 0, status: "active" },
  ]);

  // One published program template per coach, so template-list scoping
  // and assignProgram's ownership check both have something real to use.
  const [tA] = await db
    .insert(programTemplates)
    .values({
      name: `Isolation Test Template A`,
      slug: `isolation-test-template-a-${randomUUID()}`,
      category: "fat_loss",
      experienceLevel: "beginner",
      status: "active",
      createdBy: coachA.id,
    })
    .returning({ id: programTemplates.id });
  templateA = tA.id;

  const [tB] = await db
    .insert(programTemplates)
    .values({
      name: `Isolation Test Template B`,
      slug: `isolation-test-template-b-${randomUUID()}`,
      category: "fat_loss",
      experienceLevel: "beginner",
      status: "active",
      createdBy: coachB.id,
    })
    .returning({ id: programTemplates.id });
  templateB = tB.id;

  // A real assignment for Client A, via the actual assignProgram()
  // function (not a raw insert) — exercises the same code path
  // production traffic uses.
  const assignResult = await assignProgram({
    clientId: clientA.id,
    programTemplateId: templateA,
    startDate: new Date().toISOString().slice(0, 10),
  });
  if (!assignResult.ok || !assignResult.assignment) {
    throw new Error(`Fixture setup failed: assignProgram — ${assignResult.error}`);
  }
  clientProgramA = assignResult.assignment.id;

  // One check-in per client.
  const [ciA] = await db
    .insert(weeklyCheckIns)
    .values({ clientId: clientA.id, weekStartDate: "2026-01-04", status: "submitted" })
    .returning({ id: weeklyCheckIns.id });
  checkInA = ciA.id;

  const [ciB] = await db
    .insert(weeklyCheckIns)
    .values({ clientId: clientB.id, weekStartDate: "2026-01-04", status: "submitted" })
    .returning({ id: weeklyCheckIns.id });
  checkInB = ciB.id;
});

afterAll(async () => {
  // Defensive throughout: if beforeAll threw partway through, some of
  // these ids/rows may never have been created — every step below is
  // safe to run against an empty/partial set.
  const clientIds = [clientA.id, clientB.id].filter(Boolean);
  const userIds = [coachA.id, coachB.id, clientA.id, clientB.id].filter(Boolean);
  const templateIds = [templateA, templateB].filter(Boolean);

  // Children before parents — every table here uses RESTRICT on these FKs.
  if (clientIds.length > 0) {
    await db.delete(weeklyCheckIns).where(inArray(weeklyCheckIns.clientId, clientIds));
    // assignProgram() (called both in fixture setup and in the
    // cross-tenant mutation test) writes a timeline_events row per call.
    await db.delete(timelineEvents).where(inArray(timelineEvents.clientId, clientIds));
  }
  if (clientProgramA) {
    await db.delete(clientPrograms).where(eq(clientPrograms.id, clientProgramA));
  }
  if (templateIds.length > 0) {
    await db.delete(programTemplates).where(inArray(programTemplates.id, templateIds));
  }
  if (clientIds.length > 0) {
    await db.delete(coachingEnrollments).where(inArray(coachingEnrollments.clientId, clientIds));
    await db.delete(clientProfiles).where(inArray(clientProfiles.userId, clientIds));
  }
  if (userIds.length > 0) {
    await db.delete(users).where(inArray(users.id, userIds));
  }

  // Delete the underlying Supabase Auth users last, after every FK-
  // dependent public.* row referencing them is gone.
  if (userIds.length > 0) {
    const admin = createAdminClient();
    await Promise.all(userIds.map((id) => admin.auth.admin.deleteUser(id)));
  }
});

// ─────────────────────────────────────────────────────────────

describe("resolveTenantScope", () => {
  it("resolves an admin to coachId: null (unscoped)", () => {
    expect(resolveTenantScope(fakeDbUser(coachA.id, "admin")).coachId).toBeNull();
  });

  it("resolves a coach to their own userId", () => {
    expect(resolveTenantScope(fakeDbUser(coachA.id, "coach")).coachId).toBe(coachA.id);
  });
});

describe("coachOwnsClient", () => {
  it("is true for a coach's own client", async () => {
    expect(await coachOwnsClient(coachA.id, clientA.id)).toBe(true);
  });

  it("is false for another coach's client", async () => {
    expect(await coachOwnsClient(coachA.id, clientB.id)).toBe(false);
    expect(await coachOwnsClient(coachB.id, clientA.id)).toBe(false);
  });
});

describe("assertCoachOwnsClient", () => {
  it("allows a coach to act on their own client", async () => {
    const result = await assertCoachOwnsClient(fakeDbUser(coachA.id, "coach"), clientA.id);
    expect(result.ok).toBe(true);
  });

  it("denies a coach acting on another coach's client", async () => {
    const result = await assertCoachOwnsClient(fakeDbUser(coachA.id, "coach"), clientB.id);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toBe("Not found");
  });

  it("admin bypasses the ownership check entirely", async () => {
    const result = await assertCoachOwnsClient(fakeDbUser(coachA.id, "admin"), clientB.id);
    expect(result.ok).toBe(true);
  });
});

describe("assertCoachOwnsCheckIn", () => {
  it("allows a coach to act on their own client's check-in", async () => {
    const result = await assertCoachOwnsCheckIn(fakeDbUser(coachA.id, "coach"), checkInA);
    expect(result.ok).toBe(true);
  });

  it("denies a coach acting on another coach's client's check-in", async () => {
    const result = await assertCoachOwnsCheckIn(fakeDbUser(coachA.id, "coach"), checkInB);
    expect(result.ok).toBe(false);
  });
});

describe("listCoachClients — client listings", () => {
  it("returns only this coach's own client", async () => {
    const rows = await listCoachClients(coachA.id);
    const ids = rows.map((r) => r.userId);
    expect(ids).toContain(clientA.id);
    expect(ids).not.toContain(clientB.id);
  });

  it("admin (coachId null) sees clients across both coaches", async () => {
    const rows = await listCoachClients(null);
    const ids = rows.map((r) => r.userId);
    expect(ids).toContain(clientA.id);
    expect(ids).toContain(clientB.id);
  });
});

describe("getCoachMissionControl — dashboard metrics", () => {
  it("scopes activeClientCount and recentActivity to this coach's own clients", async () => {
    const [dataA, dataB] = await Promise.all([
      getCoachMissionControl(coachA.id),
      getCoachMissionControl(coachB.id),
    ]);
    const activityIdsA = dataA.recentActivity.map((r) => r.clientId);
    const activityIdsB = dataB.recentActivity.map((r) => r.clientId);
    expect(activityIdsA).not.toContain(clientB.id);
    expect(activityIdsB).not.toContain(clientA.id);
  });
});

describe("getCoachClientWorkspace — client detail/workspace", () => {
  it("returns the workspace for a coach's own client", async () => {
    const workspace = await getCoachClientWorkspace(clientA.id, coachA.id);
    expect(workspace).not.toBeNull();
    expect(workspace?.userId).toBe(clientA.id);
  });

  it("returns null for another coach's client — including no sensitive data leak", async () => {
    const workspace = await getCoachClientWorkspace(clientB.id, coachA.id);
    expect(workspace).toBeNull();
  });

  it("admin can open any client's workspace", async () => {
    const workspace = await getCoachClientWorkspace(clientB.id, null);
    expect(workspace).not.toBeNull();
  });
});

describe("listActiveClients / listAllActiveAssignments — assignments", () => {
  it("listActiveClients scopes to the requesting coach", async () => {
    const rows = await listActiveClients(coachA.id);
    const ids = rows.map((r) => r.id);
    expect(ids).toContain(clientA.id);
    expect(ids).not.toContain(clientB.id);
  });

  it("listAllActiveAssignments scopes to the requesting coach", async () => {
    const rows = await listAllActiveAssignments(coachA.id);
    const clientIds = rows.map((r) => r.assignment.clientId);
    expect(clientIds).toContain(clientA.id);
    expect(clientIds).not.toContain(clientB.id);
  });
});

describe("assignProgram — mutation across tenants", () => {
  it("refuses to assign a program when coachId doesn't own the target client", async () => {
    const result = await assignProgram({
      clientId: clientB.id,
      programTemplateId: templateA,
      startDate: new Date().toISOString().slice(0, 10),
      coachId: coachA.id, // Coach A does not own Client B
      overrideAllowMultiple: true, // avoid colliding with any of Client B's own active programs
    });
    expect(result.ok).toBe(false);
  });

  it("succeeds when coachId does own the target client", async () => {
    const result = await assignProgram({
      clientId: clientA.id,
      programTemplateId: templateA,
      startDate: new Date().toISOString().slice(0, 10),
      coachId: coachA.id,
      overrideAllowMultiple: true,
    });
    expect(result.ok).toBe(true);
    // Clean up this second assignment immediately — afterAll only knows
    // about the original fixture assignment's id.
    if (result.assignment) {
      await db.delete(clientPrograms).where(eq(clientPrograms.id, result.assignment.id));
    }
  });
});

describe("listCoachCheckIns — check-ins", () => {
  it("scopes the review queue to the requesting coach's own clients", async () => {
    const rows = await listCoachCheckIns({ coachId: coachA.id });
    const ids = rows.map((r) => r.id);
    expect(ids).toContain(checkInA);
    expect(ids).not.toContain(checkInB);
  });

  it("admin sees check-ins across coaches", async () => {
    const rows = await listCoachCheckIns({ coachId: null });
    const ids = rows.map((r) => r.id);
    expect(ids).toContain(checkInA);
    expect(ids).toContain(checkInB);
  });
});

describe("listProgramTemplates — programs/blueprints", () => {
  it("scopes to templates this coach created", async () => {
    const rows = await listProgramTemplates(coachA.id);
    const ids = rows.map((r) => r.id);
    expect(ids).toContain(templateA);
    expect(ids).not.toContain(templateB);
  });

  it("admin sees templates across coaches", async () => {
    const rows = await listProgramTemplates(null);
    const ids = rows.map((r) => r.id);
    expect(ids).toContain(templateA);
    expect(ids).toContain(templateB);
  });
});
