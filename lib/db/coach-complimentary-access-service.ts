// ─────────────────────────────────────────────────────────────
// Kynovant — Coach Complimentary Access
//
// SERVER-ONLY — never import from a Client Component.
//
// Backs founder-granted "full Coach HQ access, no billing required"
// entitlement — see lib/db/schema-billing.ts's coach_complimentary_access
// table header for why this is a fully separate table from
// coach_subscriptions rather than another status value on it.
//
// AUTHORIZATION IS THE CALLER'S RESPONSIBILITY. Exactly like
// activateCoachBeta()/suspendCoachSubscription() in
// coach-subscription-service.ts, every function here trusts its
// `grantedBy`/`revokedBy` argument completely — it is the route
// handler's job to have already run requireOverwatchAdmin() (or
// equivalent) and pass that guard's own server-derived admin id, never
// a client-supplied one. See app/api/internal/overwatch/coaches/
// [coachId]/complimentary/grant|revoke/route.ts for the enforcement.
// ─────────────────────────────────────────────────────────────

import "server-only";
import { and, desc, eq, isNull, or, sql } from "drizzle-orm";
import { getDb } from "./client";
import {
  coachComplimentaryAccess,
  type CoachComplimentaryAccess,
} from "./schema-billing";

export interface ActiveComplimentaryAccess {
  id: string;
  grantedAt: Date;
  expiresAt: Date | null;
  reason: string | null;
}

// ─────────────────────────────────────────────────────────────
// READ — the single function getCoachEntitlement() calls.
//
// Lazily closes out an expired grant on read (status: 'active' but
// expiresAt has elapsed) — same "no background job runner exists yet,
// so apply the expiry at read time" shape coach_subscriptions' own
// past_due → suspended transition already uses. The optimistic WHERE
// (status still 'active') guards against a concurrent revoke landing
// between the SELECT above and this UPDATE.
// ─────────────────────────────────────────────────────────────

export async function getActiveComplimentaryAccess(
  coachId: string,
): Promise<ActiveComplimentaryAccess | null> {
  const db = getDb();
  const [row] = await db
    .select()
    .from(coachComplimentaryAccess)
    .where(and(eq(coachComplimentaryAccess.coachId, coachId), eq(coachComplimentaryAccess.status, "active")))
    .limit(1);

  if (!row) return null;

  if (row.expiresAt !== null && row.expiresAt.getTime() <= Date.now()) {
    await db
      .update(coachComplimentaryAccess)
      .set({ status: "expired", revokedAt: new Date(), updatedAt: new Date() })
      .where(and(eq(coachComplimentaryAccess.id, row.id), eq(coachComplimentaryAccess.status, "active")));
    return null;
  }

  return { id: row.id, grantedAt: row.grantedAt, expiresAt: row.expiresAt, reason: row.reason };
}

// ─────────────────────────────────────────────────────────────
// GRANT — idempotent by design. Calling this on a coach who already
// has an active grant updates that same row (refreshed reason/
// expiresAt/grantedBy/grantedAt) rather than erroring or creating a
// second row, which is exactly what the partial unique index
// (uq_coach_complimentary_access_active_coach) would reject anyway.
// This is what makes the Invite Coach route's retry-on-resend path
// safe to call unconditionally: a retried "grant complimentary access"
// after a prior partial failure converges to the same end state
// instead of erroring on a duplicate.
// ─────────────────────────────────────────────────────────────

export interface GrantComplimentaryAccessInput {
  coachId: string;
  grantedBy: string;
  reason?: string | null;
  expiresAt?: Date | null;
}

