import { type NextRequest, NextResponse } from "next/server";
import { getExerciseRelations } from "@/lib/db/exercise-service";
import { addExerciseRelation } from "@/lib/db/exercise-admin-service";
import type { ExerciseRelationType, SubstitutionPolicy } from "@/lib/db/schema-exercise";
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
  const relations = await getExerciseRelations(id);
  return NextResponse.json({ ok: true, relations });
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
    const body = await req.json() as {
      targetExerciseId?: string;
      relationType?: string;
      substitutionPolicy?: string;
      suitabilityScore?: number;
      notes?: string;
    };
    if (!body.targetExerciseId) return NextResponse.json({ ok: false, error: "targetExerciseId is required" }, { status: 400 });
    if (!body.relationType) return NextResponse.json({ ok: false, error: "relationType is required" }, { status: 400 });

    const relation = await addExerciseRelation(id, {
      targetExerciseId: body.targetExerciseId,
      relationType: body.relationType as ExerciseRelationType,
      substitutionPolicy: (body.substitutionPolicy as SubstitutionPolicy) ?? null,
      suitabilityScore: body.suitabilityScore ?? null,
      notes: body.notes ?? null,
    });
    return NextResponse.json({ ok: true, relation }, { status: 201 });
  } catch (err) {
    return NextResponse.json({ ok: false, error: err instanceof Error ? err.message : "Failed" }, { status: 500 });
  }
}
