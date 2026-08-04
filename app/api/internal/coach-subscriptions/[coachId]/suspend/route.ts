import { type NextRequest, NextResponse } from "next/server";
import { suspendCoachSubscription } from "@/lib/db/coach-subscription-service";
import { requireAdmin } from "@/lib/auth/guards";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ coachId: string }> };

// POST /api/internal/coach-subscriptions/[coachId]/suspend
//
// Admin-only manual suspension — locks a coach out of HQ independent
// of Stripe (policy violation, manual hold, etc). Admin-only guard,
// same reasoning as the activate route above.
export async function POST(_req: NextRequest, { params }: Ctx) {
  const guard = await requireAdmin();
  if (!guard.ok) return guard.response;
  const { coachId } = await params;

  try {
    const result = await suspendCoachSubscription(coachId, guard.dbUser.id);
    if (!result.ok) {
      return NextResponse.json({ ok: false, error: result.error }, { status: 404 });
    }
    return NextResponse.json({ ok: true });
  } catch (err) {
    return NextResponse.json(
      { ok: false, error: err instanceof Error ? err.message : "Suspend failed" },
      { status: 500 },
    );
  }
}
