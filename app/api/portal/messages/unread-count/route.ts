import { NextResponse } from "next/server";
import { requireAuthenticatedUser } from "@/lib/auth/guards";
import { getTotalUnreadCount } from "@/lib/db/messaging-service";

export const dynamic = "force-dynamic";

// GET — lightweight unread count for the portal nav badge. Kept
// separate from GET /api/portal/messages so every portal page can
// poll this cheaply without loading the full thread each time.
export async function GET() {
  const guard = await requireAuthenticatedUser();
  if (!guard.ok) return guard.response;
  if (guard.dbUser.role !== "client") {
    return NextResponse.json({ ok: false, error: "Forbidden" }, { status: 403 });
  }

  try {
    const unreadCount = await getTotalUnreadCount(guard.dbUser.id, "client");
    return NextResponse.json({ ok: true, unreadCount });
  } catch (err) {
    return NextResponse.json(
      { ok: false, error: err instanceof Error ? err.message : "Failed to load unread count" },
      { status: 500 },
    );
  }
}
