import { type NextRequest, NextResponse } from "next/server";
import { addPrescription } from "@/lib/db/workout-template-service";
import type { SetTechnique, SubstitutionPolicy } from "@/lib/db/schema-exercise";
import { requireCoachOrAdmin, authorizeCoachWorkoutTemplateMutation } from "@/lib/auth/guards";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

export async function POST(req: NextRequest, { params }: Ctx) {
  const guard = await requireCoachOrAdmin();
  if (!guard.ok) return guard.response;
  const { id: templateId } = await params;
  const deny = await authorizeCoachWorkoutTemplateMutation(guard.dbUser, templateId);
  if (deny) return deny;
  try {
    const body = await req.json() as {
      exerciseId?: string;
      sectionId?: string | null;
      sets?: number | null;
      repsMin?: number | null;
      repsMax?: number | null;
      durationSeconds?: number | null;
      distanceMeters?: string | null;
      restSeconds?: number | null;
      tempo?: string | null;
      targetRpe?: string | null;
      targetRir?: string | null;
      setTechnique?: string | null;
      groupId?: string | null;
      groupPosition?: number | null;
      coachNotes?: string | null;
      isRequired?: boolean;
      substitutionPolicy?: string | null;
    };

    if (!body.exerciseId) {
      return NextResponse.json({ ok: false, error: "exerciseId is required" }, { status: 400 });
    }

    const prescription = await addPrescription(templateId, {
      exerciseId: body.exerciseId,
      sectionId: body.sectionId ?? null,
      sets: body.sets ?? null,
      repsMin: body.repsMin ?? null,
      repsMax: body.repsMax ?? null,
      durationSeconds: body.durationSeconds ?? null,
      distanceMeters: body.distanceMeters ?? null,
      restSeconds: body.restSeconds ?? null,
      tempo: body.tempo ?? null,
      targetRpe: body.targetRpe ?? null,
      targetRir: body.targetRir ?? null,
      setTechnique: (body.setTechnique as SetTechnique | null) ?? null,
      groupId: body.groupId ?? null,
      groupPosition: body.groupPosition ?? null,
      coachNotes: body.coachNotes ?? null,
      isRequired: body.isRequired ?? true,
      substitutionPolicy: (body.substitutionPolicy as SubstitutionPolicy | null) ?? null,
    });

    return NextResponse.json({ ok: true, prescription }, { status: 201 });
  } catch (err) {
    return NextResponse.json(
      { ok: false, error: err instanceof Error ? err.message : "Failed to add prescription" },
      { status: 500 },
    );
  }
}
