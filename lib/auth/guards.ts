// ─────────────────────────────────────────────────────────────
// Catalyst OS — Server-Side Authorization Guards
//
// SERVER-ONLY — never import from a Client Component.
//
// These guards are the single source of truth for route-level
// authorization. Every protected API route and Server Component
// layout must call the appropriate guard before doing any work.
//
// Security invariants:
//   - JWT is validated with supabase.auth.getUser() on every call.
//     This re-validates the token with Supabase Auth, unlike
//     getSession() which only reads the local cookie.
//   - Role and status are read from public.users via Drizzle,
//     using the server-side DATABASE_URL connection. They are
//     NEVER taken from the JWT claims, request body, query
//     params, or user_metadata.
//   - Suspended and archived users are always denied regardless
//     of role or JWT validity.
//   - 401 = not authenticated; 403 = authenticated but not authorized.
//   - This file never logs tokens, secrets, or database URLs.
// ─────────────────────────────────────────────────────────────

import "server-only";
import { NextResponse } from "next/server";
import { redirect } from "next/navigation";
import { eq, and, or } from "drizzle-orm";
import { createClient } from "@/lib/supabase/server";
import { getDb } from "@/lib/db/client";
import { users, coachingEnrollments, programTemplates, workoutTemplates } from "@/lib/db/schema";
import { workoutSessions, programWeeks } from "@/lib/db/schema-program";
import { weeklyCheckIns } from "@/lib/db/schema-check-in";
import { exercises, workoutTemplateSections, workoutTemplateExercises } from "@/lib/db/schema-exercise";
import { documents } from "@/lib/db/schema-documents";
import { getCoachEntitlement, type CoachEntitlement } from "@/lib/db/coach-subscription-service";
import type { User } from "@supabase/supabase-js";
import type { PublicUser } from "@/lib/supabase/session";

// ─────────────────────────────────────────────────────────────
// SHAPES
// ─────────────────────────────────────────────────────────────

export type AuthedUser = { authUser: User; dbUser: PublicUser };
export type GuardOk = { ok: true } & AuthedUser;
export type GuardFail = { ok: false; response: NextResponse };
export type GuardResult = GuardOk | GuardFail;

// ─────────────────────────────────────────────────────────────
// INTERNAL — session resolver
//
// Validates the Supabase JWT and reads the canonical user record
// from public.users. Never trusts JWT claims for role or status.
// ─────────────────────────────────────────────────────────────

type ResolveOk = { ok: true; authUser: User; dbUser: PublicUser };
type ResolveFail = { ok: false; httpStatus: 401 | 403; message: string };

async function resolveSession(): Promise<ResolveOk | ResolveFail> {
  const supabase = await createClient();
  const {
    data: { user: authUser },
    error,
  } = await supabase.auth.getUser();

  if (error || !authUser) {
    return { ok: false, httpStatus: 401, message: "Unauthorized" };
  }

  const db = getDb();
  const rows = await db
    .select({
      id: users.id,
      email: users.email,
      normalizedEmail: users.normalizedEmail,
      emailVerifiedAt: users.emailVerifiedAt,
      role: users.role,
      status: users.status,
      createdAt: users.createdAt,
      updatedAt: users.updatedAt,
      deletedAt: users.deletedAt,
    })
    .from(users)
    .where(eq(users.id, authUser.id))
    .limit(1);

  const dbUser = rows[0];
  if (!dbUser) {
    return { ok: false, httpStatus: 401, message: "Unauthorized" };
  }

  if (dbUser.status === "suspended" || dbUser.status === "archived") {
    return { ok: false, httpStatus: 403, message: "Account access denied" };
  }

  return { ok: true, authUser, dbUser: dbUser as PublicUser };
}

// ─────────────────────────────────────────────────────────────
// API GUARDS — return JSON NextResponse, never redirect
//
// Usage in route handlers:
//   const guard = await requireCoachOrAdmin();
//   if (!guard.ok) return guard.response;
//   const { authUser, dbUser } = guard;
// ─────────────────────────────────────────────────────────────

