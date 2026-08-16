import { type NextRequest, NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { getDb } from "@/lib/db/client";
import { users } from "@/lib/db/schema";
import { requireOverwatchAdmin } from "@/lib/auth/guards";
import { revokeComplimentaryAccess } from "@/lib/db/coach-complimentary-access-service";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ coachId: string }> };

const MAX_REASON_LENGTH = 500;

// POST /api/internal/overwatch/coaches/[coachId]/complimentary/revoke
//
// Admin-only — identical authorization posture to the grant route (see
// its header comment). Revoking never touches coach_subscriptions: a
// coach who separately has a real, valid subscription keeps it exactly
// as-is, because nothing on this path has ever written to that table.
//
// Body: { reason?: string }
export async function POST(req: NextRequest, { params }: Ctx) {
  const guard = await requireOverwatchAdmin();
  if (!guard.ok) return guard.response;

  const { coachId } = await params;

  const db = getDb();
  const [target] = await db
    .select({ id: users.id, role: users.role })
    .from(users)
    .where(eq(users.id, coachId))
    .limit(1);

  if (!target) {
    return NextResponse.json({ ok: false, error: "Account not found." }, { status: 404 });
  }

  const body = (await req.json().catch(() => ({}))) as { reason?: string };
  const reason = typeof body.reason === "string" ? body.reason.trim().slice(0, MAX_REASON_LENGTH) : null;

  const result = await revokeComplimentaryAccess(coachId, guard.dbUser.id, reason && reason.length > 0 ? reason : null);
  if (!result.ok) {
    return NextResponse.json({ ok: false, error: result.error }, { status: 409 });
  }
  return NextResponse.json({ ok: true });
}
