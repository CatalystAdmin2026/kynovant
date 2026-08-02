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
import { users } from "@/lib/db/schema";
import { workoutSessions } from "@/lib/db/schema-program";
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