export async function requireAuthenticatedUser(): Promise<GuardResult> {
  const resolved = await resolveSession();
  if (!resolved.ok) {
    return {
      ok: false,
      response: NextResponse.json(
        { ok: false, error: resolved.message },
        { status: resolved.httpStatus },
      ),
    };
  }
  return { ok: true, authUser: resolved.authUser, dbUser: resolved.dbUser };
}

// ─────────────────────────────────────────────────────────────
// ENTITLEMENT GATE
//
// Extracted as its own dbUser-taking function (rather than inlined in
// the guards below) for the same reason assertCoachOwnsClient etc. are:
// it's directly unit-testable without a Next.js request context —
// resolveSession() needs cookies()/next-headers, this doesn't.
//
// Admin (and any non-coach role) always passes — bypass is structural:
// getCoachEntitlement() is never even called for them, not just
// ignored. A coach passes only if their current billing status allows
// access per getCoachEntitlement()'s status behavior table.
// ─────────────────────────────────────────────────────────────

export type EntitlementResult =
  | { ok: true }
  | { ok: false; entitlement: CoachEntitlement };

export async function assertCoachEntitled(dbUser: PublicUser): Promise<EntitlementResult> {
  if (dbUser.role !== "coach") return { ok: true };
  const entitlement = await getCoachEntitlement(dbUser.id);
  if (!entitlement.allowed) return { ok: false, entitlement };
  return { ok: true };
}

export async function requireCoachOrAdmin(): Promise<GuardResult> {
  const resolved = await resolveSession();
  if (!resolved.ok) {
    return {
      ok: false,
      response: NextResponse.json(
        { ok: false, error: resolved.message },
        { status: resolved.httpStatus },
      ),
    };
  }
  if (resolved.dbUser.role !== "coach" && resolved.dbUser.role !== "admin") {
    return {
      ok: false,
      response: NextResponse.json({ ok: false, error: "Forbidden" }, { status: 403 }),
    };
  }
  const entitlementResult = await assertCoachEntitled(resolved.dbUser);
  if (!entitlementResult.ok) {
    return {
      ok: false,
      response: NextResponse.json(
        {
          ok: false,
          error: "subscription_inactive",
          status: entitlementResult.entitlement.status,
        },
        { status: 403 },
      ),
    };
  }
  return { ok: true, authUser: resolved.authUser, dbUser: resolved.dbUser };
}

export async function requireAdmin(): Promise<GuardResult> {
  const resolved = await resolveSession();
  if (!resolved.ok) {
    return {
      ok: false,
      response: NextResponse.json(
        { ok: false, error: resolved.message },
        { status: resolved.httpStatus },
      ),
    };
  }
  if (resolved.dbUser.role !== "admin") {
    return {
      ok: false,
      response: NextResponse.json({ ok: false, error: "Forbidden" }, { status: 403 }),
    };
  }
  return { ok: true, authUser: resolved.authUser, dbUser: resolved.dbUser };
}

// ─────────────────────────────────────────────────────────────
// PAGE GUARDS — redirect instead of returning JSON
//
// Use in Server Component layouts and page components.
// Never use in Route Handlers (use the API guards above).
// ─────────────────────────────────────────────────────────────

export async function requireCoachOrAdminPage(): Promise<AuthedUser> {
  const resolved = await resolveSession();
  if (!resolved.ok) {
    redirect("/login?error=access_denied");
  }
  if (resolved.dbUser.role !== "coach" && resolved.dbUser.role !== "admin") {
    redirect("/login?error=access_denied");
  }
  // Entitlement gate — admin never reaches this branch (structural
  // bypass, same as the API guard above). A locked-out coach lands on
  // a dedicated screen, not the generic "you're not logged in" redirect.
  //
  // /account-status deliberately lives OUTSIDE app/hq/** — app/hq/layout.tsx
  // wraps every nested HQ route with this same requireCoachOrAdminPage()
  // guard, so a locked screen placed under /hq would redirect to itself
  // on every load. Top-level route, no shared layout, no loop.
  const entitlementResult = await assertCoachEntitled(resolved.dbUser);
  if (!entitlementResult.ok) {
    redirect("/account-status");
  }
  return { authUser: resolved.authUser, dbUser: resolved.dbUser };
}

