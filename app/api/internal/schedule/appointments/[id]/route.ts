import { type NextRequest, NextResponse } from "next/server";
import { requireCoachOrAdmin } from "@/lib/auth/guards";
import {
  deleteCoachAppointment,
  parseAppointmentPatch,
  updateCoachAppointment,
} from "@/lib/db/schedule-service";

export const dynamic = "force-dynamic";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
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
    const { id } = await params;
    const appointment = await updateCoachAppointment(
      guard.dbUser.id,
      id,
      parseAppointmentPatch(body),
    );
    return NextResponse.json({ ok: true, appointment });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to update appointment";
    return NextResponse.json(
      { ok: false, error: message },
      { status: message === "Appointment not found." ? 404 : 400 },
    );
  }
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const guard = await requireCoachOrAdmin();
  if (!guard.ok) return guard.response;

  try {
    const { id } = await params;
    await deleteCoachAppointment(guard.dbUser.id, id);
    return NextResponse.json({ ok: true });
  } catch (err) {
    return NextResponse.json(
      { ok: false, error: err instanceof Error ? err.message : "Failed to delete appointment" },
      { status: 400 },
    );
  }
}
