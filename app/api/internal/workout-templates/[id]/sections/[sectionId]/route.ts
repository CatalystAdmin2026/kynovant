import { type NextRequest, NextResponse } from "next/server";
import {
  updateSection,
  deleteSection,
  moveSection,
} from "@/lib/db/workout-template-service";
import type { WorkoutSectionType } from "@/lib/db/schema-exercise";
import { requireCoachOrAdmin, authorizeCoachWorkoutSectionMutation } from "@/lib/auth/guards";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string; sectionId: string }> };

export async function PUT(req: NextRequest, { params }: Ctx) {
  const guard = await requireCoachOrAdmin();
  if (!guard.ok) return guard.response;
  const { sectionId } = await params;
  const deny = await authorizeCoachWorkoutSectionMutation(guard.dbUser, sectionId);
  if (deny) return deny;
  try {
    const body = await req.json() as {
      name?: string;
      sectionType?: string;
      estimatedMinutes?: number | null;
      notes?: string | null;
      move?: "up" | "down";
    };

    if (body.move === "up" || body.move === "down") {
      await moveSection(sectionId, body.move);
      return NextResponse.json({ ok: true });
    }

    const section = await updateSection(sectionId, {
      name: body.name,
      sectionType: body.sectionType as WorkoutSectionType | undefined,
      estimatedMinutes: body.estimatedMinutes,
      notes: body.notes,
    });
    return NextResponse.json({ ok: true, section });
  } catch (err) {
    return NextResponse.json(
      { ok: false, error: err instanceof Error ? err.message : "Failed to update section" },
      { status: 500 },
    );
  }
}

export async function DELETE(_req: NextRequest, { params }: Ctx) {
  const guard = await requireCoachOrAdmin();
  if (!guard.ok) return guard.response;
  const { sectionId } = await params;
  const deny = await authorizeCoachWorkoutSectionMutation(guard.dbUser, sectionId);
  if (deny) return deny;
  try {
    await deleteSection(sectionId);
    return NextResponse.json({ ok: true });
  } catch (err) {
    return NextResponse.json(
      { ok: false, error: err instanceof Error ? err.message : "Failed to delete section" },
      { status: 500 },
    );
  }
}