// Minimal page guard: authenticated + not suspended/archived, no role
// or entitlement check at all. Exists solely for /account-status —
// that page cannot be gated by requireCoachOrAdminPage() without
// creating a redirect loop back to itself for a locked-out coach.
export async function requireAuthenticatedPage(): Promise<AuthedUser> {
  const resolved = await resolveSession();
  if (!resolved.ok) {
    redirect("/login?error=access_denied");
  }
  return { authUser: resolved.authUser, dbUser: resolved.dbUser };
}

// Admin-only page guard — mirrors requireCoachOrAdminPage() exactly,
// but does not admit the "coach" role. Use for surfaces an ordinary
// coach account must never reach (e.g. app/admin/growth/**), not just
// hidden from their navigation. A coach hitting one of these routes
// gets the same access_denied redirect as an unauthenticated visitor —
// this deliberately does not distinguish "not logged in" from "logged
// in but not admin" in the response, consistent with this file's
// existing 401-vs-403 posture for API guards.
export async function requireAdminPage(): Promise<AuthedUser> {
  const resolved = await resolveSession();
  if (!resolved.ok) {
    redirect("/login?error=access_denied");
  }
  if (resolved.dbUser.role !== "admin") {
    redirect("/login?error=access_denied");
  }
  return { authUser: resolved.authUser, dbUser: resolved.dbUser };
}

export async function requireOverwatchAdminPage(): Promise<AuthedUser> {
  const resolved = await resolveSession();
  if (!resolved.ok) {
    redirect("/overwatch/login?error=authentication_required&next=/overwatch");
  }
  if (resolved.dbUser.role !== "admin") {
    redirect("/overwatch/login?error=forbidden");
  }
  return { authUser: resolved.authUser, dbUser: resolved.dbUser };
}

// ─────────────────────────────────────────────────────────────
// OBJECT-LEVEL AUTHORIZATION
// ─────────────────────────────────────────────────────────────

// Verifies that a workout session belongs to clientId.
// Returns 404 (not 403) — avoids confirming the session exists
// to a requestor who does not own it.
export async function authorizeWorkoutSession(
  sessionId: string,
  clientId: string,
): Promise<NextResponse | null> {
  const db = getDb();
  const rows = await db
    .select({ id: workoutSessions.id })
    .from(workoutSessions)
    .where(
      and(
        eq(workoutSessions.id, sessionId),
        eq(workoutSessions.clientId, clientId),
      ),
    )
    .limit(1);

  if (!rows[0]) {
    return NextResponse.json({ ok: false, error: "Not found" }, { status: 404 });
  }
  return null;
}

// ─────────────────────────────────────────────────────────────
// TENANT SCOPE — coach-as-tenant resolution
//
// Kynovant's locked multi-tenancy model (docs/roadmaps/saas-evolution/
// kynovant-saas-evolution-roadmap.md §3): the coach is the tenant. No
// organizations, no teams. Every function below is written against a
// `coachId: string | null` scope rather than assuming a coach is always
// present, per that document's explicit guidance to model this as a
// resolver rather than hardcoding `coachId` as a bare parameter
// threaded everywhere — `null` is the one, single, well-documented
// meaning "no tenant filter" (i.e. admin) throughout this codebase.
//
// `admin` retains full cross-tenant visibility, by design (§4 of the
// scale-readiness audit: "preserve intentional admin access
// explicitly"). A `coach` is scoped to clients they are actually
// enrolled with via `coaching_enrollments` — no other role reaches
// this function's `coachId !== null` branch.
// ─────────────────────────────────────────────────────────────

export interface TenantScope {
  /** null = admin, no tenant filter applied. Otherwise the coach's own userId. */
  coachId: string | null;
}

export function resolveTenantScope(dbUser: PublicUser): TenantScope {
  return { coachId: dbUser.role === "admin" ? null : dbUser.id };
}

