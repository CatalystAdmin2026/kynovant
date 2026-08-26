import { type NextRequest, NextResponse } from "next/server";
import { saveSetDraft, WorkoutSessionAuthorizationError } from "@/lib/db/workout-session-service";
import { requireAuthenticatedUser, authorizeWorkoutSession } from "@/lib/auth/guards";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

// [Workout set draft autosave]
// Sibling endpoint to POST .../sets — deliberately NOT the same route,
// so the two intents (autosave a draft vs. explicitly Log) can never be
// confused at the transport layer: this route can only ever produce a
// status='draft' row via saveSetDraft(), and can never mark a set
// completed or move completionPercent. See saveSetDraft's own comment
// in lib/db/workout-session-service.ts for the full write contract.
//
// Response shape is intentionally 200-with-a-flag rather than a 4xx/5xx
// for the two expected-in-normal-operation "not applied" outcomes
// (`stale`, `session-not-active`) — neither is an attack or a caller
// bug, both are ordinary races (Phases 7/10/14), and the client's
// autosave UI treats "applied: false" as a silent no-op, never an
// error. Only genuine authorization failures (cross-client, unknown
// session, exercise/set not in this session's frozen snapshot) throw
// and map to 403, matching the sibling route's own convention.
export async function POST(req: NextRequest, { params }: Ctx) {
  const guard = await requireAuthenticatedUser();
  if (!guard.ok) return guard.response;

  const { id: workoutSessionId } = await params;
  const authDenied = await authorizeWorkoutSession(workoutSessionId, guard.authUser.id);
  if (authDenied) return authDenied;

  try {
    const body = (await req.json()) as {
      workoutTemplateExerciseId?: string;
      setNumber?: number;
      actualReps?: number | null;
      actualWeightKg?: string | null;
      actualDurationSeconds?: number | null;
      actualRpe?: string | null;
      draftSeq?: number;
    };

    if (!body.workoutTemplateExerciseId) {
      return NextResponse.json(
        { ok: false, error: "workoutTemplateExerciseId is required" },
        { status: 400 },
      );
    }
    if (body.setNumber === undefined || body.setNumber < 1) {
      return NextResponse.json(
        { ok: false, error: "setNumber must be >= 1" },
        { status: 400 },
      );
    }
    if (
      body.draftSeq === undefined ||
      !Number.isFinite(body.draftSeq) ||
      body.draftSeq < 0
    ) {
      return NextResponse.json(
        { ok: false, error: "draftSeq must be a non-negative number" },
        { status: 400 },
      );
    }

    const result = await saveSetDraft({
      workoutSessionId,
      clientId: guard.authUser.id,
      workoutTemplateExerciseId: body.workoutTemplateExerciseId,
      setNumber: body.setNumber,
      actualReps: body.actualReps,
      actualWeightKg: body.actualWeightKg,
      actualDurationSeconds: body.actualDurationSeconds,
      actualRpe: body.actualRpe,
      draftSeq: body.draftSeq,
    });

    return NextResponse.json({ ok: true, ...result }, { status: 200 });
  } catch (err) {
    if (err instanceof WorkoutSessionAuthorizationError) {
      return NextResponse.json({ ok: false, error: err.message }, { status: 403 });
    }
    return NextResponse.json(
      { ok: false, error: err instanceof Error ? err.message : "Failed" },
      { status: 500 },
    );
  }
}
