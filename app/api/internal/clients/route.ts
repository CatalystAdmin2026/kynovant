import { type NextRequest, NextResponse } from "next/server";
import { listActiveClients } from "@/lib/db/client-program-service";
import { requireCoachOrAdmin, resolveTenantScope } from "@/lib/auth/guards";
import { createAdminClient, AdminClientConfigError } from "@/lib/supabase/admin";
import { getDb } from "@/lib/db/client";
import { clientProfiles, coachingEnrollments } from "@/lib/db/schema";

export const dynamic = "force-dynamic";

// GET /api/internal/clients
// Returns active/invited clients for the program Assign panel, scoped
// to the requesting coach's own coaching_enrollments (admin: all).
// Deliberately minimal — id + display name only.
export async function GET() {
  const guard = await requireCoachOrAdmin();
  if (!guard.ok) return guard.response;
  try {
    const { coachId } = resolveTenantScope(guard.dbUser);
    const clients = await listActiveClients(coachId);
    return NextResponse.json({ ok: true, clients });
  } catch (err) {
    return NextResponse.json(
      { ok: false, error: err instanceof Error ? err.message : "Failed" },
      { status: 500 },
    );
  }
}

// POST /api/internal/clients
// Coach-initiated client creation — used by the HQ onboarding wizard's
// "first client" step. Invites the client via Supabase Auth Admin (email
// invite, same activation path as app/setup-password) and creates their
// client_profiles row. The new user gets role='client' from the
// on_auth_user_created trigger's default — no promotion needed.
export async function POST(req: NextRequest) {
  const guard = await requireCoachOrAdmin();
  if (!guard.ok) return guard.response;

  let body: { fullName?: string; email?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid request body" }, { status: 400 });
  }

  const fullName = body.fullName?.trim();
  const email = body.email?.trim().toLowerCase();

  if (!fullName) {
    return NextResponse.json({ ok: false, error: "fullName is required" }, { status: 400 });
  }
  if (!email) {
    return NextResponse.json({ ok: false, error: "email is required" }, { status: 400 });
  }

  try {
    const admin = createAdminClient();
    const siteOrigin = process.env.NEXT_PUBLIC_SITE_URL ?? "https://www.kynovant.com";

    const { data, error } = await admin.auth.admin.inviteUserByEmail(email, {
      redirectTo: `${siteOrigin}/auth/callback`,
    });

    if (error || !data.user) {
      return NextResponse.json(
        { ok: false, error: error?.message ?? "Invite failed" },
        { status: 422 },
      );
    }

    const db = getDb();
    await db
      .insert(clientProfiles)
      .values({ userId: data.user.id, fullName })
      .onConflictDoUpdate({
        target: clientProfiles.userId,
        set: { fullName },
      });

    // Establish the tenant link. Without this, coach-scoped reads
    // (lib/db/coach-dashboard-service.ts etc.) would never see a client
    // this coach just invited — coaching_enrollments is the sole source
    // of truth for "does this coach own this client." Admin-initiated
    // invites skip this: admin bypasses tenant scoping entirely and
    // isn't itself a coach-tenant, so there's no enrollment to create.
    //
    // packageType/monthlyRateCents are placeholders here — those columns
    // predate the coach-as-SaaS-tenant model (they describe Kynovant's
    // own consumer physique-coaching packages) and have no defined
    // meaning yet for an independent coach's own client roster. This is
    // a known open question, not a considered design decision — see the
    // coach-plan/pricing work in Phase 3 of
    // docs/roadmaps/saas-evolution/kynovant-saas-evolution-roadmap.md.
    if (guard.dbUser.role === "coach") {
      await db.insert(coachingEnrollments).values({
        clientId: data.user.id,
        coachId: guard.dbUser.id,
        packageType: "Standard",
        monthlyRateCents: 0,
        status: "active",
      });
    }

    return NextResponse.json(
      { ok: true, client: { id: data.user.id, name: fullName, email } },
      { status: 201 },
    );
  } catch (err) {
    if (err instanceof AdminClientConfigError) {
      console.error("[internal/clients] " + err.message);
      return NextResponse.json(
        { ok: false, error: "Client invite service is temporarily unavailable. Please try again shortly or contact support." },
        { status: 503 },
      );
    }
    return NextResponse.json(
      { ok: false, error: err instanceof Error ? err.message : "Failed" },
      { status: 500 },
    );
  }
}
