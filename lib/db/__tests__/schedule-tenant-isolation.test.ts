// ─────────────────────────────────────────────────────────────
// Native HQ Schedule (coach_appointments) — real-DB tenant isolation
//
// lib/db/schedule-service.ts had only pure input-normalization unit
// tests (lib/db/__tests__/schedule-service.test.ts) before this file —
// no real-DB proof existed that listCoachAppointments/
// listUpcomingAppointments actually scope by coachId at the query
// level. Added as part of RC integration verification, since
// app/hq/page.tsx's Overview now calls listUpcomingAppointments()
// directly (see that file's "Upcoming Sessions" card).
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
import { coachAppointments } from "../schema-schedule";
import {
  createCoachAppointment,
  listCoachAppointments,
  listUpcomingAppointments,
} from "../schedule-service";

const db = getDb();

const coachA = { id: "" };
const coachB = { id: "" };
const clientA = { id: "" };

async function createAuthUser(label: string): Promise<string> {
  const admin = createAdminClient();
  const { data, error } = await admin.auth.admin.createUser({
    email: `schedule-tenant-test-${label}-${randomUUID()}@isolation-test.invalid`,
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
  await db.insert(clientProfiles).values({ userId: clientA.id, fullName: "Schedule Tenant Test Client" });
  await db.insert(coachingEnrollments).values({
    clientId: clientA.id,
    coachId: coachA.id,
    packageType: "Standard",
    monthlyRateCents: 0,
    status: "active",
  });
});

afterAll(async () => {
  const userIds = [coachA.id, coachB.id, clientA.id].filter(Boolean);
  await db.delete(coachAppointments).where(inArray(coachAppointments.coachId, [coachA.id, coachB.id].filter(Boolean)));
  await db.delete(coachingEnrollments).where(eq(coachingEnrollments.clientId, clientA.id));
  await db.delete(clientProfiles).where(eq(clientProfiles.userId, clientA.id));
  if (userIds.length > 0) {
    await db.delete(users).where(inArray(users.id, userIds));
    const admin = createAdminClient();
    await Promise.all(userIds.map((id) => admin.auth.admin.deleteUser(id)));
  }
});

describe("createCoachAppointment — tenant enforcement", () => {
  it("refuses to book an appointment with another coach's client", async () => {
    const start = new Date(Date.now() + 24 * 60 * 60 * 1000);
    const end = new Date(start.getTime() + 30 * 60 * 1000);
    await expect(
      createCoachAppointment(coachB.id, { clientId: clientA.id, startsAt: start, endsAt: end }),
    ).rejects.toThrow();
  });

  it("allows the owning coach to book with their own client", async () => {
    const start = new Date(Date.now() + 24 * 60 * 60 * 1000);
    const end = new Date(start.getTime() + 30 * 60 * 1000);
    const appt = await createCoachAppointment(coachA.id, {
      clientId: clientA.id,
      title: "Schedule Tenant Test Session",
      startsAt: start,
      endsAt: end,
    });
    expect(appt.coachId).toBe(coachA.id);
    expect(appt.clientId).toBe(clientA.id);
  });
});

describe("listCoachAppointments / listUpcomingAppointments — real-DB scoping", () => {
  it("never leaks coachA's appointment into coachB's list", async () => {
    const [forCoachA, forCoachB] = await Promise.all([
      listCoachAppointments(coachA.id),
      listCoachAppointments(coachB.id),
    ]);
    expect(forCoachA.some((a) => a.title === "Schedule Tenant Test Session")).toBe(true);
    expect(forCoachB.some((a) => a.title === "Schedule Tenant Test Session")).toBe(false);
  });

  it("listUpcomingAppointments returns only the requesting coach's scheduled, future appointments", async () => {
    const upcoming = await listUpcomingAppointments(coachA.id, 20);
    expect(upcoming.some((a) => a.title === "Schedule Tenant Test Session")).toBe(true);
    expect(upcoming.every((a) => a.coachId === coachA.id)).toBe(true);
    expect(upcoming.every((a) => a.status === "scheduled")).toBe(true);

    const upcomingForB = await listUpcomingAppointments(coachB.id, 20);
    expect(upcomingForB.some((a) => a.title === "Schedule Tenant Test Session")).toBe(false);
  });
});
