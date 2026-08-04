import { type NextRequest, NextResponse } from "next/server";
import {
  updatePrescription,
  deletePrescription,
  movePrescription,
} from "@/lib/db/workout-template-service";
import type { SetTechnique, SubstitutionPolicy } from "@/lib/db/schema-exercise";
import { requireCoachOrAdmin, authorizeCoachPrescriptionMutation } from "@/lib/auth/guards";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string; prescriptionId: string }> };

export async function PUT(req: NextRequest, { params }: Ctx) {
  const guard = await requireCoachOrAdmin();
  if (!guard.ok) return guard.response;
  const { prescriptionId } = await params;
  const deny = await authorizeCoachPrescriptionMutation(guard.dbUser, prescriptionId);
  if (deny) return deny;
  try {
    const body = await req.json() as {
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
      sectionId?: string | null;
      move?: "up" | "down";
    };

    if (body.move === "up" || body.move === "down") {
      await movePrescription(prescriptionId, body.move);
      return NextResponse.json({ ok: true });
    }

    const prescription = await updatePrescription(prescriptionId, {
      sets: body.sets,
      repsMin: body.repsMin,
      repsMax: body.repsMax,
      durationSeconds: body.durationSeconds,
      distanceMeters: body.distanceMeters,
      restSeconds: body.restSeconds,
      tempo: body.tempo,
      targetRpe: body.targetRpe,
      targetRir: body.targetRir,
      setTechnique: (body.setTechnique as SetTechnique | null | undefined),
      groupId: body.groupId,
      groupPosition: body.groupPosition,
      coachNotes: body.coachNotes,
      isRequired: body.isRequired,
      substitutionPolicy: (body.substitutionPolicy as SubstitutionPolicy | null | undefined),
      sectionId: body.sectionId,
    });

    return NextResponse.json({ ok: true, prescription });
  } catch (err) {
    return NextResponse.json(
      { ok: false, error: err instanceof Error ? err.message : "Failed to update prescription" },
      { status: 500 },
    );
  }
}

export async function DELETE(_req: NextRequest, { params }: Ctx) {
  const guard = await requireCoachOrAdmin();
  if (!guard.ok) return guard.response;
  const { prescriptionId } = await params;
  const deny = await authorizeCoachPrescriptionMutation(guard.dbUser, prescriptionId);
  if (deny) return deny;
  try {
    await deletePrescription(prescriptionId);
    return NextResponse.json({ ok: true });
  } catch (err) {
    return NextResponse.json(
      { ok: false, error: err instanceof Error ? err.message : "Failed to delete prescription" },
      { status: 500 },
    );
  }
}
