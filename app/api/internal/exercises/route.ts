import { type NextRequest, NextResponse } from "next/server";
import { searchExercises } from "@/lib/db/exercise-service";
import { createExercise } from "@/lib/db/exercise-admin-service";
import type { ExerciseClassification, ExerciseDifficulty, MovementPattern, MuscleGroup, ExerciseScope } from "@/lib/db/schema-exercise";
import { requireCoachOrAdmin } from "@/lib/auth/guards";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const guard = await requireCoachOrAdmin();
  if (!guard.ok) return guard.response;

  const { searchParams } = req.nextUrl;
  const name = searchParams.get("q") ?? undefined;
  const classification = searchParams.get("classification") as ExerciseClassification | null;
  const difficulty = searchParams.get("difficulty") as ExerciseDifficulty | null;
  const movementPattern = searchParams.get("movementPattern") as MovementPattern | null;
  const muscleGroup = searchParams.get("muscleGroup") as MuscleGroup | null;
  const primaryMuscleGroup = searchParams.get("primaryMuscleGroup") as MuscleGroup | null;
  const scope = searchParams.get("scope") as ExerciseScope | null;
  const favoritesOnly = searchParams.get("favoritesOnly") === "true";
  const status = searchParams.get("status") ?? "active";
  const limit = Math.min(parseInt(searchParams.get("limit") ?? "50", 10), 200);

  try {
    const results = await searchExercises(
      {
        name,
        classification: classification ?? undefined,
        difficulty: difficulty ?? undefined,
        movementPattern: movementPattern ?? undefined,
        muscleGroups: muscleGroup ? [muscleGroup] : undefined,
        primaryMuscleGroup: primaryMuscleGroup ?? undefined,
        scope: scope ?? undefined,
        favoritesOf: favoritesOnly ? guard.dbUser.id : undefined,
        statuses: [status],
        limit,
      },
      guard.dbUser.id,
    );
    return NextResponse.json({ ok: true, exercises: results });
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
    const body = await req.json() as Record<string, unknown>;
    const { name, movementPattern, classification, difficulty, resistanceType, slug } = body as {
      name?: string;
      movementPattern?: string;
      classification?: string;
      difficulty?: string;
      resistanceType?: string;
      slug?: string;
    };

    if (!name?.trim()) return NextResponse.json({ ok: false, error: "name is required" }, { status: 400 });
    if (!movementPattern) return NextResponse.json({ ok: false, error: "movementPattern is required" }, { status: 400 });
    if (!classification) return NextResponse.json({ ok: false, error: "classification is required" }, { status: 400 });
    if (!difficulty) return NextResponse.json({ ok: false, error: "difficulty is required" }, { status: 400 });

    const exercise = await createExercise({
      name: name.trim(),
      movementPattern: movementPattern as MovementPattern,
      classification: classification as ExerciseClassification,
      difficulty: difficulty as ExerciseDifficulty,
      resistanceType: resistanceType as (typeof import("@/lib/db/schema-exercise").resistanceTypeEnum.enumValues)[number] | undefined,
      slug: slug?.trim() ?? undefined,
      createdBy: guard.dbUser.id,
      alternateNames: [],
    });

    return NextResponse.json({ ok: true, exercise }, { status: 201 });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Failed to create exercise";
    const status = msg.includes("unique") || msg.includes("duplicate") ? 409 : 500;
    return NextResponse.json({ ok: false, error: msg }, { status });
  }
}
