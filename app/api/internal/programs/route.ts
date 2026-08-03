import { type NextRequest, NextResponse } from "next/server";
import {
  listProgramTemplates,
  listProgramTemplateStats,
  createProgramTemplate,
} from "@/lib/db/program-builder-service";
import type { TemplateCategory, ExperienceLevel } from "@/lib/db/schema";
import { requireCoachOrAdmin, resolveTenantScope } from "@/lib/auth/guards";

export const dynamic = "force-dynamic";

export async function GET() {
  const guard = await requireCoachOrAdmin();
  if (!guard.ok) return guard.response;
  const { coachId } = resolveTenantScope(guard.dbUser);
  try {
    const [templates, stats] = await Promise.all([
      listProgramTemplates(coachId),
      listProgramTemplateStats(),
    ]);
    const statsById = new Map(stats.map((s) => [s.programTemplateId, s]));
    const enriched = templates.map((t) => ({
      ...t,
      activeClientCount: statsById.get(t.id)?.activeClientCount ?? 0,
      completedClientCount: statsById.get(t.id)?.completedClientCount ?? 0,
    }));
    return NextResponse.json({ ok: true, templates: enriched });
  } catch (err) {
    return NextResponse.json(
      { ok: false, error: err instanceof Error ? err.message : "Failed" },
      { status: 500 },
    );
  }
}

export async function POST(req: NextRequest) {
  const guard = await requireCoachOrAdmin();
  if (!guard.ok) return guard.response;
  try {
    const body = await req.json() as {
      name?: string;
      category?: TemplateCategory;
      experienceLevel?: ExperienceLevel;
      description?: string | null;
      recommendedDaysPerWeek?: number | null;
      defaultDurationWeeks?: number | null;
    };

    if (!body.name?.trim()) {
      return NextResponse.json(
        { ok: false, error: "name is required" },
        { status: 400 },
      );
    }
    if (!body.category) {
      return NextResponse.json(
        { ok: false, error: "category is required" },
        { status: 400 },
      );
    }
    if (!body.experienceLevel) {
      return NextResponse.json(
        { ok: false, error: "experienceLevel is required" },
        { status: 400 },
      );
    }

    const template = await createProgramTemplate({
      name: body.name.trim(),
      category: body.category,
      experienceLevel: body.experienceLevel,
      description: body.description,
      recommendedDaysPerWeek: body.recommendedDaysPerWeek,
      defaultDurationWeeks: body.defaultDurationWeeks,
      createdBy: guard.dbUser.id,
    });

    return NextResponse.json({ ok: true, template }, { status: 201 });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Failed";
    if (msg.includes("unique") || msg.includes("duplicate")) {
      return NextResponse.json({ ok: false, error: "Slug already exists" }, { status: 409 });
    }
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }
}
