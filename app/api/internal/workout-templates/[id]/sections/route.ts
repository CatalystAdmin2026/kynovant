import { type NextRequest, NextResponse } from "next/server";
import { addSection } from "@/lib/db/workout-template-service";
import type { WorkoutSectionType } from "@/lib/db/schema-exercise";
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
      name?: string;
      sectionType?: string;
      estimatedMinutes?: number | null;
      notes?: string | null;
    };

    if (!body.name?.trim()) {
      return NextResponse.json({ ok: false, error: "name is required" }, { status: 400 });
    }
    if (!body.sectionType) {
      return NextResponse.json({ ok: false, error: "sectionType is required" }, { status: 400 });
    }

    const section = await addSection(templateId, {
      name: body.name.trim(),
      sectionType: body.sectionType as WorkoutSectionType,
      estimatedMinutes: body.estimatedMinutes ?? null,
      notes: body.notes ?? null,
    });

    return NextResponse.json({ ok: true, section }, { status: 201 });
  } catch (err) {
    return NextResponse.json(
      { ok: false, error: err instanceof Error ? err.message : "Failed to add section" },
      { status: 500 },
    );
  }
}
