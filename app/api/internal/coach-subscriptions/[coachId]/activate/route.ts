import { type NextRequest, NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { getDb } from "@/lib/db/client";
import { users } from "@/lib/db/schema";
import { activateCoachBeta } from "@/lib/db/coach-subscription-service";
import { requireAdmin } from "@/lib/auth/guards";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ coachId: string }> };

// POST /api/internal/coach-subscriptions/[coachId]/activate
//
// Admin-only manual activation — the on-ramp for Founding Coach /
// beta access with no real Stripe subscription behind it. Deliberately
// gated by requireAdmin() (true admin-only), not requireCoachOrAdmin():
// this is exactly the class of route the scale-readiness audit calls
// out by name — admin-only mutations must use the admin-only guard
// from the start, not the coach-admitting one.
//
// Body: { currentPeriodEnd?: string (ISO date) }
export async function POST(req: NextRequest, { params }: Ctx) {
  const guard = await requireAdmin();
  if (!guard.ok) return guard.response;
  const { coachId } = await params;

  try {
    const db = getDb();
    const [target] = await db
      .select({ id: users.id, role: users.role })
      .from(users)
      .where(eq(users.id, coachId))
      .limit(1);

    if (!target) {
      return NextResponse.json({ ok: false, error: "User not found" }, { status: 404 });
    }
    if (target.role !== "coach") {
      return NextResponse.json(
        { ok: false, error: `User has role '${target.role}', not 'coach'. Refusing to activate.` },
        { status: 400 },
      );
    }

    const body = await req.json().catch(() => ({})) as { currentPeriodEnd?: string };
    const currentPeriodEnd = body.currentPeriodEnd ? new Date(body.currentPeriodEnd) : null;

    await activateCoachBeta(coachId, guard.dbUser.id, { currentPeriodEnd });

    return NextResponse.json({ ok: true });
  } catch (err) {
    return NextResponse.json(
      { ok: false, error: err instanceof Error ? err.message : "Activation failed" },
      { status: 500 },
    );
  }
}
