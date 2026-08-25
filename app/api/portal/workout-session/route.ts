import { type NextRequest, NextResponse } from "next/server";
import { createWorkoutSession, WorkoutSessionAuthorizationError } from "@/lib/db/workout-session-service";
import { requireAuthenticatedUser } from "@/lib/auth/guards";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  const guard = await requireAuthenticatedUser();
  if (!guard.ok) return guard.response;

  try {
    const body = await req.json() as {
      clientProgramId?: string | null;
      workoutTemplateId?: string;
      programWeekNumber?: number | null;
      programDayOfWeek?: number | null;
      scheduledDate?: string | null;
    };

    if (!body.workoutTemplateId) {
      return NextResponse.json(
        { ok: false, error: "workoutTemplateId is required" },
        { status: 400 },
      );
    }

    const session = await createWorkoutSession({
      clientId: guard.authUser.id,
      clientProgramId: body.clientProgramId ?? null,
      workoutTemplateId: body.workoutTemplateId,
      programWeekNumber: body.programWeekNumber,
      programDayOfWeek: body.programDayOfWeek,
      scheduledDate: body.scheduledDate,
    });

    return NextResponse.json({ ok: true, session }, { status: 201 });
  } catch (err) {
    // [Independent review remediation — P2 start-session authorization]
    // A rejected request (claimed workoutTemplateId doesn't match this
    // client's own authoritative schedule), not a server fault —
    // mapped to 403 rather than the generic 500 every other thrown
    // error here still gets.
    if (err instanceof WorkoutSessionAuthorizationError) {
      return NextResponse.json({ ok: false, error: err.message }, { status: 403 });
    }
    return NextResponse.json(
      { ok: false, error: err instanceof Error ? err.message : "Failed" },
      { status: 500 },
    );
  }
}
