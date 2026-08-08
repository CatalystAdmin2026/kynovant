import { type NextRequest, NextResponse } from "next/server";
import { requireCoachOrAdmin } from "@/lib/auth/guards";
import {
  listCoachNotifications,
  markAllCoachNotificationsRead,
  markCoachNotificationsRead,
} from "@/lib/db/coach-notification-service";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const guard = await requireCoachOrAdmin();
  if (!guard.ok) return guard.response;

  const limit = Number.parseInt(req.nextUrl.searchParams.get("limit") ?? "20", 10);

  try {
    const result = await listCoachNotifications(guard.dbUser.id, Number.isFinite(limit) ? limit : 20);
    return NextResponse.json({ ok: true, ...result });
  } catch (err) {
    return NextResponse.json(
      { ok: false, error: err instanceof Error ? err.message : "Failed to load notifications" },
      { status: 500 },
    );
  }
}

export async function PATCH(req: NextRequest) {
  const guard = await requireCoachOrAdmin();
  if (!guard.ok) return guard.response;

  let body: { ids?: string[]; all?: boolean };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid request body" }, { status: 400 });
  }

  try {
    const updated = body.all
      ? await markAllCoachNotificationsRead(guard.dbUser.id)
      : await markCoachNotificationsRead(guard.dbUser.id, Array.isArray(body.ids) ? body.ids : []);
    return NextResponse.json({ ok: true, updated });
  } catch (err) {
    return NextResponse.json(
      { ok: false, error: err instanceof Error ? err.message : "Failed to update notifications" },
      { status: 500 },
    );
  }
}
