// ─────────────────────────────────────────────────────────────
// Catalyst OS — Workout Blueprint Validation Service
//
// SERVER-ONLY — never import from a Client Component.
// validateWorkoutTemplate orchestrates PIL enrichment (M00) and
// prescription validity (M01), then adds template-level checks
// not covered by those modules (section order, days-per-week bounds,
// group technique consistency).
//
// External API is unchanged. Callers receive string[] errors/warnings
// for backwards compatibility with existing UI and service consumers.
// ─────────────────────────────────────────────────────────────

import "server-only";
import { eq } from "drizzle-orm";
import { getDb } from "./client";
import { workoutTemplates } from "./schema";
import { getBlueprintEnriched } from "@/lib/pil/enrichment";
import { validatePrescriptions } from "@/lib/pil/modules/validity";
import type { EnrichedBlueprint, EnrichedSection, EnrichedPrescription, PilFinding } from "@/lib/pil/types";

// ─────────────────────────────────────────────────────────────
// TYPES
// ─────────────────────────────────────────────────────────────

export interface ValidationResult {
  valid: boolean;
  errors: string[];
  warnings: string[];
  summary: {
    templateId: string;
    templateName: string;
    sectionCount: number;
    exerciseCount: number;
    groupCount: number;
    estimatedMinutes: number | null;
  };
}

// ─────────────────────────────────────────────────────────────
// TEMPLATE-LEVEL CHECKS (not covered by M01)
// ─────────────────────────────────────────────────────────────

function checkSectionDuplicateOrder(sections: EnrichedSection[]): string[] {
  const seen = new Set<number>();
  const errors: string[] = [];
  for (const s of sections) {
    if (seen.has(s.orderIndex)) {
      errors.push(`Duplicate section orderIndex ${s.orderIndex} in template.`);
    }
    seen.add(s.orderIndex);
  }
  return errors;
}

function checkGroupMixedTechniques(prescriptions: EnrichedPrescription[]): string[] {
  const groupMap = new Map<string, EnrichedPrescription[]>();
  for (const p of prescriptions) {
    if (p.groupId) {
      const members = groupMap.get(p.groupId) ?? [];
      members.push(p);
      groupMap.set(p.groupId, members);
    }
  }
  const warnings: string[] = [];
  for (const [groupId, members] of groupMap) {
    const techniques = new Set(members.map((m) => m.setTechnique));
    if (techniques.size > 1) {
      warnings.push(
        `Group ${groupId} mixes set techniques: ${[...techniques].join(", ")}. Use a consistent technique within a group.`,
      );
    }
  }
  return warnings;
}

async function checkDaysPerWeek(templateId: string): Promise<string | null> {
  const db = getDb();
  const rows = await db
    .select({
      minimumDaysPerWeek: workoutTemplates.minimumDaysPerWeek,
      maximumDaysPerWeek: workoutTemplates.maximumDaysPerWeek,
    })
    .from(workoutTemplates)
    .where(eq(workoutTemplates.id, templateId))
    .limit(1);

  const row = rows[0];
  if (!row) return null;
  if (
    row.minimumDaysPerWeek !== null &&
    row.maximumDaysPerWeek !== null &&
    row.minimumDaysPerWeek > row.maximumDaysPerWeek
  ) {
    return `minimumDaysPerWeek (${row.minimumDaysPerWeek}) exceeds maximumDaysPerWeek (${row.maximumDaysPerWeek}).`;
  }
  return null;
}

function findingToString(f: PilFinding): string {
  return f.explanation;
}

function computeGroupCount(prescriptions: EnrichedPrescription[]): number {
  return new Set(
    prescriptions.filter((p) => p.groupId !== null).map((p) => p.groupId as string),
  ).size;
}

function computeEstimatedMinutes(sections: EnrichedSection[]): number | null {
  const total = sections.reduce((sum, s) => sum + (s.estimatedMinutes ?? 0), 0);
  return total > 0 ? total : null;
}

// ─────────────────────────────────────────────────────────────
// VALIDATOR
// ─────────────────────────────────────────────────────────────

export async function validateWorkoutTemplate(
  templateId: string,
): Promise<ValidationResult> {
  // ── 1. Enrich — M00 ──────────────────────────────────────
  let blueprint: EnrichedBlueprint;
  try {
    blueprint = await getBlueprintEnriched(templateId);
  } catch {
    return {
      valid: false,
      errors: [`Template not found: ${templateId}`],
      warnings: [],
      summary: {
        templateId,
        templateName: "(unknown)",
        sectionCount: 0,
        exerciseCount: 0,
        groupCount: 0,
        estimatedMinutes: null,
      },
    };
  }

  // ── 2. Prescription validity — M01 ───────────────────────
  const pilResult = validatePrescriptions(blueprint);
  const errors: string[] = pilResult.errors.map(findingToString);
  const warnings: string[] = pilResult.warnings.map(findingToString);

  // ── 3. Template-level checks ─────────────────────────────
  const [daysError, sectionOrderErrors] = await Promise.all([
    checkDaysPerWeek(templateId),
    Promise.resolve(checkSectionDuplicateOrder(blueprint.sections)),
  ]);

  if (daysError) errors.push(daysError);
  errors.push(...sectionOrderErrors);

  const groupTechWarnings = checkGroupMixedTechniques(blueprint.prescriptions);
  warnings.push(...groupTechWarnings);

  if (blueprint.sections.length === 0 && blueprint.prescriptions.length > 0) {
    warnings.push(
      "Template has exercises but no sections. Consider organizing exercises into sections (warmup, main lift, etc.) before publishing.",
    );
  }

  // ── 4. Summary ────────────────────────────────────────────
  return {
    valid: errors.length === 0,
    errors,
    warnings,
    summary: {
      templateId,
      templateName: blueprint.name,
      sectionCount: blueprint.sections.length,
      exerciseCount: blueprint.prescriptions.length,
      groupCount: computeGroupCount(blueprint.prescriptions),
      estimatedMinutes: computeEstimatedMinutes(blueprint.sections),
    },
  };
}
