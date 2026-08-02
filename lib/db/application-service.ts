// ─────────────────────────────────────────────────────────────
// Kynovant HQ — Application Pipeline Service
//
// SERVER-ONLY — never import from a Client Component.
//
// Handles the coaching application pipeline end to end:
//   - submitting an application from the public "Apply" form,
//     including the duplicate-submission policy (see submitApplication)
//   - listing applications for the HQ Applications dashboard
//   - fetching a single application's full detail
//   - status transitions (new → qualified → demo_scheduled →
//     demo_complete → accepted, or → declined from any stage)
//   - review notes
//   - recording best-effort Google Sheets sync outcome
//   - counting recent submissions by IP for the API route's rate limit
//
// This is the applications pipeline only — not a general sales CRM.
// It answers "what did this person submit, and where is it in the
// coach's qualify/schedule/decide workflow." A future Growth CRM can
// reference rows here (see schema-applications.ts) without this
// service needing to know anything about deal stages, outbound
// sequences, or multi-channel lead sourcing.
//
// Solo-mode note: reviewedBy is unscoped — any coach/admin can see
// and act on any application, matching every other HQ surface today.
// See docs/roadmaps/saas-evolution/kynovant-saas-evolution-roadmap.md
// §5 for the ownership-enforcement work this will need once a
// second coach exists.
// ─────────────────────────────────────────────────────────────

import "server-only";
import { eq, and, desc, inArray, notInArray, gt, sql } from "drizzle-orm";
import { getDb } from "./client";
import { users } from "./schema";
import { applications, type ApplicationStatus } from "./schema-applications";

const TERMINAL_STATUSES: ApplicationStatus[] = ["accepted", "declined"];

// ─────────────────────────────────────────────────────────────
// PUBLIC TYPES
// ─────────────────────────────────────────────────────────────

export interface NewApplicationInput {
  fullName: string;
  email: string;
  phone: string | null;
  primaryGoal: string;
  readiness: string;
  budgetRange: string;
  goalsDetails: string | null;
  referralSource: string;
  referralName: string | null;
  submitterIp: string | null;
}

export interface ApplicationListItem {
  id: string;
  fullName: string;
  email: string;
  primaryGoal: string;
  referralSource: string;
  status: ApplicationStatus;
  resubmissionCount: number;
  createdAt: Date;
  sheetSyncedAt: Date | null;
}

export interface ApplicationDetail extends ApplicationListItem {
  phone: string | null;
  readiness: string;
  budgetRange: string;
  goalsDetails: string | null;
  referralName: string | null;
  reviewNotes: string | null;
  reviewedByName: string | null;
  updatedAt: Date;
}

// ─────────────────────────────────────────────────────────────
// SUBMIT — called by app/api/applications/route.ts (public form)
//
// Duplicate-submission policy:
//   1. Normalize the email (lower + trim) and look for an existing
//      application from the same normalizedEmail whose status is
//      NOT terminal (accepted/declined) — i.e. still an open attempt.
//   2. If one exists: update it in place with the new answers,
//      increment resubmissionCount, reset sheetSyncedAt to null (the
//      mirror needs to re-sync the refreshed answers), and return its
//      original id. This is what stops "double submit" or repeated-
//      click abuse from silently producing unlimited rows for one
//      person — the count is visible to the coach, not hidden.
//   3. If none exists (first-ever application, or every prior
//      application from this email already reached a decision):
//      insert a brand new row. A declined applicant reapplying later
//      is a genuinely new attempt and gets its own original answers
//      preserved, not merged into the old decision.
// ─────────────────────────────────────────────────────────────

export async function submitApplication(
  input: NewApplicationInput,
): Promise<{ id: string; createdAt: Date; resubmitted: boolean }> {
  const db = getDb();
  const normalizedEmail = input.email.trim().toLowerCase();

  const [existing] = await db
    .select({ id: applications.id, createdAt: applications.createdAt })
    .from(applications)
    .where(
      and(
        eq(applications.normalizedEmail, normalizedEmail),
        notInArray(applications.status, TERMINAL_STATUSES),
      ),
    )
    .orderBy(desc(applications.createdAt))
    .limit(1);

  const values = {
    fullName: input.fullName,
    email: input.email,
    normalizedEmail,
    phone: input.phone,
    primaryGoal: input.primaryGoal,
    readiness: input.readiness,
    budgetRange: input.budgetRange,
    goalsDetails: input.goalsDetails,
    referralSource: input.referralSource,
    referralName: input.referralName,
    submitterIp: input.submitterIp,
  };

  if (existing) {
    await db
      .update(applications)
      .set({
        ...values,
        resubmissionCount: sql`${applications.resubmissionCount} + 1`,
        sheetSyncedAt: null,
        updatedAt: new Date(),
      })
      .where(eq(applications.id, existing.id));

    return { id: existing.id, createdAt: existing.createdAt, resubmitted: true };
  }

  const [row] = await db
    .insert(applications)
    .values(values)
    .returning({ id: applications.id, createdAt: applications.createdAt });

  return { id: row.id, createdAt: row.createdAt, resubmitted: false };
}

