// ─────────────────────────────────────────────────────────────
// Kynovant — AI-Assisted Program Generator: Client Context
//
// SERVER-ONLY. Pulls the same client-profile bundle the rest of HQ
// already reads (lib/db/profile-service.ts) into a compact summary for
// prompt construction. Read-only — never writes back to profile tables.
//
// Per docs/ai-program-generator-ux-spec.md §5.1: "If client profile is
// incomplete, show an honest readiness note" rather than blocking
// generation — missing fields simply aren't included in the summary,
// and the generator is instructed to make reasonable, generic choices
// where context is absent (see prompt.ts).
// ─────────────────────────────────────────────────────────────

import "server-only";
import { getClientProfileBundle } from "@/lib/db/profile-service";

export interface ClientContextSummary {
  clientId: string;
  fullName: string | null;
  preferredName: string | null;
  activeGoals: { goalType: string; description: string | null }[];
  trainingDaysAvailable: number | null;
  equipmentNotes: string | null;
  activeLimitations: string[];
  isIncomplete: boolean;
}

export async function buildClientContextSummary(
  clientId: string,
  clientDisplayName: string | null,
): Promise<ClientContextSummary> {
  const bundle = await getClientProfileBundle(clientId);

  const activeInjuries =
    bundle.healthProfile != null || bundle.activeGoals.length > 0
      ? []
      : [];

  const activeLimitations: string[] = [];
  // Health profile / injury data intentionally NOT pulled from
  // structured injury tables here — the MVP passes coach-entered
  // freeform brief.limitations to the generator (locked to what the
  // coach explicitly typed for this generation, per AI_PRINCIPLES.md
  // §8 "never guess when data is absent"). Structured limitation-to-
  // contraindication mapping is explicitly Post-launch per the UX
  // spec §6.1.F.
  void activeInjuries;

  const isIncomplete =
    bundle.trainingProfile == null &&
    bundle.activeGoals.length === 0 &&
    bundle.equipment.length === 0;

  return {
    clientId,
    fullName: clientDisplayName,
    preferredName: null,
    activeGoals: bundle.activeGoals.map((g) => ({
      goalType: g.goalType,
      description: g.description,
    })),
    trainingDaysAvailable: bundle.trainingProfile?.availableDaysPerWeek ?? null,
    equipmentNotes:
      bundle.equipment.length > 0
        ? bundle.equipment.map((e) => e.equipmentName).join(", ")
        : null,
    activeLimitations,
    isIncomplete,
  };
}
