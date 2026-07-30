import { type NextRequest, NextResponse } from "next/server";
import { searchExercises } from "@/lib/db/exercise-service";
import type { ExerciseClassification, ExerciseDifficulty, MovementPattern, MuscleGroup } from "@/lib/db/schema-exercise";
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
  const limit = Math.min(parseInt(searchParams.get("limit") ?? "30", 10), 100);

  try {
    const results = await searchExercises(
      {
        name,
        classification: classification ?? undefined,
        difficulty: difficulty ?? undefined,
        movementPattern: movementPattern ?? undefined,
        muscleGroups: muscleGroup ? [muscleGroup] : undefined,
        statuses: ["active"],
        limit,
      },
      guard.dbUser.id,
    );
    return NextResponse.json({ ok: true, exercises: results });
  } catch (err) {
    return NextResponse.json(
      { ok: false, error: err instanceof Error ? err.message : "Search failed" },
      { status: 500 },
    );
  }
}
