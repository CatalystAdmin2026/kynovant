// POST /api/internal/pil/blueprint/[templateId]/audit
//
// Runs the full Blueprint audit (M00–M05) for a given Blueprint.
// Auth: requireCoachOrAdmin — coachId from session, not request body.
// Returns BlueprintAuditResult.

import { NextResponse } from "next/server";
import { requireCoachOrAdmin } from "@/lib/auth/guards";
import { getBlueprintAudit } from "@/lib/pil/blueprint-audit";

export const dynamic = "force-dynamic";

export async function POST(
  _req: Request,
  { params }: { params: Promise<{ templateId: string }> },
) {
  const guard = await requireCoachOrAdmin();
  if (!guard.ok) return guard.response;

  const { templateId } = await params;
  const coachId = guard.dbUser.id;

  try {
    const result = await getBlueprintAudit(templateId, coachId);
    return NextResponse.json({ ok: true, result });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Analysis failed";
    const status = message.includes("not found") ? 404 : 500;
    return NextResponse.json({ ok: false, error: message }, { status });
  }
}
