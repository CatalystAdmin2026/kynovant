// ─────────────────────────────────────────────────────────────
// Kynovant Admin — Coach Application Pipeline Service
//
// SERVER-ONLY — never import from a Client Component.
//
// Handles the Kynovant coach-application pipeline end to end:
//   - submitting an application from the public /coach-apply form,
//     including the duplicate-submission policy (see submitApplication)
//   - listing applications for the admin Growth Applications dashboard
//   - fetching a single application's full detail
//   - status transitions (new → qualified → demo_scheduled →
//     demo_complete → accepted, or → declined from any stage)
//   - review notes
//   - recording best-effort Google Sheets sync outcome
//   - counting recent submissions by IP for the API route's rate limit
//
// ADMIN-ONLY. This is Kynovant's own pipeline for acquiring coach
// customers, not something an ordinary coach account has any reason
// to reach. Every exported function here is only ever called from
// admin-guarded call sites — app/admin/growth/applications/** (pages
// gated by requireAdminPage() in app/admin/growth/layout.tsx) and
// app/admin/growth/applications/[id]/actions.ts (each action
// independently calls requireAdmin()) — plus the public, intentionally
// unauthenticated submitApplication()/countRecentApplicationsByIp()/
// markApplicationSheetSynced() path from app/api/applications/route.ts,
// which only ever writes or counts, never returns another applicant's
// data back to the caller.
//
// This is the applications pipeline only — not a general sales CRM.
// It answers "what did this person submit, and where is it in the
// qualify/schedule/decide workflow." A design spec for a broader
// Growth CRM exists at docs/catalyst-os-growth-crm.md (not yet built,
// pending review) — this service intentionally does not implement its
// event-log tables or growth_leads handoff.
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
  name: string;
  email: string;
  phone: string | null;
  businessStage: string;
  clientCount: string;
  context: string | null;
  referralSource: string;
  submitterIp: string | null;
}

export interface ApplicationListItem {
  id: string;
  name: string;
  email: string;
  // Nullable at the type level to match the DB column — see the
  // "businessStage/clientCount/context are NULLABLE" note in
  // schema-applications.ts. In practice, listApplications() only ever
  // returns source = 'coach_apply' rows (see below), which always
  // have this populated — but the type stays honest about what the
  // column actually allows rather than asserting a guarantee the
  // query happens to provide today.
  businessStage: string | null;
  referralSource: string;
  status: ApplicationStatus;
  resubmissionCount: number;
  createdAt: Date;
  sheetSyncedAt: Date | null;
}

export interface ApplicationDetail extends ApplicationListItem {
  phone: string | null;
  clientCount: string | null;
  context: string | null;
  // 'coach_apply' for every row created through the current intake
  // path; any other value (e.g. the legacy 'apply_page') marks a row
  // that predates the /coach-apply correction — see legacyFields.
  source: string;
  // Archived original answers for a pre-correction row (see
  // drizzle/0016_applications_coach_fields.sql) — null for any row
  // that was never subject to that migration's archival step, which
  // in practice means every row created after it ran.
  legacyFields: Record<string, string> | null;
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
//      person — the count is visible to staff, not hidden.
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
    name: input.name,
    email: input.email,
    normalizedEmail,
    phone: input.phone,
    businessStage: input.businessStage,
    clientCount: input.clientCount,
    context: input.context,
    referralSource: input.referralSource,
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
// READ — admin Growth Applications dashboard
//
// listApplications() always scopes to source = 'coach_apply'. This
// is a deliberate exclusion, not an oversight: a row from any other
// source (currently just the one legacy 'apply_page' row created
// before the /coach-apply correction) is not a Kynovant SaaS
// application and does not belong in a queue built for triaging
// them — it would show up with null business_stage/client_count/
// context no matter how gracefully the UI renders that, which is
// more confusing than useful. That row is not deleted or hidden
// entirely — see getApplicationById(), which is not source-scoped —
// it's excluded from the triage list specifically.
// ─────────────────────────────────────────────────────────────

const COACH_APPLY_SOURCE = "coach_apply";

export async function listApplications(filter?: {
  status?: ApplicationStatus[];
}): Promise<ApplicationListItem[]> {
  const db = getDb();

  const whereClause = filter?.status?.length
    ? and(
        eq(applications.source, COACH_APPLY_SOURCE),
        inArray(applications.status, filter.status),
      )
    : eq(applications.source, COACH_APPLY_SOURCE);

  const rows = await db
    .select({
      id: applications.id,
      name: applications.name,
      email: applications.email,
      businessStage: applications.businessStage,
      referralSource: applications.referralSource,
      status: applications.status,
      resubmissionCount: applications.resubmissionCount,
      createdAt: applications.createdAt,
      sheetSyncedAt: applications.sheetSyncedAt,
    })
    .from(applications)
    .where(whereClause)
    .orderBy(desc(applications.createdAt));

  return rows;
}

// Deliberately NOT scoped to source = 'coach_apply' (unlike
// listApplications) — a legacy row must still be reachable by direct
// link even though it's excluded from the triage queue. "Excluded
// from the SaaS queue" is not the same as "inaccessible."
export async function getApplicationById(
  id: string,
): Promise<ApplicationDetail | null> {
  const db = getDb();

  const rows = await db
    .select({
      id: applications.id,
      name: applications.name,
      email: applications.email,
      phone: applications.phone,
      businessStage: applications.businessStage,
      clientCount: applications.clientCount,
      context: applications.context,
      referralSource: applications.referralSource,
      status: applications.status,
      resubmissionCount: applications.resubmissionCount,
      source: applications.source,
      legacyFields: applications.legacyFields,
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
    name: row.name,
    email: row.email,
    phone: row.phone,
    businessStage: row.businessStage,
    clientCount: row.clientCount,
    context: row.context,
    referralSource: row.referralSource,
    status: row.status,
    resubmissionCount: row.resubmissionCount,
    source: row.source,
    legacyFields: row.legacyFields as Record<string, string> | null,
    reviewNotes: row.reviewNotes,
    reviewedByName: row.reviewedByEmail,
    sheetSyncedAt: row.sheetSyncedAt,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

// ─────────────────────────────────────────────────────────────
// MUTATE — admin actions from app/admin/growth/applications/[id]/actions.ts
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