// Counts applications submitted from a given IP within the lookback
// window, for the API route's DB-backed rate limit. Returns 0 (never
// throws) if submitterIp is null — an unknown IP is never itself a
// reason to block a submission.
export async function countRecentApplicationsByIp(
  ip: string | null,
  sinceMs: number,
): Promise<number> {
  if (!ip) return 0;
  const db = getDb();
  const cutoff = new Date(Date.now() - sinceMs);

  const [row] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(applications)
    .where(and(eq(applications.submitterIp, ip), gt(applications.createdAt, cutoff)));

  return row?.count ?? 0;
}

// Marks the best-effort Google Sheets mirror as synced. Never throws —
// callers treat Sheets sync as non-fatal and should not let a failure
// here affect the API response already sent to the applicant.
export async function markApplicationSheetSynced(id: string): Promise<void> {
  const db = getDb();
  await db
    .update(applications)
    .set({ sheetSyncedAt: new Date() })
    .where(eq(applications.id, id));
}

// ─────────────────────────────────────────────────────────────
// READ — HQ Applications dashboard
// ─────────────────────────────────────────────────────────────

export async function listApplications(filter?: {
  status?: ApplicationStatus[];
}): Promise<ApplicationListItem[]> {
  const db = getDb();

  const rows = filter?.status?.length
    ? await db
        .select({
          id: applications.id,
          fullName: applications.fullName,
          email: applications.email,
          primaryGoal: applications.primaryGoal,
          referralSource: applications.referralSource,
          status: applications.status,
          resubmissionCount: applications.resubmissionCount,
          createdAt: applications.createdAt,
          sheetSyncedAt: applications.sheetSyncedAt,
        })
        .from(applications)
        .where(inArray(applications.status, filter.status))
        .orderBy(desc(applications.createdAt))
    : await db
        .select({
          id: applications.id,
          fullName: applications.fullName,
          email: applications.email,
          primaryGoal: applications.primaryGoal,
          referralSource: applications.referralSource,
          status: applications.status,
          resubmissionCount: applications.resubmissionCount,
          createdAt: applications.createdAt,
          sheetSyncedAt: applications.sheetSyncedAt,
        })
        .from(applications)
        .orderBy(desc(applications.createdAt));

  return rows;
}

export async function getApplicationById(
  id: string,
): Promise<ApplicationDetail | null> {
  const db = getDb();

  const rows = await db
    .select({
      id: applications.id,
      fullName: applications.fullName,
      email: applications.email,
      phone: applications.phone,
      primaryGoal: applications.primaryGoal,
      readiness: applications.readiness,
      budgetRange: applications.budgetRange,
      goalsDetails: applications.goalsDetails,
      referralSource: applications.referralSource,
      referralName: applications.referralName,
      status: applications.status,
      resubmissionCount: applications.resubmissionCount,
      reviewNotes: applications.reviewNotes,
      reviewedByEmail: users.email,
      sheetSyncedAt: applications.sheetSyncedAt,
      createdAt: applications.createdAt,
      updatedAt: applications.updatedAt,
    })
    .from(applications)
    .leftJoin(users, eq(applications.reviewedBy, users.id))
    .where(eq(applications.id, id))
    .limit(1);

  const row = rows[0];
  if (!row) return null;

  return {
    id: row.id,
    fullName: row.fullName,
    email: row.email,
    phone: row.phone,
    primaryGoal: row.primaryGoal,
    readiness: row.readiness,
    budgetRange: row.budgetRange,
    goalsDetails: row.goalsDetails,
    referralSource: row.referralSource,
    referralName: row.referralName,
    status: row.status,
    resubmissionCount: row.resubmissionCount,
    reviewNotes: row.reviewNotes,
    reviewedByName: row.reviewedByEmail,
    sheetSyncedAt: row.sheetSyncedAt,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

// ─────────────────────────────────────────────────────────────
// MUTATE — coach actions from app/hq/applications/[id]/actions.ts
// ─────────────────────────────────────────────────────────────

export async function updateApplicationStatus(
  id: string,
  status: ApplicationStatus,
  reviewerId: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const db = getDb();
  const result = await db
    .update(applications)
    .set({ status, reviewedBy: reviewerId, updatedAt: new Date() })
    .where(eq(applications.id, id))
    .returning({ id: applications.id });

  if (!result[0]) return { ok: false, error: "Application not found." };
  return { ok: true };
}

export async function saveApplicationNotes(
  id: string,
  notes: string,
  reviewerId: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const db = getDb();
  const result = await db
    .update(applications)
    .set({ reviewNotes: notes, reviewedBy: reviewerId, updatedAt: new Date() })
    .where(eq(applications.id, id))
    .returning({ id: applications.id });

  if (!result[0]) return { ok: false, error: "Application not found." };
  return { ok: true };
}
