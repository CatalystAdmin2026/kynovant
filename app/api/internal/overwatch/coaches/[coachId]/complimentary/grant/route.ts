import { type NextRequest, NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { getDb } from "@/lib/db/client";
import { users } from "@/lib/db/schema";
import { requireOverwatchAdmin } from "@/lib/auth/guards";
import { grantComplimentaryAccess } from "@/lib/db/coach-complimentary-access-service";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ coachId: string }> };

const MAX_REASON_LENGTH = 500;

// POST /api/internal/overwatch/coaches/[coachId]/complimentary/grant
//
// Admin-only (requireOverwatchAdmin — the same "authenticated,
// status='active', role='admin'" gate the rest of Overwatch's founder
// actions use, e.g. invite-coach). The target coachId comes ONLY from
// the URL path, resolved server-side against a real users row below —
// never trusted from the request body. grantedBy is ALWAYS
// guard.dbUser.id, the session-derived admin identity — the request
// body carries no admin/grantedBy/role field of any kind for a caller
// to even attempt to supply.
//
// Body: { reason?: string; expiresAt?: string (ISO date) | null }
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
  if (target.role !== "coach") {
    return NextResponse.json(
      { ok: false, error: `This account has role '${target.role}', not 'coach'. Refusing to grant complimentary access.` },
      { status: 400 },
    );
  }

  const body = (await req.json().catch(() => ({}))) as { reason?: string; expiresAt?: string | null };
  const reason = typeof body.reason === "string" ? body.reason.trim().slice(0, MAX_REASON_LENGTH) : null;

  let expiresAt: Date | null = null;
  if (body.expiresAt) {
    const parsed = new Date(body.expiresAt);
    if (Number.isNaN(parsed.getTime())) {
      return NextResponse.json({ ok: false, error: "Invalid expiration date." }, { status: 400 });
    }
    if (parsed.getTime() <= Date.now()) {
      return NextResponse.json({ ok: false, error: "Expiration date must be in the future." }, { status: 400 });
    }
    expiresAt = parsed;
  }

  try {
    await grantComplimentaryAccess({
      coachId,
      grantedBy: guard.dbUser.id,
      reason: reason && reason.length > 0 ? reason : null,
      expiresAt,
    });
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("[Overwatch] grantComplimentaryAccess failed:", err instanceof Error ? err.message : err);
    return NextResponse.json({ ok: false, error: "Couldn't grant complimentary access. Please try again." }, { status: 500 });
  }
}
