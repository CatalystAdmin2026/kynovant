// ─────────────────────────────────────────────────────────────
// Kynovant — AI-Assisted Program Generator: Approval Transaction
//
// SERVER-ONLY. This is the ONLY place in the codebase permitted to turn
// a program_generation_drafts row into real program_templates/
// workout_templates rows. Server-authoritative: callers pass a
// TenantScope and an approver user id — approval never trusts a
// client-supplied coachId.
//
// Locked rules enforced here:
//   #1 generated drafts are never real Programs/Blueprints before this
//      function runs and succeeds.
//   #2 no autonomous publishing — created assets always default to
//      status="draft" (see createDraftWorkoutTemplate/createDraftProgram
//      below); nothing here ever sets status="active".
//   #3 no autonomous client assignment — this function never touches
//      client_programs/client_program_weeks/client_program_week_days.
//   #7 Kynovant Insights blockers prevent approval — checked before the
//      transaction opens.
//   #8 warnings require coach acknowledgement — checked before the
//      transaction opens, and only counts an acknowledgement that
//      postdates the most recent validation run.
//   #10 coach tenant isolation — getOwnedDraft() is the single ownership
//      gate; admins (scope.coachId === null) may approve any draft.
//   #12 no partial persistence if approval fails — every insert below
//      runs inside one db.transaction(); a thrown error anywhere rolls
//      back everything Postgres has seen so far in this transaction.
//
// Idempotency: re-approving an already-approved draft is a no-op that
// returns the previously-created IDs rather than erroring or creating
// duplicate rows — required by the "duplicate approval is idempotent"
// test scenario, and a natural consequence of treating draft.status
// as the single source of truth for "has this already happened."
// ─────────────────────────────────────────────────────────────

import "server-only";
import { randomUUID } from "crypto";
import { getDb } from "@/lib/db/client";
import { programTemplates, workoutTemplates } from "@/lib/db/schema";
import { workoutTemplateSections, workoutTemplateExercises } from "@/lib/db/schema-exercise";
import { programWeeks, programWeekDays } from "@/lib/db/schema-program";
import { programGenerationDrafts } from "@/lib/db/schema-program-generator";
import { eq } from "drizzle-orm";
import { getOwnedDraft } from "@/lib/db/program-generation-service";
import type { TenantScope } from "@/lib/auth/guards";
import {
  parseGeneratedProgramDraft,
  parseProgramGenerationBrief,
  type GeneratedProgramDraft,
} from "./contracts";
import type { DraftValidationResult } from "./validation";

export type ApprovalErrorCode =
  | "not_found"
  | "forbidden"
  | "not_ready"
  | "has_blockers"
  | "warnings_not_acknowledged"
  | "invalid_draft_content";

export interface ApprovalSuccess {
  ok: true;
  alreadyApproved: boolean;
  programTemplateId: string;
  workoutTemplateIds: string[];
}

export interface ApprovalFailure {
  ok: false;
  errorCode: ApprovalErrorCode;
  errorMessage: string;
}

export type ApprovalOutcome = ApprovalSuccess | ApprovalFailure;

function slugify(value: string): string {
  return (
    value
      .toLowerCase()
      .trim()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "") || "untitled"
  );
}

