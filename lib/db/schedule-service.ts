import "server-only";

import { and, asc, eq, gte, lte } from "drizzle-orm";
import { getDb } from "./client";
import { clientProfiles, coachingEnrollments, users } from "./schema";
import {
  coachAppointments,
  type CoachAppointment,
  type CoachAppointmentCategory,
  type CoachAppointmentStatus,
} from "./schema-schedule";
import { isValidAppointmentRange } from "@/lib/schedule/date";

const VALID_CATEGORIES: CoachAppointmentCategory[] = [
  "consultation",
  "check_in",
  "training",
  "nutrition",
  "admin",
  "personal",
  "other",
];

const VALID_STATUSES: CoachAppointmentStatus[] = [
  "scheduled",
  "completed",
  "cancelled",
];

export interface ScheduleClientOption {
  id: string;
  name: string;
  email: string;
}

export interface AppointmentWithClient extends CoachAppointment {
  clientName: string | null;
  clientEmail: string | null;
}

export interface AppointmentInput {
  clientId?: string | null;
  title?: string | null;
  category?: CoachAppointmentCategory;
  status?: CoachAppointmentStatus;
  startsAt: Date;
  endsAt: Date;
  privateNotes?: string | null;
}

export interface AppointmentPatchInput {
  clientId?: string | null;
  title?: string | null;
  category?: CoachAppointmentCategory;
  status?: CoachAppointmentStatus;
  startsAt?: Date;
  endsAt?: Date;
  privateNotes?: string | null;
}

function cleanText(value: unknown, max = 500): string | null {
  const text = String(value ?? "").trim();
  return text ? text.slice(0, max) : null;
}

function normalizeCategory(value: unknown): CoachAppointmentCategory {
  return VALID_CATEGORIES.includes(value as CoachAppointmentCategory)
    ? value as CoachAppointmentCategory
    : "consultation";
}

function normalizeStatus(value: unknown): CoachAppointmentStatus {
  return VALID_STATUSES.includes(value as CoachAppointmentStatus)
    ? value as CoachAppointmentStatus
    : "scheduled";
}

export function parseAppointmentInput(raw: Record<string, unknown>): AppointmentInput {
  const startsAt = new Date(String(raw.startsAt ?? ""));
  const endsAt = new Date(String(raw.endsAt ?? ""));
  return {
    clientId: cleanText(raw.clientId, 80),
    title: cleanText(raw.title, 160),
    category: normalizeCategory(raw.category),
    status: normalizeStatus(raw.status),
    startsAt,
    endsAt,
    privateNotes: cleanText(raw.privateNotes, 2000),
  };
}

export function parseAppointmentPatch(raw: Record<string, unknown>): AppointmentPatchInput {
  const patch: AppointmentPatchInput = {};
  if ("clientId" in raw) patch.clientId = cleanText(raw.clientId, 80);
  if ("title" in raw) patch.title = cleanText(raw.title, 160);
  if ("category" in raw) patch.category = normalizeCategory(raw.category);
  if ("status" in raw) patch.status = normalizeStatus(raw.status);
  if ("startsAt" in raw) patch.startsAt = new Date(String(raw.startsAt ?? ""));
  if ("endsAt" in raw) patch.endsAt = new Date(String(raw.endsAt ?? ""));
  if ("privateNotes" in raw) patch.privateNotes = cleanText(raw.privateNotes, 2000);
  return patch;
}

export function validateAppointmentRange(startsAt: Date, endsAt: Date): string | null {
  if (!isValidAppointmentRange(startsAt, endsAt)) {
    return "Appointment end time must be after the start time.";
  }
  return null;
}

async function assertClientBelongsToCoach(
  coachId: string,
  clientId: string | null | undefined,
): Promise<void> {
  if (!clientId) return;
  const db = getDb();
  const [row] = await db
    .select({ id: coachingEnrollments.id })
    .from(coachingEnrollments)
    .where(
      and(
        eq(coachingEnrollments.coachId, coachId),
        eq(coachingEnrollments.clientId, clientId),
      ),
    )
    .limit(1);

  if (!row) {
    throw new Error("Client is not assigned to this coach.");
  }
}