// Core ownership predicate: does this coach have ANY coaching_enrollments
// row with this client, regardless of status? Deliberately no status
// filter — see docs/catalyst-os-growth-crm.md-style reasoning applied
// here: a coach's relationship with a client (lead, active, paused,
// cancelled, upgraded) is still *their* relationship for isolation
// purposes. Status governs the coaching lifecycle, not tenant boundaries.
export async function coachOwnsClient(
  coachId: string,
  clientId: string,
): Promise<boolean> {
  const db = getDb();
  const rows = await db
    .select({ id: coachingEnrollments.id })
    .from(coachingEnrollments)
    .where(
      and(
        eq(coachingEnrollments.coachId, coachId),
        eq(coachingEnrollments.clientId, clientId),
      ),
    )
    .limit(1);
  return rows.length > 0;
}

export type OwnershipResult =
  | { ok: true; scope: TenantScope }
  | { ok: false; error: string };

// The single, canonical replacement for the "coach owns this client"
// check that was previously hand-copied (and left unimplemented, role-
// check-only) in multiple Server Action files. Admin always passes
// (scope.coachId === null). A coach passes only if coachOwnsClient()
// finds a real enrollment row. Deliberately returns the same "Not
// found" wording on both "client doesn't exist" and "not your client"
// — matches authorizeWorkoutSession's 404-not-403 posture: don't
// confirm existence of a resource to a requestor who doesn't own it.
export async function assertCoachOwnsClient(
  dbUser: PublicUser,
  clientId: string,
): Promise<OwnershipResult> {
  const scope = resolveTenantScope(dbUser);
  if (scope.coachId === null) return { ok: true, scope }; // admin bypass
  const owns = await coachOwnsClient(scope.coachId, clientId);
  if (!owns) return { ok: false, error: "Not found" };
  return { ok: true, scope };
}

// API-route flavor of assertCoachOwnsClient — mirrors
// authorizeWorkoutSession's NextResponse-or-null shape so route
// handlers can use the same `if (deny) return deny;` pattern.
export async function authorizeCoachClientAccess(
  dbUser: PublicUser,
  clientId: string,
): Promise<NextResponse | null> {
  const result = await assertCoachOwnsClient(dbUser, clientId);
  if (!result.ok) {
    return NextResponse.json({ ok: false, error: "Not found" }, { status: 404 });
  }
  return null;
}

// Resolves the owning clientId for a check-in, then defers to the same
// ownership check. Check-in mutations only ever receive a checkInId,
// not a clientId, so this does the one extra lookup they need.
export async function assertCoachOwnsCheckIn(
  dbUser: PublicUser,
  checkInId: string,
): Promise<OwnershipResult> {
  const scope = resolveTenantScope(dbUser);
  if (scope.coachId === null) return { ok: true, scope }; // admin bypass

  const db = getDb();
  const rows = await db
    .select({ clientId: weeklyCheckIns.clientId })
    .from(weeklyCheckIns)
    .where(eq(weeklyCheckIns.id, checkInId))
    .limit(1);

  const clientId = rows[0]?.clientId;
  if (!clientId) return { ok: false, error: "Not found" };

  const owns = await coachOwnsClient(scope.coachId, clientId);
  if (!owns) return { ok: false, error: "Not found" };
  return { ok: true, scope };
}

// ─────────────────────────────────────────────────────────────
// PROGRAM & BLUEPRINT OWNERSHIP
//
// program_weeks/program_week_days carry no coachId of their own —
// ownership resolves one hop up via programTemplates.createdBy.
// workout_template_sections/workout_template_exercises resolve the
// same way via workoutTemplates.createdBy. Same "resolve parent,
// then defer" shape as assertCoachOwnsCheckIn above.
//
// Approved visibility model (product decision, locked):
//   - MUTATION (update/delete/add sub-resource) is always owner-or-
//     admin only, regardless of the template's status.
//   - VIEW/CLONE additionally admits any coach when the template is
//     published (status: "active") — a shared platform/admin library
//     coaches may read and clone from, but never edit or delete.
//   - A coach's own non-published (draft/archived) templates remain
//     visible only to that coach and admin.
// ─────────────────────────────────────────────────────────────

// Strict ownership — used for every MUTATION check. createdBy === null
// (admin-authored/seeded) never matches a coachId here; only admin's
// own bypass (scope.coachId === null in the assert* wrappers) can
// mutate an admin-owned or ownerless template.
export async function coachOwnsProgramTemplate(
  coachId: string,
  programTemplateId: string,
): Promise<boolean> {
  const db = getDb();
  const rows = await db
    .select({ id: programTemplates.id })
    .from(programTemplates)
    .where(
      and(
        eq(programTemplates.id, programTemplateId),
        eq(programTemplates.createdBy, coachId),
      ),
    )
    .limit(1);
  return rows.length > 0;
}

