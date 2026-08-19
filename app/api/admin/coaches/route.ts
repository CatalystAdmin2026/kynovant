// ─────────────────────────────────────────────────────────────
// Admin — Coach Invitations
//
// SERVER-ONLY. Admin-only (requireAdmin, not requireCoachOrAdmin) —
// this mints new paying-tier coach seats, so it must not be reachable
// by a plain coach account.
//
// POST invites a new coach via Supabase Auth Admin, then grants the
// 'coach' role and creates their coach_profiles row via
// provisionInvitedCoach() (lib/db/coach-provisioning-service.ts) — the
// role is never taken from request input or Supabase user_metadata,
// consistent with the invariant documented in lib/auth/guards.ts.
//
// provisionInvitedCoach() is shared with the self-service signup path
// (app/api/coach-signup/route.ts) — same idempotent upsert logic,
// same hardcoded role, different (admin-guarded vs. public/rate-
// limited) entry point.
// ─────────────────────────────────────────────────────────────

import { NextRequest, NextResponse } from "next/server";
import { eq, inArray, desc } from "drizzle-orm";
import { requireAdmin } from "@/lib/auth/guards";
import { createAdminClient, AdminClientConfigError } from "@/lib/supabase/admin";
import { getDb } from "@/lib/db/client";
import { users, coachProfiles } from "@/lib/db/schema";
import { provisionInvitedCoach } from "@/lib/db/coach-provisioning-service";
import { signInviteHandoffToken } from "@/lib/auth/onboarding-token";

export const dynamic = "force-dynamic";

export async function GET() {
  const guard = await requireAdmin();
  if (!guard.ok) return guard.response;

  try {
    const db = getDb();
    const rows = await db
      .select({
        id: users.id,
        email: users.email,
        role: users.role,
        status: users.status,
        createdAt: users.createdAt,
        displayName: coachProfiles.displayName,
      })
      .from(users)
      .leftJoin(coachProfiles, eq(coachProfiles.userId, users.id))
      .where(inArray(users.role, ["coach", "admin"]))
      .orderBy(desc(users.createdAt));

    return NextResponse.json({ ok: true, coaches: rows });
  } catch (err) {
    return NextResponse.json(
      { ok: false, error: err instanceof Error ? err.message : "Failed" },
      { status: 500 },
    );
  }
}

export async function POST(req: NextRequest) {
  const guard = await requireAdmin();
  if (!guard.ok) return guard.response;

  let body: { email?: string; displayName?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid request body" }, { status: 400 });
  }

  const email = body.email?.trim().toLowerCase();
  const displayName = body.displayName?.trim();

  if (!email) {
    return NextResponse.json({ ok: false, error: "email is required" }, { status: 400 });
  }
  if (!displayName) {
    return NextResponse.json({ ok: false, error: "displayName is required" }, { status: 400 });
  }

  try {
    const admin = createAdminClient();
    const siteOrigin = process.env.NEXT_PUBLIC_SITE_URL ?? "https://www.kynovant.com";

    const { data, error } = await admin.auth.admin.inviteUserByEmail(email, {
      redirectTo: `${siteOrigin}/auth/callback?type=invite&handoff=${encodeURIComponent(signInviteHandoffToken(email))}`,
    });

    if (error || !data.user) {
      return NextResponse.json(
        { ok: false, error: error?.message ?? "Invite failed" },
        { status: 422 },
      );
    }

    const newUserId = data.user.id;

    // The on_auth_user_created trigger already inserted a public.users row
    // with role='client' (the trigger's hardcoded default — see
    // drizzle/0001_catalyst_auth.sql). Promote it to 'coach' here, in the
    // same server-side path that already validated the requester is an
    // admin — never via user_metadata or client input.
    await provisionInvitedCoach({ userId: newUserId, email, displayName });

    return NextResponse.json({ ok: true, coachId: newUserId }, { status: 201 });
  } catch (err) {
    if (err instanceof AdminClientConfigError) {
      console.error("[admin/coaches] " + err.message);
      return NextResponse.json(
        { ok: false, error: "Invite service is temporarily unavailable. Please try again shortly." },
        { status: 503 },
      );
    }
    return NextResponse.json(
      { ok: false, error: err instanceof Error ? err.message : "Failed" },
      { status: 500 },
    );
  }
}
