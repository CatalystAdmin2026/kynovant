import { NextResponse } from "next/server";
import {
  listWorkoutTemplatesWithSummary,
  createWorkoutTemplate,
} from "@/lib/db/workout-template-service";
import type { ExperienceLevel } from "@/lib/db/schema";
import { requireCoachOrAdmin } from "@/lib/auth/guards";

export const dynamic = "force-dynamic";

export async function GET() {
  const guard = await requireCoachOrAdmin();
  if (!guard.ok) return guard.response;
  try {
    const templates = await listWorkoutTemplatesWithSummary();
    return NextResponse.json({ ok: true, templates });
  } catch (err) {
    return NextResponse.json(
      { ok: false, error: err instanceof Error ? err.message : "Failed to list templates" },
      { status: 500 },
    );
  }
}

export async function POST(req: Request) {
  const guard = await requireCoachOrAdmin();
  if (!guard.ok) return guard.response;
  try {
    const body = await req.json() as {
      name?: string;
      slug?: string;
      description?: string;
      primaryFocus?: string;
      recommendedExperienceLevel?: string;
      estimatedDurationMinutes?: number;
      objective?: string;
      coachingMethodology?: string;
      defaultSetStyle?: string;
      minimumDaysPerWeek?: number;
      maximumDaysPerWeek?: number;
    };

    if (!body.name?.trim()) {
      return NextResponse.json({ ok: false, error: "name is required" }, { status: 400 });
    }
    if (!body.recommendedExperienceLevel) {
      return NextResponse.json(
        { ok: false, error: "recommendedExperienceLevel is required" },
        { status: 400 },
      );
    }

    const template = await createWorkoutTemplate({
      name: body.name.trim(),
      slug: body.slug?.trim() || undefined,
      description: body.description ?? null,
      primaryFocus: body.primaryFocus ?? null,
      recommendedExperienceLevel: body.recommendedExperienceLevel as ExperienceLevel,
      estimatedDurationMinutes: body.estimatedDurationMinutes ?? null,
      objective: body.objective ?? null,
      coachingMethodology: body.coachingMethodology ?? null,
      defaultSetStyle: body.defaultSetStyle ?? null,
      minimumDaysPerWeek: body.minimumDaysPerWeek ?? null,
      maximumDaysPerWeek: body.maximumDaysPerWeek ?? null,
    });

    return NextResponse.json({ ok: true, template }, { status: 201 });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Failed to create template";
    const status = msg.includes("unique") || msg.includes("duplicate") ? 409 : 500;
    return NextResponse.json({ ok: false, error: msg }, { status });
  }
}