export async function coachOwnsWorkoutTemplate(
  coachId: string,
  workoutTemplateId: string,
): Promise<boolean> {
  const db = getDb();
  const rows = await db
    .select({ id: workoutTemplates.id })
    .from(workoutTemplates)
    .where(
      and(
        eq(workoutTemplates.id, workoutTemplateId),
        eq(workoutTemplates.createdBy, coachId),
      ),
    )
    .limit(1);
  return rows.length > 0;
}

// View/clone visibility — owner OR a published (status: "active")
// template authored by anyone. Used for read access and as the clone
// source check; never used to authorize a write.
export async function coachCanViewProgramTemplate(
  coachId: string,
  programTemplateId: string,
): Promise<boolean> {
  const db = getDb();
  const rows = await db
    .select({ id: programTemplates.id })
    .from(programTemplates)
    .where(
      and(
        eq(programTemplates.id, programTemplateId),
        or(
          eq(programTemplates.createdBy, coachId),
          eq(programTemplates.status, "active"),
        ),
      ),
    )
    .limit(1);
  return rows.length > 0;
}

export async function coachCanViewWorkoutTemplate(
  coachId: string,
  workoutTemplateId: string,
): Promise<boolean> {
  const db = getDb();
  const rows = await db
    .select({ id: workoutTemplates.id })
    .from(workoutTemplates)
    .where(
      and(
        eq(workoutTemplates.id, workoutTemplateId),
        or(
          eq(workoutTemplates.createdBy, coachId),
          eq(workoutTemplates.status, "active"),
        ),
      ),
    )
    .limit(1);
  return rows.length > 0;
}

export async function assertCoachOwnsProgramTemplate(
  dbUser: PublicUser,
  programTemplateId: string,
): Promise<OwnershipResult> {
  const scope = resolveTenantScope(dbUser);
  if (scope.coachId === null) return { ok: true, scope }; // admin bypass
  const owns = await coachOwnsProgramTemplate(scope.coachId, programTemplateId);
  if (!owns) return { ok: false, error: "Not found" };
  return { ok: true, scope };
}

export async function assertCoachCanViewProgramTemplate(
  dbUser: PublicUser,
  programTemplateId: string,
): Promise<OwnershipResult> {
  const scope = resolveTenantScope(dbUser);
  if (scope.coachId === null) return { ok: true, scope }; // admin bypass
  const canView = await coachCanViewProgramTemplate(scope.coachId, programTemplateId);
  if (!canView) return { ok: false, error: "Not found" };
  return { ok: true, scope };
}

export async function assertCoachOwnsWorkoutTemplate(
  dbUser: PublicUser,
  workoutTemplateId: string,
): Promise<OwnershipResult> {
  const scope = resolveTenantScope(dbUser);
  if (scope.coachId === null) return { ok: true, scope }; // admin bypass
  const owns = await coachOwnsWorkoutTemplate(scope.coachId, workoutTemplateId);
  if (!owns) return { ok: false, error: "Not found" };
  return { ok: true, scope };
}

export async function assertCoachCanViewWorkoutTemplate(
  dbUser: PublicUser,
  workoutTemplateId: string,
): Promise<OwnershipResult> {
  const scope = resolveTenantScope(dbUser);
  if (scope.coachId === null) return { ok: true, scope }; // admin bypass
  const canView = await coachCanViewWorkoutTemplate(scope.coachId, workoutTemplateId);
  if (!canView) return { ok: false, error: "Not found" };
  return { ok: true, scope };
}

