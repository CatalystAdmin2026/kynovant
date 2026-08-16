// ─────────────────────────────────────────────────────────────
// Kynovant — RD/RDN Verification Gate
//
// SERVER-ONLY — never import from a Client Component.
//
// The one, canonical answer to "is this coach currently verified to
// use an RD/RDN-restricted feature?" — built and tested BEFORE any
// such feature exists (there is no meal-plan builder yet; this file
// has nothing to gate today). A future feature (e.g. an AI meal-plan
// generator) imports requireVerifiedRdCoach() from here instead of
// re-deriving verification logic.
//
// PRODUCT BOUNDARY — read before touching this file or any future
// RD/RDN-gated feature:
//   - Ordinary calorie/protein/carb/fat targets
//     (lib/db/nutrition-target-service.ts) require NONE of this.
//     Every coach can use that system today; this file does not gate
//     it and must never be wired into it.
//   - This module verifies that Kynovant has an admin-approved,
//     unexpired coach_credentials row on file for a coach. It does
//     NOT verify — and cannot verify — that a submitted license
//     number is currently valid with the issuing licensing board, or
//     that the credential entitles the coach to prescribe
//     individualized nutrition in every jurisdiction they practice
//     in. That determination is a human admin-review judgment call
//     (app/admin/growth/credentials), not something this code
//     independently establishes from the submitted fields alone.
//
// Fail-closed by construction: every early return in isVerifiedRd()
// and every catch block returns false, never true. There is no code
// path that defaults to "verified" on missing data, malformed data,
// or a DB error.
// ─────────────────────────────────────────────────────────────

import "server-only";
import { NextResponse } from "next/server";
import { redirect } from "next/navigation";
import { eq } from "drizzle-orm";
import { getDb } from "@/lib/db/client";
import { coachCredentials } from "@/lib/db/schema-coach-credentials";
import { isExpired } from "@/lib/db/coach-credential-service";
import { requireCoachOrAdmin, requireCoachOrAdminPage } from "./guards";
import type { GuardResult, AuthedUser } from "./guards";

// ─────────────────────────────────────────────────────────────
// CORE PREDICATE
//
// Takes a coachId, not a session — this is a pure "given this exact
// ID, is it verified" query, independently unit-testable without a
// request/session in the loop. It is NOT itself an authorization
// guard: nothing here authenticates the caller or proves the caller
// IS that coachId. That responsibility belongs entirely to
// requireVerifiedRdCoach() below (and to any future route/action
// that calls isVerifiedRd() directly) — always resolve coachId from
// an authenticated session (requireCoachOrAdmin().dbUser.id), never
// from a request body, query param, or client-supplied value.
// ─────────────────────────────────────────────────────────────

export async function isVerifiedRd(coachId: string): Promise<boolean> {
  if (!coachId) return false;

  try {
    const db = getDb();
    const [row] = await db
      .select({
        status: coachCredentials.status,
        expirationDate: coachCredentials.expirationDate,
      })
      .from(coachCredentials)
      .where(eq(coachCredentials.coachId, coachId))
      .limit(1);

    if (!row) return false; // no credential on file
    if (row.status !== "approved") return false; // pending or rejected
    if (isExpired(row.expirationDate)) return false; // approved but lapsed

    return true;
  } catch (err) {
    // Fail closed on any DB/connectivity error — never assume verified.
    console.error("[rd-credential] isVerifiedRd error:", err instanceof Error ? err.message : err);
    return false;
  }
}

// ─────────────────────────────────────────────────────────────
// ROUTE / SERVER ACTION GUARD
//
// API-route flavor, matching every other guard in lib/auth/guards.ts:
// `const guard = await requireVerifiedRdCoach(); if (!guard.ok) return guard.response;`
//
// Deliberately does NOT reuse requireCoachOrAdmin's admin bypass.
// Elsewhere in this codebase, "admin" bypasses coach/client TENANT
// scoping (resolveTenantScope) because admin legitimately owns/oversees
// every tenant's data. RD/RDN verification is a different kind of
// boundary — a real-world professional-licensure fact about a specific
// person — and being a Kynovant admin does not make someone a
// registered dietitian. An admin account must go through the same
// coach_credentials verification as any coach to pass this gate.
// ─────────────────────────────────────────────────────────────

export async function requireVerifiedRdCoach(): Promise<GuardResult> {
  const guard = await requireCoachOrAdmin();
  if (!guard.ok) return guard;

  const verified = await isVerifiedRd(guard.dbUser.id);
  if (!verified) {
    return {
      ok: false,
      response: NextResponse.json(
        { ok: false, error: "RD/RDN verification is required for this feature." },
        { status: 403 },
      ),
    };
  }

  return guard;
}

// Server Component / page flavor — redirects instead of returning
// JSON, matching requireCoachOrAdminPage(). Redirects to the
// credential submission page rather than a bare "forbidden" screen,
// since the actionable next step for an unverified coach IS to submit
// (or wait on review of) their credential.
export async function requireVerifiedRdCoachPage(): Promise<AuthedUser> {
  const authed = await requireCoachOrAdminPage();

  const verified = await isVerifiedRd(authed.dbUser.id);
  if (!verified) {
    redirect("/hq/credentials?error=verification_required");
  }

  return authed;
}
