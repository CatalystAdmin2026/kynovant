// GET /api/internal/pil/exercise/[exerciseId]/substitutes
//
// Returns substitution candidates for a given exercise.
// Optional query param: ?policy=substitute,regression (comma-separated ExerciseRelationType values)
// Auth: requireCoachOrAdmin.
// Returns SubstitutionResult.

import { NextResponse } from "next/server";
import { requireCoachOrAdmin } from "@/lib/auth/guards";
import { getSubstitutes } from "@/lib/pil/substitution";
import type { ExerciseRelationType } from "@/lib/pil/types";

export const dynamic = "force-dynamic";

const VALID_TYPES = new Set<string>([
  "substitute",
  "regression",
  "progression",
  "variation",
]);

export async function GET(
  req: Request,
  { params }: { params: Promise<{ exerciseId: string }> },
) {
  const guard = await requireCoachOrAdmin();
  if (!guard.ok) return guard.response;

  const { exerciseId } = await params;
  const url = new URL(req.url);
  const policyParam = url.searchParams.get("policy");

  let policy: ExerciseRelationType[] | undefined;
  if (policyParam) {
    const requested = policyParam.split(",").map((s) => s.trim());
    const valid = requested.filter((t) => VALID_TYPES.has(t)) as ExerciseRelationType[];
    if (valid.length > 0) policy = valid;
  }

  try {
    const result = await getSubstitutes(exerciseId, policy);
    return NextResponse.json({ ok: true, result });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Lookup failed";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
