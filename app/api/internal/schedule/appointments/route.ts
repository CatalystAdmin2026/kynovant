import { type NextRequest, NextResponse } from "next/server";
import { requireCoachOrAdmin } from "@/lib/auth/guards";
import {
  createCoachAppointment,
  listCoachAppointments,
  listUpcomingAppointments,
  parseAppointmentInput,
} from "@/lib/db/schedule-service";

export const dynamic = "force-dynamic";

function parseDateParam(value: string | null): Date | null {
  if (!value) return null;
  const date = new Date(value);
  return Number.isFinite(date.getTime()) ? date : null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export async function GET(req: NextRequest) {
  const guard = await requireCoachOrAdmin();
  if (!guard.ok) return guard.response;

  try {
    if (req.nextUrl.searchParams.get("upcoming") === "true") {
      const limit = Number.parseInt(req.nextUrl.searchParams.get("limit") ?? "8", 10);
      const appointments = await listUpcomingAppointments(
        guard.dbUser.id,
        Number.isFinite(limit) ? limit : 8,
      );
      return NextResponse.json({ ok: true, appointments });
    }

    const from = parseDateParam(req.nextUrl.searchParams.get("from"));
    const to = parseDateParam(req.nextUrl.searchParams.get("to"));
    const appointments = await listCoachAppointments(guard.dbUser.id, { from, to });
    return NextResponse.json({ ok: true, appointments });
  } catch (err) {
    return NextResponse.json(
      { ok: false, error: err instanceof Error ? err.message : "Failed to load schedule" },
      { status: 500 },
    );
  }
}

export async function POST(req: NextRequest) {
  const guard = await requireCoachOrAdmin();
  if (!guard.ok) return guard.response;

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid request body" }, { status: 400 });
  }

  if (!isRecord(body)) {
    return NextResponse.json({ ok: false, error: "Invalid request body" }, { status: 400 });
  }

  try {
    const appointment = await createCoachAppointment(
      guard.dbUser.id,
      parseAppointmentInput(body),
    );
    return NextResponse.json({ ok: true, appointment }, { status: 201 });
  } catch (err) {
    return NextResponse.json(
      { ok: false, error: err instanceof Error ? err.message : "Failed to create appointment" },
      { status: 400 },
    );
  }
}