// Resolves weekId -> programTemplateId, then defers to the strict
// (mutation) ownership check. A week is never independently owned —
// it inherits its parent template's ownership entirely.
export async function assertCoachOwnsProgramWeek(
  dbUser: PublicUser,
  weekId: string,
): Promise<OwnershipResult> {
  const scope = resolveTenantScope(dbUser);
  if (scope.coachId === null) return { ok: true, scope }; // admin bypass

  const db = getDb();
  const rows = await db
    .select({ programTemplateId: programWeeks.programTemplateId })
    .from(programWeeks)
    .where(eq(programWeeks.id, weekId))
    .limit(1);

  const programTemplateId = rows[0]?.programTemplateId;
  if (!programTemplateId) return { ok: false, error: "Not found" };

  const owns = await coachOwnsProgramTemplate(scope.coachId, programTemplateId);
  if (!owns) return { ok: false, error: "Not found" };
  return { ok: true, scope };
}

// Resolves sectionId -> workoutTemplateId, then defers to the strict
// (mutation) ownership check.
export async function assertCoachOwnsWorkoutSection(
  dbUser: PublicUser,
  sectionId: string,
): Promise<OwnershipResult> {
  const scope = resolveTenantScope(dbUser);
  if (scope.coachId === null) return { ok: true, scope }; // admin bypass

  const db = getDb();
  const rows = await db
    .select({ workoutTemplateId: workoutTemplateSections.workoutTemplateId })
    .from(workoutTemplateSections)
    .where(eq(workoutTemplateSections.id, sectionId))
    .limit(1);

  const workoutTemplateId = rows[0]?.workoutTemplateId;
  if (!workoutTemplateId) return { ok: false, error: "Not found" };

  const owns = await coachOwnsWorkoutTemplate(scope.coachId, workoutTemplateId);
  if (!owns) return { ok: false, error: "Not found" };
  return { ok: true, scope };
}

// Resolves prescriptionId -> workoutTemplateId, then defers to the
// strict (mutation) ownership check.
export async function assertCoachOwnsPrescription(
  dbUser: PublicUser,
  prescriptionId: string,
): Promise<OwnershipResult> {
  const scope = resolveTenantScope(dbUser);
  if (scope.coachId === null) return { ok: true, scope }; // admin bypass

  const db = getDb();
  const rows = await db
    .select({ workoutTemplateId: workoutTemplateExercises.workoutTemplateId })
    .from(workoutTemplateExercises)
    .where(eq(workoutTemplateExercises.id, prescriptionId))
    .limit(1);

  const workoutTemplateId = rows[0]?.workoutTemplateId;
  if (!workoutTemplateId) return { ok: false, error: "Not found" };

  const owns = await coachOwnsWorkoutTemplate(scope.coachId, workoutTemplateId);
  if (!owns) return { ok: false, error: "Not found" };
  return { ok: true, scope };
}

// ─────────────────────────────────────────────────────────────
// PROGRAM & BLUEPRINT — API-ROUTE FLAVORS
//
// Same NextResponse-or-null shape as authorizeCoachClientAccess, so
// route handlers use the identical `if (deny) return deny;` pattern.
// ─────────────────────────────────────────────────────────────

function denyNotFound(): NextResponse {
  return NextResponse.json({ ok: false, error: "Not found" }, { status: 404 });
}

export async function authorizeCoachProgramMutation(
  dbUser: PublicUser,
  programTemplateId: string,
): Promise<NextResponse | null> {
  const result = await assertCoachOwnsProgramTemplate(dbUser, programTemplateId);
  return result.ok ? null : denyNotFound();
}

// Used for GET (read) and the clone source — admits published
// templates authored by anyone, per the shared-library decision.
export async function authorizeCoachProgramView(
  dbUser: PublicUser,
  programTemplateId: string,
): Promise<NextResponse | null> {
  const result = await assertCoachCanViewProgramTemplate(dbUser, programTemplateId);
  return result.ok ? null : denyNotFound();
}

export async function authorizeCoachWorkoutTemplateMutation(
  dbUser: PublicUser,
  workoutTemplateId: string,
): Promise<NextResponse | null> {
  const result = await assertCoachOwnsWorkoutTemplate(dbUser, workoutTemplateId);
  return result.ok ? null : denyNotFound();
}

export async function authorizeCoachWorkoutTemplateView(
  dbUser: PublicUser,
  workoutTemplateId: string,
): Promise<NextResponse | null> {
  const result = await assertCoachCanViewWorkoutTemplate(dbUser, workoutTemplateId);
  return result.ok ? null : denyNotFound();
}

