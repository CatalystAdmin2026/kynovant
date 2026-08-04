import { type NextRequest, NextResponse } from "next/server";
import {
  getBlueprintContent,
  updateWorkoutTemplate,
  deleteWorkoutTemplate,
} from "@/lib/db/workout-template-service";
import type { ExperienceLevel, TemplateStatus } from "@/lib/db/schema";
import {
  requireCoachOrAdmin,
  authorizeCoachWorkoutTemplateView,
  authorizeCoachWorkoutTemplateMutation,
} from "@/lib/auth/guards";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

export async function GET(_req: NextRequest, { params }: Ctx) {
  const guard = await requireCoachOrAdmin();
  if (!guard.ok) return guard.response;
  const { id } = await params;
  const deny = await authorizeCoachWorkoutTemplateView(guard.dbUser, id);
  if (deny) return deny;
  try {
    const content = await getBlueprintContent(id);
    if (!content) {
      return NextResponse.json({ ok: false, error: "Not found" }, { status: 404 });
    }
    return NextResponse.json({ ok: true, ...content });
  } catch (err) {
    return NextResponse.json(
      { ok: false, error: err instanceof Error ? err.message : "Failed to load template" },
      { status: 500 },
    );
  }
}

// Also the publish/unpublish entry point for blueprints — status is a
// plain field on this same update, guarded the same as every other
// mutation (owner or admin only, regardless of the template's current
// published state).
export async function PUT(req: NextRequest, { params }: Ctx) {
  const guard = await requireCoachOrAdmin();
  if (!guard.ok) return guard.response;
  const { id } = await params;
  const deny = await authorizeCoachWorkoutTemplateMutation(guard.dbUser, id);
  if (deny) return deny;
  try {
    const body = await req.json() as {
      name?: string;
      slug?: string;
      description?: string | null;
      primaryFocus?: string | null;
      recommendedExperienceLevel?: string;
      estimatedDurationMinutes?: number | null;
      status?: string;
      objective?: string | null;
      coachingMethodology?: string | null;
      defaultSetStyle?: string | null;
      minimumDaysPerWeek?: number | null;
      maximumDaysPerWeek?: number | null;
    };

    const template = await updateWorkoutTemplate(id, {
      name: body.name,
      slug: body.slug,
      description: body.description,
      primaryFocus: body.primaryFocus,
      recommendedExperienceLevel: body.recommendedExperienceLevel as ExperienceLevel | undefined,
      estimatedDurationMinutes: body.estimatedDurationMinutes,
      status: body.status as TemplateStatus | undefined,
      objective: body.objective,
      coachingMethodology: body.coachingMethodology,
      defaultSetStyle: body.defaultSetStyle,
      minimumDaysPerWeek: body.minimumDaysPerWeek,
      maximumDaysPerWeek: body.maximumDaysPerWeek,
    });

    return NextResponse.json({ ok: true, template });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Failed to update template";
    const status = msg.includes("unique") || msg.includes("duplicate") ? 409 : 500;
    return NextResponse.json({ ok: false, error: msg }, { status });
  }
}

export async function DELETE(_req: NextRequest, { params }: Ctx) {
  const guard = await requireCoachOrAdmin();
  if (!guard.ok) return guard.response;
  const { id } = await params;
  const deny = await authorizeCoachWorkoutTemplateMutation(guard.dbUser, id);
  if (deny) return deny;
  try {
    await deleteWorkoutTemplate(id);
    return NextResponse.json({ ok: true });
  } catch (err) {
    return NextResponse.json(
      { ok: false, error: err instanceof Error ? err.message : "Failed to delete template" },
      { status: 500 },
    );
  }
}