export async function approveDraft(
  draftId: string,
  scope: TenantScope,
  approverUserId: string,
): Promise<ApprovalOutcome> {
  const access = await getOwnedDraft(draftId, scope);
  if (!access.ok) {
    return {
      ok: false,
      errorCode: access.error === "not_found" ? "not_found" : "forbidden",
      errorMessage:
        access.error === "not_found"
          ? "Draft not found."
          : "You do not have access to this draft.",
    };
  }
  const draft = access.draft;

  // Idempotent: repeated approval calls (double-click, retry after a
  // client-side timeout, etc.) return the existing linkage instead of
  // re-running the transaction or erroring.
  if (draft.status === "approved") {
    return {
      ok: true,
      alreadyApproved: true,
      programTemplateId: draft.createdProgramTemplateId ?? "",
      workoutTemplateIds: Array.isArray(draft.createdWorkoutTemplateIds)
        ? (draft.createdWorkoutTemplateIds as string[])
        : [],
    };
  }

  if (draft.status !== "ready_for_review") {
    return {
      ok: false,
      errorCode: "not_ready",
      errorMessage: `Draft status is "${draft.status}" — only a draft in "ready_for_review" can be approved.`,
    };
  }

  const parsedDraft = parseGeneratedProgramDraft(draft.draftJson);
  if (!parsedDraft.ok) {
    return { ok: false, errorCode: "invalid_draft_content", errorMessage: parsedDraft.error };
  }
  const parsedBrief = parseProgramGenerationBrief(draft.briefJson);
  if (!parsedBrief.ok) {
    return { ok: false, errorCode: "invalid_draft_content", errorMessage: parsedBrief.error };
  }

  const insights = draft.insightsJson as DraftValidationResult | null;
  if (!insights) {
    return {
      ok: false,
      errorCode: "has_blockers",
      errorMessage: "This draft has not passed validation yet. Run validation before approving.",
    };
  }
  if (insights.blockers.length > 0) {
    return {
      ok: false,
      errorCode: "has_blockers",
      errorMessage: `Draft has ${insights.blockers.length} blocking issue(s) from Kynovant Insights that must be resolved before approval.`,
    };
  }
  if (insights.warnings.length > 0) {
    const ackAt = draft.warningsAcknowledgedAt;
    const validAck = ackAt != null && draft.lastValidatedAt != null && ackAt.getTime() >= draft.lastValidatedAt.getTime();
    if (!validAck) {
      return {
        ok: false,
        errorCode: "warnings_not_acknowledged",
        errorMessage: `Draft has ${insights.warnings.length} warning(s) that must be acknowledged before approval.`,
      };
    }
  }

  const generated = parsedDraft.data;
  void parsedBrief.data; // parse-validated above; brief content itself isn't needed during approval

  const db = getDb();
  const created = await db.transaction(async (tx) => {
    const workoutTemplateIds: string[] = [];

    // 1. Program template first (so weeks/days can reference it), default
    // status="draft" — never auto-published (locked rule #2).
    const programSlug = `${slugify(generated.name)}-${draftId.slice(0, 8)}`;
    const [programRow] = await tx
      .insert(programTemplates)
      .values({
        name: generated.name,
        slug: programSlug,
        description: generated.description ?? null,
        category: generated.category,
        experienceLevel: generated.experienceLevel,
        recommendedDaysPerWeek: generated.recommendedDaysPerWeek,
        defaultDurationWeeks: generated.defaultDurationWeeks,
        status: "draft",
        createdBy: approverUserId,
        metadata: { source: "ai_program_generator", generationDraftId: draftId },
      })
      .returning();

    for (const week of generated.weeks) {
      const [weekRow] = await tx
        .insert(programWeeks)
        .values({
          programTemplateId: programRow.id,
          weekNumber: week.weekNumber,
          label: week.label ?? null,
          notes: week.notes ?? null,
        })
        .returning();

      for (const day of week.days) {
        let workoutTemplateId: string | null = null;

        if (day.workout) {
          const blueprint = day.workout;
          const workoutSlug = `${slugify(blueprint.name)}-${randomUUID().slice(0, 8)}`;

          const [workoutRow] = await tx
            .insert(workoutTemplates)
            .values({
              name: blueprint.name,
              slug: workoutSlug,
              description: blueprint.description ?? null,
              primaryFocus: blueprint.primaryFocus ?? null,
              recommendedExperienceLevel: generated.experienceLevel,
              estimatedDurationMinutes: blueprint.estimatedDurationMinutes ?? null,
              status: "draft",
              createdBy: approverUserId,
              objective: blueprint.primaryFocus ?? null,
              metadata: { source: "ai_program_generator", generationDraftId: draftId },
            })
            .returning();

          workoutTemplateId = workoutRow.id;
          workoutTemplateIds.push(workoutRow.id);

          for (const section of blueprint.sections) {
            const [sectionRow] = await tx
              .insert(workoutTemplateSections)
              .values({
                workoutTemplateId: workoutRow.id,
                name: section.name,
                sectionType: section.sectionType,
                orderIndex: section.orderIndex,
                estimatedMinutes: section.estimatedMinutes ?? null,
                notes: section.notes ?? null,
              })
              .returning();

            for (const prescription of section.prescriptions) {
              await tx.insert(workoutTemplateExercises).values({
                workoutTemplateId: workoutRow.id,
                sectionId: sectionRow.id,
                exerciseId: prescription.exerciseId,
                orderIndex: prescription.orderIndex,
                groupId: prescription.groupId ?? null,
                groupPosition: prescription.groupPosition ?? null,
                sets: prescription.sets ?? null,
                repsMin: prescription.repsMin ?? null,
                repsMax: prescription.repsMax ?? null,
                durationSeconds: prescription.durationSeconds ?? null,
                restSeconds: prescription.restSeconds ?? null,
                tempo: prescription.tempo ?? null,
                targetRpe: prescription.targetRpe != null ? String(prescription.targetRpe) : null,
                targetRir: prescription.targetRir != null ? String(prescription.targetRir) : null,
                setTechnique: prescription.setTechnique ?? null,
                substitutionPolicy: prescription.substitutionPolicy ?? null,
                isRequired: prescription.isRequired,
                coachNotes: prescription.coachNotes ?? null,
              });
            }
          }
        }

        // Blueprint link: the day slot points at the newly created
        // workout_template (or stays null for an intentional rest day).
        await tx.insert(programWeekDays).values({
          programWeekId: weekRow.id,
          dayOfWeek: day.dayOfWeek,
          workoutTemplateId,
          label: day.label ?? null,
          notes: day.notes ?? null,
        });
      }
    }

    // Audit linkage + mark the draft approved, inside the same
    // transaction as everything else it created (locked rule #12).
    await tx
      .update(programGenerationDrafts)
      .set({
        status: "approved",
        approvedAt: new Date(),
        approvedBy: approverUserId,
        createdProgramTemplateId: programRow.id,
        createdWorkoutTemplateIds: workoutTemplateIds,
        updatedAt: new Date(),
      })
      .where(eq(programGenerationDrafts.id, draftId));

    return { programTemplateId: programRow.id, workoutTemplateIds };
  });

  return {
    ok: true,
    alreadyApproved: false,
    programTemplateId: created.programTemplateId,
    workoutTemplateIds: created.workoutTemplateIds,
  };
}

// Exported for tests that need to construct a brief/draft pair without
// going through the full generation pipeline.
export type { GeneratedProgramDraft };
