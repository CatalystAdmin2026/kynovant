import { type NextRequest, NextResponse } from "next/server";
import { requireCoachOrAdmin } from "@/lib/auth/guards";
import {
  checkConversationAccess,
  listMessages,
  markConversationRead,
  resolveDisplayNames,
  sendMessage,
} from "@/lib/db/messaging-service";

export const dynamic = "force-dynamic";

// GET — thread messages. 404s for a conversation this coach doesn't
// own (see checkConversationAccess) — never distinguishes "doesn't
// exist" from "not yours" in the response.
export async function GET(_req: NextRequest, { params }: { params: Promise<{ conversationId: string }> }) {
  const guard = await requireCoachOrAdmin();
  if (!guard.ok) return guard.response;

  const { conversationId } = await params;
  const role = guard.dbUser.role === "admin" ? "admin" : "coach";
  const access = await checkConversationAccess(conversationId, guard.dbUser.id, role);
  if (!access.ok || !access.conversation) {
    return NextResponse.json({ ok: false, error: "Not found" }, { status: 404 });
  }

  try {
    const isAdmin = guard.dbUser.role === "admin";
    const [thread, names] = await Promise.all([
      listMessages(conversationId, guard.dbUser.id),
      resolveDisplayNames([access.conversation.coachId, access.conversation.clientId]),
    ]);
    return NextResponse.json({
      ok: true,
      conversation: {
        id: access.conversation.id,
        coachId: access.conversation.coachId,
        clientId: access.conversation.clientId,
        counterpartName: isAdmin
          ? `${names.get(access.conversation.coachId) ?? "Coach"} ↔ ${names.get(access.conversation.clientId) ?? "Client"}`
          : names.get(access.conversation.clientId) ?? "Client",
      },
      messages: thread,
    });
  } catch (err) {
    return NextResponse.json(
      { ok: false, error: err instanceof Error ? err.message : "Failed to load thread" },
      { status: 500 },
    );
  }
}

// POST — send a message into this conversation.
export async function POST(req: NextRequest, { params }: { params: Promise<{ conversationId: string }> }) {
  const guard = await requireCoachOrAdmin();
  if (!guard.ok) return guard.response;

  const { conversationId } = await params;

  if (guard.dbUser.role === "admin") {
    return NextResponse.json({ ok: false, error: "Admin cannot send as a conversation participant" }, { status: 403 });
  }

  const access = await checkConversationAccess(conversationId, guard.dbUser.id, "coach");
  if (!access.ok) {
    return NextResponse.json({ ok: false, error: "Not found" }, { status: 404 });
  }

  let body: { body?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid request body" }, { status: 400 });
  }

  const result = await sendMessage(conversationId, guard.dbUser.id, body.body ?? "");
  if (!result.ok) {
    const status = result.error === "empty" ? 400 : 404;
    return NextResponse.json({ ok: false, error: result.error }, { status });
  }
  return NextResponse.json({ ok: true, message: result.message });
}

// PATCH — mark the thread read (every message not sent by this coach).
export async function PATCH(_req: NextRequest, { params }: { params: Promise<{ conversationId: string }> }) {
  const guard = await requireCoachOrAdmin();
  if (!guard.ok) return guard.response;

  const { conversationId } = await params;
  const role = guard.dbUser.role === "admin" ? "admin" : "coach";
  const access = await checkConversationAccess(conversationId, guard.dbUser.id, role);
  if (!access.ok) {
    return NextResponse.json({ ok: false, error: "Not found" }, { status: 404 });
  }

  const updated = await markConversationRead(conversationId, guard.dbUser.id);
  return NextResponse.json({ ok: true, updated });
}
