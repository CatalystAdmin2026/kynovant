import { type NextRequest, NextResponse } from "next/server";
import {
  getProgramContent,
  updateProgramTemplate,
  deleteProgramTemplate,
  publishProgramWithDependencies,
} from "@/lib/db/program-builder-service";
import {
  requireCoachOrAdmin,
  authorizeCoachProgramView,
  authorizeCoachProgramMutation,
} from "@/lib/auth/guards";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

export async function GET(_req: NextRequest, { params }: Ctx) {
  const guard = await requireCoachOrAdmin();
  if (!guard.ok) return guard.response;
  const { id } = await params;
  const deny = await authorizeCoachProgramView(guard.dbUser, id);
  if (deny) return deny;
  try {
    const content = await getProgramContent(id);
    if (!content) {
      return NextResponse.json({ ok: false, error: "Not found" }, { status: 404 });
    }
    return NextResponse.json({ ok: true, ...content });
  } catch (err) {
    return NextResponse.json(
      { ok: false, error: err instanceof Error ? err.message : "Failed" },
      { status: 500 },
    );
  }
}

export async function PUT(req: NextRequest, { params }: Ctx) {
  const guard = await requireCoachOrAdmin();
  if (!guard.ok) return guard.response;
  const { id } = await params;
  const deny = await authorizeCoachProgramMutation(guard.dbUser, id);
  if (deny) return deny;
  try {
    const body = await req.json() as {
      publish?: boolean;
      name?: string;
      description?: string | null;
      category?: string;
      experienceLevel?: string;
      recommendedDaysPerWeek?: number | null;
      defaultDurationWeeks?: number | null;
      status?: string;
    };

    if (body.publish) {
      // [Program publish auto-dependency workflow] Auto-publishes the
      // exact draft blueprints this program references (and only
      // those), then publishes the program — one coach action instead
      // of a separate manual "publish every blueprint first" chore.
      // See publishProgramWithDependencies()'s own header comment for
      // the full contract (tenant isolation, atomicity, idempotency).
      const result = await publishProgramWithDependencies(id);
      if (!result.ok) {
        return NextResponse.json(
          { ok: false, errors: result.errors },
          { status: 422 },
        );
      }
      return NextResponse.json({
        ok: true,
        template: result.template,
        autoPublishedBlueprintIds: result.autoPublishedBlueprintIds ?? [],
      });
    }

    const template = await updateProgramTemplate(id, {
      name: body.name,
      description: body.description,
      category: body.category as Parameters<typeof updateProgramTemplate>[1]["category"],
      experienceLevel: body.experienceLevel as Parameters<typeof updateProgramTemplate>[1]["experienceLevel"],
      recommendedDaysPerWeek: body.recommendedDaysPerWeek,
      defaultDurationWeeks: body.defaultDurationWeeks,
      status: body.status,
    });

    return NextResponse.json({ ok: true, template });
  } catch (err) {
    return NextResponse.json(
      { ok: false, error: err instanceof Error ? err.message : "Failed" },
      { status: 500 },
    );
  }
}

export async function DELETE(_req: NextRequest, { params }: Ctx) {
  const guard = await requireCoachOrAdmin();
  if (!guard.ok) return guard.response;
  const { id } = await params;
  const deny = await authorizeCoachProgramMutation(guard.dbUser, id);
  if (deny) return deny;
  try {
    await deleteProgramTemplate(id);
    return NextResponse.json({ ok: true });
  } catch (err) {
    return NextResponse.json(
      { ok: false, error: err instanceof Error ? err.message : "Failed" },
      { status: 500 },
    );
  }
}
