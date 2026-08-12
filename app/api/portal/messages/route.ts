import { type NextRequest, NextResponse } from "next/server";
import { requireAuthenticatedUser } from "@/lib/auth/guards";
import {
  checkConversationAccess,
  getOrCreateConversationForClient,
  listMessages,
  markConversationRead,
  sendMessage,
} from "@/lib/db/messaging-service";

export const dynamic = "force-dynamic";

// GET — the client's single conversation with their coach. Resolves
// (and lazily creates) it via getOrCreateConversationForClient — a
// client is never asked to pick a coach, there is exactly one (the
// most recent coaching_enrollments row, same resolution the rest of
// the portal already uses for "my coach").
//
// Returns ok:true with conversation:null (not an error) when the
// client has no coach assignment at all yet — an honest empty state,
// never a fabricated thread.
export async function GET() {
  const guard = await requireAuthenticatedUser();
  if (!guard.ok) return guard.response;
  if (guard.dbUser.role !== "client") {
    return NextResponse.json({ ok: false, error: "Forbidden" }, { status: 403 });
  }

  const resolved = await getOrCreateConversationForClient(guard.dbUser.id);
  if (!resolved.ok) {
    return NextResponse.json({ ok: true, conversation: null, messages: [] });
  }

  try {
    const thread = await listMessages(resolved.conversationId, guard.dbUser.id);
    return NextResponse.json({
      ok: true,
      conversation: { id: resolved.conversationId, coachId: resolved.coachId, clientId: guard.dbUser.id },
      messages: thread,
    });
  } catch (err) {
    return NextResponse.json(
      { ok: false, error: err instanceof Error ? err.message : "Failed to load thread" },
      { status: 500 },
    );
  }
}

// POST — send a message. Lazily resolves/creates the conversation on
// first send, same as GET.
export async function POST(req: NextRequest) {
  const guard = await requireAuthenticatedUser();
  if (!guard.ok) return guard.response;
  if (guard.dbUser.role !== "client") {
    return NextResponse.json({ ok: false, error: "Forbidden" }, { status: 403 });
  }

  const resolved = await getOrCreateConversationForClient(guard.dbUser.id);
  if (!resolved.ok) {
    return NextResponse.json({ ok: false, error: "No coach assigned yet" }, { status: 409 });
  }

  let body: { body?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid request body" }, { status: 400 });
  }

  const result = await sendMessage(resolved.conversationId, guard.dbUser.id, body.body ?? "");
  if (!result.ok) {
    const status = result.error === "empty" ? 400 : 404;
    return NextResponse.json({ ok: false, error: result.error }, { status });
  }
  return NextResponse.json({ ok: true, message: result.message });
}

// PATCH — mark the thread read (every message not sent by this client).
export async function PATCH(req: NextRequest) {
  const guard = await requireAuthenticatedUser();
  if (!guard.ok) return guard.response;
  if (guard.dbUser.role !== "client") {
    return NextResponse.json({ ok: false, error: "Forbidden" }, { status: 403 });
  }

  let body: { conversationId?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid request body" }, { status: 400 });
  }
  if (!body.conversationId) {
    return NextResponse.json({ ok: false, error: "conversationId is required" }, { status: 400 });
  }

  const access = await checkConversationAccess(body.conversationId, guard.dbUser.id, "client");
  if (!access.ok) {
    return NextResponse.json({ ok: false, error: "Not found" }, { status: 404 });
  }

  const updated = await markConversationRead(body.conversationId, guard.dbUser.id);
  return NextResponse.json({ ok: true, updated });
}
