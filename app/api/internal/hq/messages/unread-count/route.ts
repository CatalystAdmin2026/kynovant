import { NextResponse } from "next/server";
import { requireCoachOrAdmin } from "@/lib/auth/guards";
import { getTotalUnreadCount } from "@/lib/db/messaging-service";

export const dynamic = "force-dynamic";

// GET — lightweight unread count for the HQ top-bar / mobile nav
// badge. Admin has no conversations of their own (oversight-only —
// see messaging-service.ts), so this is always 0 for admin.
export async function GET() {
  const guard = await requireCoachOrAdmin();
  if (!guard.ok) return guard.response;

  if (guard.dbUser.role === "admin") {
    return NextResponse.json({ ok: true, unreadCount: 0 });
  }

  try {
    const unreadCount = await getTotalUnreadCount(guard.dbUser.id, "coach");
    return NextResponse.json({ ok: true, unreadCount });
  } catch (err) {
    return NextResponse.json(
      { ok: false, error: err instanceof Error ? err.message : "Failed to load unread count" },
      { status: 500 },
    );
  }
}
