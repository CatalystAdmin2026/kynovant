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
import { eq, and } from "drizzle-orm";
import { createClient } from "@/lib/supabase/server";
import { getDb } from "@/lib/db/client";
import { users, coachingEnrollments } from "@/lib/db/schema";
import { workoutSessions } from "@/lib/db/schema-program";
import { weeklyCheckIns } from "@/lib/db/schema-check-in";
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