export async function authorizeCoachProgramWeekMutation(
  dbUser: PublicUser,
  weekId: string,
): Promise<NextResponse | null> {
  const result = await assertCoachOwnsProgramWeek(dbUser, weekId);
  return result.ok ? null : denyNotFound();
}

export async function authorizeCoachWorkoutSectionMutation(
  dbUser: PublicUser,
  sectionId: string,
): Promise<NextResponse | null> {
  const result = await assertCoachOwnsWorkoutSection(dbUser, sectionId);
  return result.ok ? null : denyNotFound();
}

export async function authorizeCoachPrescriptionMutation(
  dbUser: PublicUser,
  prescriptionId: string,
): Promise<NextResponse | null> {
  const result = await assertCoachOwnsPrescription(dbUser, prescriptionId);
  return result.ok ? null : denyNotFound();
}

// ─────────────────────────────────────────────────────────────
// DOCUMENT OWNERSHIP (ADR-012)
//
// Unlike program templates, documents have no "published, viewable
// by any coach" state — a document belongs to exactly the coach who
// created it, full stop. There is no coachCanView/coachOwns split
// here; one ownership check covers both read and mutation, matching
// the product requirement "another coach cannot view/manage
// documents they do not own."
// ─────────────────────────────────────────────────────────────

export async function coachOwnsDocument(
  coachId: string,
  documentId: string,
): Promise<boolean> {
  const db = getDb();
  const rows = await db
    .select({ id: documents.id })
    .from(documents)
    .where(and(eq(documents.id, documentId), eq(documents.createdByCoachId, coachId)))
    .limit(1);
  return rows.length > 0;
}

export async function assertCoachOwnsDocument(
  dbUser: PublicUser,
  documentId: string,
): Promise<OwnershipResult> {
  const scope = resolveTenantScope(dbUser);
  if (scope.coachId === null) return { ok: true, scope }; // admin bypass
  const owns = await coachOwnsDocument(scope.coachId, documentId);
  if (!owns) return { ok: false, error: "Not found" };
  return { ok: true, scope };
}

// API-route flavor — covers list-item view, update, archive, delete,
// and download (signed-URL generation). Route handlers use the same
// `if (deny) return deny;` pattern as authorizeCoachProgramMutation.
export async function authorizeCoachDocumentMutation(
  dbUser: PublicUser,
  documentId: string,
): Promise<NextResponse | null> {
  const result = await assertCoachOwnsDocument(dbUser, documentId);
  return result.ok ? null : denyNotFound();
}

// ─────────────────────────────────────────────────────────────
// EXERCISE LIBRARY VISIBILITY / MUTATION
//
// Admin can view and mutate all Exercise Library rows. Coaches can view
// shared platform rows plus their own coach-scoped rows. Coaches can
// mutate only their own coach-scoped rows; canonical system/org rows
// are edited through reviewed admin data flows, not direct coach PATCH
// calls.
// ─────────────────────────────────────────────────────────────

export async function authorizeExerciseView(
  dbUser: PublicUser,
  exerciseId: string,
): Promise<NextResponse | null> {
  if (dbUser.role === "admin") return null;

  const db = getDb();
  const rows = await db
    .select({ id: exercises.id })
    .from(exercises)
    .where(
      and(
        eq(exercises.id, exerciseId),
        or(
          eq(exercises.scope, "system"),
          eq(exercises.scope, "organization"),
          and(eq(exercises.scope, "coach"), eq(exercises.createdBy, dbUser.id)),
        )!,
      ),
    )
    .limit(1);

  return rows.length > 0 ? null : denyNotFound();
}

export async function authorizeExerciseMutation(
  dbUser: PublicUser,
  exerciseId: string,
): Promise<NextResponse | null> {
  if (dbUser.role === "admin") return null;

  const db = getDb();
  const rows = await db
    .select({ id: exercises.id })
    .from(exercises)
    .where(
      and(
        eq(exercises.id, exerciseId),
        eq(exercises.scope, "coach"),
        eq(exercises.createdBy, dbUser.id),
      ),
    )
    .limit(1);

  return rows.length > 0 ? null : denyNotFound();
}