export async function grantComplimentaryAccess(
  input: GrantComplimentaryAccessInput,
): Promise<CoachComplimentaryAccess> {
  const db = getDb();

  const [existing] = await db
    .select({ id: coachComplimentaryAccess.id })
    .from(coachComplimentaryAccess)
    .where(and(eq(coachComplimentaryAccess.coachId, input.coachId), eq(coachComplimentaryAccess.status, "active")))
    .limit(1);

  if (existing) {
    const [updated] = await db
      .update(coachComplimentaryAccess)
      .set({
        reason: input.reason ?? null,
        grantedBy: input.grantedBy,
        grantedAt: new Date(),
        expiresAt: input.expiresAt ?? null,
        updatedAt: new Date(),
      })
      .where(eq(coachComplimentaryAccess.id, existing.id))
      .returning();
    return updated;
  }

  const [created] = await db
    .insert(coachComplimentaryAccess)
    .values({
      coachId: input.coachId,
      status: "active",
      reason: input.reason ?? null,
      grantedBy: input.grantedBy,
      expiresAt: input.expiresAt ?? null,
    })
    .returning();
  return created;
}

// ─────────────────────────────────────────────────────────────
// REVOKE — fails cleanly (ok:false) when there is no active grant to
// revoke, same shape as suspendCoachSubscription()'s "no subscription
// record" failure. Never touches coach_subscriptions.
// ─────────────────────────────────────────────────────────────

export async function revokeComplimentaryAccess(
  coachId: string,
  revokedBy: string,
  reason?: string | null,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const db = getDb();

  const [existing] = await db
    .select({ id: coachComplimentaryAccess.id })
    .from(coachComplimentaryAccess)
    .where(and(eq(coachComplimentaryAccess.coachId, coachId), eq(coachComplimentaryAccess.status, "active")))
    .limit(1);

  if (!existing) {
    return { ok: false, error: "This coach has no active complimentary access to revoke." };
  }

  await db
    .update(coachComplimentaryAccess)
    .set({
      status: "revoked",
      revokedBy,
      revokedAt: new Date(),
      reason: reason ?? undefined,
      updatedAt: new Date(),
    })
    .where(and(eq(coachComplimentaryAccess.id, existing.id), eq(coachComplimentaryAccess.status, "active")));

  return { ok: true };
}

// ─────────────────────────────────────────────────────────────
// HISTORY — founder-facing audit trail for the account detail surface.
// Read-only, admin-authorization is the caller's responsibility (same
// convention as every other function in this file).
// ─────────────────────────────────────────────────────────────

export async function listComplimentaryAccessHistory(
  coachId: string,
): Promise<CoachComplimentaryAccess[]> {
  const db = getDb();
  return db
    .select()
    .from(coachComplimentaryAccess)
    .where(eq(coachComplimentaryAccess.coachId, coachId))
    .orderBy(desc(coachComplimentaryAccess.grantedAt));
}

// ─────────────────────────────────────────────────────────────
// BULK READ — for Overwatch's account directory. Returns the coachIds
// that currently have an active (not lazily expired — see below)
// complimentary grant, so overwatch-service.ts can badge them without
// an N+1 query. Deliberately does NOT perform the lazy-expiry write
// getActiveComplimentaryAccess() does per-row — a read-heavy analytics
// query is the wrong place for a side-effecting UPDATE, and a small
// window where an already-expired-but-not-yet-lazily-closed grant still
// shows as "Complimentary" in the directory is harmless (the coach's
// actual entitlement, decided by getCoachEntitlement() on their own
// request, closes it out correctly regardless of what the directory
// currently displays).
// ─────────────────────────────────────────────────────────────

export async function listActiveComplimentaryCoachIds(): Promise<Set<string>> {
  const db = getDb();
  const rows = await db
    .select({ coachId: coachComplimentaryAccess.coachId })
    .from(coachComplimentaryAccess)
    .where(
      and(
        eq(coachComplimentaryAccess.status, "active"),
        or(isNull(coachComplimentaryAccess.expiresAt), sql`${coachComplimentaryAccess.expiresAt} > now()`),
      ),
    );
  return new Set(rows.map((r) => r.coachId));
}

// Used by the account detail page to show a coach as "Complimentary
// (expiring soon)" — a row that's still 'active' in the table but past
// its expiresAt (not yet lazily closed out by getActiveComplimentaryAccess
// running on that coach's own request). Pure, no DB access.
export function isRowPastExpiry(row: Pick<CoachComplimentaryAccess, "status" | "expiresAt">): boolean {
  return row.status === "active" && row.expiresAt !== null && row.expiresAt.getTime() <= Date.now();
}
