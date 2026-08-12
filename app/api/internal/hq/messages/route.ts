import { type NextRequest, NextResponse } from "next/server";
import { requireCoachOrAdmin } from "@/lib/auth/guards";
import {
  getOrCreateConversationForCoach,
  getTotalUnreadCount,
  listConversationsForCoach,
} from "@/lib/db/messaging-service";

export const dynamic = "force-dynamic";

// GET — conversation list for the signed-in coach (admin: every
// conversation, unscoped — see listConversationsForCoach's doc comment).
export async function GET() {
  const guard = await requireCoachOrAdmin();
  if (!guard.ok) return guard.response;

  try {
    const coachId = guard.dbUser.role === "admin" ? null : guard.dbUser.id;
    const [conversations, unreadCount] = await Promise.all([
      listConversationsForCoach(coachId),
      guard.dbUser.role === "admin" ? Promise.resolve(0) : getTotalUnreadCount(guard.dbUser.id, "coach"),
    ]);
    return NextResponse.json({ ok: true, conversations, unreadCount });
  } catch (err) {
    return NextResponse.json(
      { ok: false, error: err instanceof Error ? err.message : "Failed to load conversations" },
      { status: 500 },
    );
  }
}

// POST — start (or resolve) a conversation with one of this coach's
// own clients. 404s (not 403) when the coach doesn't own the client —
// matches the "Not found" posture used everywhere else in guards.ts.
export async function POST(req: NextRequest) {
  const guard = await requireCoachOrAdmin();
  if (!guard.ok) return guard.response;

  if (guard.dbUser.role === "admin") {
    return NextResponse.json(
      { ok: false, error: "Admin cannot start a coach↔client conversation" },
      { status: 403 },
    );
  }

  let body: { clientId?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid request body" }, { status: 400 });
  }

  if (!body.clientId) {
    return NextResponse.json({ ok: false, error: "clientId is required" }, { status: 400 });
  }

  const result = await getOrCreateConversationForCoach(guard.dbUser.id, body.clientId);
  if (!result.ok) {
    return NextResponse.json({ ok: false, error: "Not found" }, { status: 404 });
  }
  return NextResponse.json({ ok: true, conversationId: result.conversationId });
}
