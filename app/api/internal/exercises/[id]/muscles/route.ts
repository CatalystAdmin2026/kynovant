import { type NextRequest, NextResponse } from "next/server";
import { getExerciseMuscles } from "@/lib/db/exercise-service";
import { addExerciseMuscle } from "@/lib/db/exercise-admin-service";
import type { MuscleGroup, MuscleRole } from "@/lib/db/schema-exercise";
import { requireCoachOrAdmin, authorizeExerciseMutation, authorizeExerciseView } from "@/lib/auth/guards";

export const dynamic = "force-dynamic";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const guard = await requireCoachOrAdmin();
  if (!guard.ok) return guard.response;
  const { id } = await params;
  const deny = await authorizeExerciseView(guard.dbUser, id);
  if (deny) return deny;
  const muscles = await getExerciseMuscles(id);
  return NextResponse.json({ ok: true, muscles });
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const guard = await requireCoachOrAdmin();
  if (!guard.ok) return guard.response;
  const { id } = await params;
  const deny = await authorizeExerciseMutation(guard.dbUser, id);
  if (deny) return deny;

  try {
    const body = await req.json() as { muscleGroup?: string; role?: string; emphasisPercent?: number };
    if (!body.muscleGroup) return NextResponse.json({ ok: false, error: "muscleGroup is required" }, { status: 400 });
    if (!body.role) return NextResponse.json({ ok: false, error: "role is required" }, { status: 400 });

    const muscle = await addExerciseMuscle(id, {
      muscleGroup: body.muscleGroup as MuscleGroup,
      role: body.role as MuscleRole,
      emphasisPercent: body.emphasisPercent ?? null,
    });
    return NextResponse.json({ ok: true, muscle }, { status: 201 });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Failed";
    const status = msg.includes("unique") || msg.includes("duplicate") ? 409 : 500;
    return NextResponse.json({ ok: false, error: msg }, { status });
  }
}
