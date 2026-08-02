import { type NextRequest, NextResponse } from "next/server";
import { listActiveClients } from "@/lib/db/client-program-service";
import { requireCoachOrAdmin } from "@/lib/auth/guards";
import { createAdminClient, AdminClientConfigError } from "@/lib/supabase/admin";
import { getDb } from "@/lib/db/client";
import { clientProfiles } from "@/lib/db/schema";

export const dynamic = "force-dynamic";

// GET /api/internal/clients
// Returns all active/invited clients for the program Assign panel.
// Deliberately minimal — id + display name only.
//
// Known limitation (tracked, not fixed here): this returns every client
// on the platform, not just the requesting coach's own — see the
// multi-tenant seam noted in lib/db/client-program-service.ts.
export async function GET() {
  const guard = await requireCoachOrAdmin();
  if (!guard.ok) return guard.response;
  try {
    const clients = await listActiveClients();
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
