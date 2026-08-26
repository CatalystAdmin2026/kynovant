import { type NextRequest, NextResponse } from "next/server";
import {
  saveSetDraft,
  clearSetDraft,
  isValidDraftSeq,
  WorkoutSessionAuthorizationError,
} from "@/lib/db/workout-session-service";
import { requireAuthenticatedUser, authorizeWorkoutSession } from "@/lib/auth/guards";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

// [Workout set draft autosave]
// Sibling endpoint to POST .../sets — deliberately NOT the same route,
// so the two intents (autosave a draft vs. explicitly Log) can never be
// confused at the transport layer: this route can only ever produce a
// status='draft' row (or remove one) via saveSetDraft()/clearSetDraft(),
// and can never mark a set completed or move completionPercent. See
// those functions' own comments in lib/db/workout-session-service.ts
// for the full write contract.
//
// [Independent review remediation — P1#1] `clear: true` is a distinct,
// explicit intent from the client — sent when it has ALREADY determined
// locally that every editable field for this set is blank (see
// WorkoutSession.tsx's handleFieldChange) — rather than the server
// trying to infer "clear" from all-fields-null, which would be
// ambiguous (a legitimate save can naturally have some fields null,
// e.g. a duration-based exercise never sends reps/weight).
//
// Response shape is intentionally 200-with-a-flag rather than a 4xx/5xx
// for the expected-in-normal-operation "not applied" outcomes (`stale`,
// `already-logged`, `session-not-active`, `nothing-to-clear`) — none of
// these are an attack or a caller bug, all are ordinary races (Phases
// 7/10/14 and the P1#1 clear races), and the client's autosave UI
// treats "applied: false" as a silent no-op, never an error. Only
// genuine authorization failures (cross-client, unknown session,
// exercise/set not in this session's frozen snapshot) throw and map to
// 403, matching the sibling route's own convention.
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
      clear?: boolean;
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
    // [Independent review remediation — draftSeq hardening] Rejects
    // non-integer, non-finite, unsafe-integer, and negative values
    // explicitly (NaN, Infinity, fractional, > 2^53-1, negative) —
    // isValidDraftSeq is the SAME check saveSetDraft/clearSetDraft
    // re-assert as their own defense-in-depth backstop, so this is one
    // shared definition of "valid," not two.
    if (body.draftSeq === undefined || !isValidDraftSeq(body.draftSeq)) {
      return NextResponse.json(
        { ok: false, error: "draftSeq must be a non-negative safe integer" },
        { status: 400 },
      );
    }

    const result = body.clear
      ? await clearSetDraft({
          workoutSessionId,
          clientId: guard.authUser.id,
          workoutTemplateExerciseId: body.workoutTemplateExerciseId,
          setNumber: body.setNumber,
          draftSeq: body.draftSeq,
        })
      : await saveSetDraft({
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