export async function listScheduleClients(
  coachId: string,
): Promise<ScheduleClientOption[]> {
  const db = getDb();
  const rows = await db
    .select({
      id: users.id,
      email: users.email,
      fullName: clientProfiles.fullName,
      preferredName: clientProfiles.preferredName,
    })
    .from(coachingEnrollments)
    .innerJoin(users, eq(coachingEnrollments.clientId, users.id))
    .leftJoin(clientProfiles, eq(clientProfiles.userId, users.id))
    .where(eq(coachingEnrollments.coachId, coachId))
    .orderBy(asc(clientProfiles.fullName), asc(users.email));

  const seen = new Set<string>();
  return rows
    .filter((row) => {
      if (seen.has(row.id)) return false;
      seen.add(row.id);
      return true;
    })
    .map((row) => ({
      id: row.id,
      email: row.email,
      name: row.preferredName || row.fullName || row.email,
    }));
}

export async function listCoachAppointments(
  coachId: string,
  range?: { from?: Date | null; to?: Date | null },
): Promise<AppointmentWithClient[]> {
  const db = getDb();
  const conditions = [eq(coachAppointments.coachId, coachId)];
  if (range?.from) conditions.push(gte(coachAppointments.endsAt, range.from));
  if (range?.to) conditions.push(lte(coachAppointments.startsAt, range.to));

  return db
    .select({
      id: coachAppointments.id,
      coachId: coachAppointments.coachId,
      clientId: coachAppointments.clientId,
      title: coachAppointments.title,
      category: coachAppointments.category,
      status: coachAppointments.status,
      startsAt: coachAppointments.startsAt,
      endsAt: coachAppointments.endsAt,
      privateNotes: coachAppointments.privateNotes,
      createdAt: coachAppointments.createdAt,
      updatedAt: coachAppointments.updatedAt,
      clientName: clientProfiles.fullName,
      clientEmail: users.email,
    })
    .from(coachAppointments)
    .leftJoin(users, eq(coachAppointments.clientId, users.id))
    .leftJoin(clientProfiles, eq(clientProfiles.userId, users.id))
    .where(and(...conditions))
    .orderBy(asc(coachAppointments.startsAt));
}

export async function createCoachAppointment(
  coachId: string,
  input: AppointmentInput,
): Promise<CoachAppointment> {
  const rangeError = validateAppointmentRange(input.startsAt, input.endsAt);
  if (rangeError) throw new Error(rangeError);
  await assertClientBelongsToCoach(coachId, input.clientId);

  const db = getDb();
  const [row] = await db
    .insert(coachAppointments)
    .values({
      coachId,
      clientId: input.clientId ?? null,
      title: input.title ?? null,
      category: input.category ?? "consultation",
      status: input.status ?? "scheduled",
      startsAt: input.startsAt,
      endsAt: input.endsAt,
      privateNotes: input.privateNotes ?? null,
    })
    .returning();
  return row;
}

export async function updateCoachAppointment(
  coachId: string,
  appointmentId: string,
  patch: AppointmentPatchInput,
): Promise<CoachAppointment> {
  const db = getDb();
  const [existing] = await db
    .select()
    .from(coachAppointments)
    .where(and(eq(coachAppointments.id, appointmentId), eq(coachAppointments.coachId, coachId)))
    .limit(1);

  if (!existing) throw new Error("Appointment not found.");
  await assertClientBelongsToCoach(coachId, patch.clientId);

  const startsAt = patch.startsAt ?? existing.startsAt;
  const endsAt = patch.endsAt ?? existing.endsAt;
  const rangeError = validateAppointmentRange(startsAt, endsAt);
  if (rangeError) throw new Error(rangeError);

  const [row] = await db
    .update(coachAppointments)
    .set({
      clientId: patch.clientId === undefined ? existing.clientId : patch.clientId,
      title: patch.title === undefined ? existing.title : patch.title,
      category: patch.category ?? existing.category,
      status: patch.status ?? existing.status,
      startsAt,
      endsAt,
      privateNotes: patch.privateNotes === undefined ? existing.privateNotes : patch.privateNotes,
      updatedAt: new Date(),
    })
    .where(and(eq(coachAppointments.id, appointmentId), eq(coachAppointments.coachId, coachId)))
    .returning();
  return row;
}

export async function deleteCoachAppointment(
  coachId: string,
  appointmentId: string,
): Promise<void> {
  const db = getDb();
  await db
    .delete(coachAppointments)
    .where(and(eq(coachAppointments.id, appointmentId), eq(coachAppointments.coachId, coachId)));
}

export async function listUpcomingAppointments(
  coachId: string,
  limit = 8,
): Promise<AppointmentWithClient[]> {
  const now = new Date();
  const farFuture = new Date(now);
  farFuture.setDate(now.getDate() + 90);
  return listCoachAppointments(coachId, { from: now, to: farFuture })
    .then((items) => items.filter((item) => item.status === "scheduled").slice(0, limit));
}
