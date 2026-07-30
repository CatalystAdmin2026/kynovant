// ─────────────────────────────────────────────────────────────
// Catalyst OS — Nutrition Target Service (Nutrition Foundation)
//
// SERVER-ONLY — never import from a Client Component.
//
// All writes use the service-role database connection (bypasses RLS).
// RLS policies provide defense-in-depth for any direct PostgREST access.
//
// The four-stage model (calculator inputs → recommendation → coach decision
// → published target) is enforced in this service layer:
//   - createDraft() runs the calculator and stores both recommendation
//     and coach decision fields simultaneously
//   - publish() requires an explicit service call; nothing auto-publishes
//   - Historical lookups work via getTargetAtDate()
//
// See docs/ARCHITECTURE_DECISIONS.md ADR-014 for full design rationale.
// ─────────────────────────────────────────────────────────────

import "server-only";
import { eq, and, desc, lte, or, isNull, gt } from "drizzle-orm";
import { getDb } from "./client";
import { clientNutritionTargets } from "./schema-nutrition";
import { clientNotifications } from "./schema-notifications";
import type {
  ClientNutritionTarget,
  ActivityLevel,
  NutritionTargetStatus,
} from "./schema-nutrition";
import { calculate, validateInputs } from "@/lib/nutrition/calculator";
import type { CalculatorInputs } from "@/lib/nutrition/calculator";

// ─────────────────────────────────────────────────────────────
// TYPES
// ─────────────────────────────────────────────────────────────

export interface NutritionDraftInput {
  clientId: string;
  coachId: string;
  effectiveDate: string; // "YYYY-MM-DD"

  // Calculator inputs (used to generate recommendation)
  heightInches: number;
  weightLbs: number;
  ageYears: number;
  biologicalSex: "male" | "female" | "unspecified";
  activityLevel: ActivityLevel;
  goalType: string;

  // Coach decision (defaults to recommendation; coach may override)
  calorieTarget: number;
  proteinGrams: number;
  fatGrams?: number;
  carbGrams?: number;
  adjustmentReason?: string;

  // Client-visible coaching context
  coachNotes?: string;

  // Internal coach note (never shown to client)
  internalNotes?: string;
}

export interface NutritionDraftUpdate {
  effectiveDate?: string;
  activityLevel?: ActivityLevel;
  goalType?: string;
  calorieTarget?: number;
  proteinGrams?: number;
  fatGrams?: number | null;
  carbGrams?: number | null;
  adjustmentReason?: string | null;
  coachNotes?: string | null;
  internalNotes?: string | null;
}

export type NutritionTargetWithStatus = ClientNutritionTarget;

// Projection for the client portal — excludes all coach-internal and
// calculation-stage fields. Never include internalNotes, adjustmentReason,
// rec_* columns, calc_* columns, archivedAt, or archivedBy.
export interface ClientPortalNutritionTarget {
  id: string;
  status: NutritionTargetStatus;
  effectiveDate: string;
  calorieTarget: number;
  proteinGrams: number;
  fatGrams: number | null;
  carbGrams: number | null;
  coachNotes: string | null;
  publishedAt: Date | null;
}

// ─────────────────────────────────────────────────────────────
// READ — PUBLIC
// ─────────────────────────────────────────────────────────────

// Returns the current published target for a client.
// Used by the COACH HQ page — returns all columns.
export async function getActiveTarget(
  clientId: string,
): Promise<ClientNutritionTarget | null> {
  const db = getDb();
  const rows = await db
    .select()
    .from(clientNutritionTargets)
    .where(
      and(
        eq(clientNutritionTargets.clientId, clientId),
        eq(clientNutritionTargets.status, "published"),
      ),
    )
    .limit(1);
  return rows[0] ?? null;
}

// Returns the published target for the CLIENT PORTAL.
// Projects only client-visible columns. internalNotes, rec_*, and calc_*
// fields are never included — they must not appear in the RSC payload.
export async function getPublishedTargetForClient(
  clientId: string,
): Promise<ClientPortalNutritionTarget | null> {
  const db = getDb();
  const rows = await db
    .select({
      id: clientNutritionTargets.id,
      status: clientNutritionTargets.status,
      effectiveDate: clientNutritionTargets.effectiveDate,
      calorieTarget: clientNutritionTargets.calorieTarget,
      proteinGrams: clientNutritionTargets.proteinGrams,
      fatGrams: clientNutritionTargets.fatGrams,
      carbGrams: clientNutritionTargets.carbGrams,
      coachNotes: clientNutritionTargets.coachNotes,
      publishedAt: clientNutritionTargets.publishedAt,
    })
    .from(clientNutritionTargets)
    .where(
      and(
        eq(clientNutritionTargets.clientId, clientId),
        eq(clientNutritionTargets.status, "published"),
      ),
    )
    .limit(1);
  return rows[0] ?? null;
}

// Returns the target that was active (published) on a specific date.
// Used for historical check-in correlation.
// A target is "active on date D" when:
//   effective_date <= D  AND  (archived_at IS NULL  OR  archived_at > end-of-D)
export async function getTargetAtDate(
  clientId: string,
  date: string, // "YYYY-MM-DD"
): Promise<ClientNutritionTarget | null> {
  const db = getDb();
  const endOfDay = new Date(date + "T23:59:59Z");

  const rows = await db
    .select()
    .from(clientNutritionTargets)
    .where(
      and(
        eq(clientNutritionTargets.clientId, clientId),
        lte(clientNutritionTargets.effectiveDate, date),
        or(
          isNull(clientNutritionTargets.archivedAt),
          gt(clientNutritionTargets.archivedAt, endOfDay),
        ),
      ),
    )
    .orderBy(desc(clientNutritionTargets.effectiveDate))
    .limit(1);

  return rows[0] ?? null;
}

// Returns all targets for a client ordered by effective_date descending.
// Coach-only: includes drafts and archived records.
export async function getTargetHistory(
  clientId: string,
): Promise<ClientNutritionTarget[]> {
  const db = getDb();
  return db
    .select()
    .from(clientNutritionTargets)
    .where(eq(clientNutritionTargets.clientId, clientId))
    .orderBy(desc(clientNutritionTargets.effectiveDate));
}

// Returns the current draft targets for a client (may be multiple).
// Coach-only.
export async function getDraftTargets(
  clientId: string,
): Promise<ClientNutritionTarget[]> {
  const db = getDb();
  return db
    .select()
    .from(clientNutritionTargets)
    .where(
      and(
        eq(clientNutritionTargets.clientId, clientId),
        eq(clientNutritionTargets.status, "draft"),
      ),
    )
    .orderBy(desc(clientNutritionTargets.createdAt));
}

// ─────────────────────────────────────────────────────────────
// WRITE — DRAFT MANAGEMENT
// ─────────────────────────────────────────────────────────────

// Creates a new draft target record.
// Runs the calculator from the provided inputs and stores both the
// system recommendation and the coach's initial decision (which starts
// equal to the recommendation). The coach can then adjust before publishing.
export async function createDraft(
  input: NutritionDraftInput,
): Promise<{ ok: true; targetId: string } | { ok: false; error: string }> {
  const calcInputs: CalculatorInputs = {
    heightInches: input.heightInches,
    weightLbs: input.weightLbs,
    ageYears: input.ageYears,
    biologicalSex: input.biologicalSex,
    activityLevel: input.activityLevel,
    goalType: input.goalType,
  };

  const errors = validateInputs(calcInputs);
  if (errors.length > 0) {
    return { ok: false, error: errors[0].message };
  }

  const rec = calculate(calcInputs);

  try {
    const db = getDb();
    const today = new Date().toISOString().split("T")[0];

    const [inserted] = await db
      .insert(clientNutritionTargets)
      .values({
        clientId: input.clientId,
        coachId: input.coachId,
        status: "draft",
        effectiveDate: input.effectiveDate || today,

        // Stage 1: Calculator inputs (audit)
        calcHeightInches: String(input.heightInches),
        calcWeightLbs: String(input.weightLbs),
        calcAgeYears: input.ageYears,
        calcBiologicalSex: input.biologicalSex === "unspecified"
          ? "unspecified"
          : input.biologicalSex,
        calcActivityLevel: input.activityLevel,
        calcGoalType: input.goalType,

        // Stage 2: System recommendation
        recCalories: rec.recommendedCalories,
        recProteinG: rec.recommendedProteinG,
        recFatG: rec.recommendedFatG,
        recCarbG: rec.recommendedCarbG,
        recBmr: rec.bmr,
        recTdee: rec.tdee,
        recFormulaVersion: rec.formulaVersion,

        // Stage 3: Coach decision (starts equal to recommendation)
        calorieTarget: input.calorieTarget,
        proteinGrams: input.proteinGrams,
        fatGrams: input.fatGrams ?? rec.recommendedFatG,
        carbGrams: input.carbGrams ?? rec.recommendedCarbG,
        adjustmentReason: input.adjustmentReason ?? null,

        // Stage 4: Client-visible context
        coachNotes: input.coachNotes ?? null,
        internalNotes: input.internalNotes ?? null,
      })
      .returning({ id: clientNutritionTargets.id });

    return { ok: true, targetId: inserted.id };
  } catch (err) {
    console.error("[nutrition-target-service] createDraft error:", err);
    return { ok: false, error: "Failed to create draft. Please try again." };
  }
}

// Updates a draft target in place.
// Only drafts can be updated; published and archived targets are immutable.
// clientId is required and enforced in the WHERE clause to prevent cross-client
// mutations from a coach who knows a target UUID from another client's URL.
export async function updateDraft(
  targetId: string,
  clientId: string,
  coachId: string,
  updates: NutritionDraftUpdate,
): Promise<{ ok: boolean; error?: string }> {
  try {
    const db = getDb();

    const [existing] = await db
      .select({ status: clientNutritionTargets.status })
      .from(clientNutritionTargets)
      .where(
        and(
          eq(clientNutritionTargets.id, targetId),
          eq(clientNutritionTargets.clientId, clientId),
        ),
      )
      .limit(1);

    if (!existing) return { ok: false, error: "Target not found." };
    if (existing.status !== "draft") {
      return { ok: false, error: "Only draft targets can be updated." };
    }

    const now = new Date();
    await db
      .update(clientNutritionTargets)
      .set({
        ...(updates.effectiveDate !== undefined && {
          effectiveDate: updates.effectiveDate,
        }),
        ...(updates.calorieTarget !== undefined && {
          calorieTarget: updates.calorieTarget,
        }),
        ...(updates.proteinGrams !== undefined && {
          proteinGrams: updates.proteinGrams,
        }),
        ...(updates.fatGrams !== undefined && { fatGrams: updates.fatGrams }),
        ...(updates.carbGrams !== undefined && { carbGrams: updates.carbGrams }),
        ...(updates.adjustmentReason !== undefined && {
          adjustmentReason: updates.adjustmentReason,
        }),
        ...(updates.coachNotes !== undefined && {
          coachNotes: updates.coachNotes,
        }),
        ...(updates.internalNotes !== undefined && {
          internalNotes: updates.internalNotes,
        }),
        coachId,
        updatedAt: now,
      })
      .where(
        and(
          eq(clientNutritionTargets.id, targetId),
          eq(clientNutritionTargets.clientId, clientId),
        ),
      );

    return { ok: true };
  } catch (err) {
    console.error("[nutrition-target-service] updateDraft error:", err);
    return { ok: false, error: "Failed to update draft. Please try again." };
  }
}

// ─────────────────────────────────────────────────────────────
// WRITE — PUBLICATION
// ─────────────────────────────────────────────────────────────

// Publishes a draft target.
// All three writes run inside a single transaction:
//   1. Archive the current published target (if any)
//   2. Promote the draft to published
//   3. Create a nutrition_updated notification
//
// The partial unique index prevents two simultaneous published targets
// even if a race condition occurs in concurrent requests.
export async function publishTarget(
  targetId: string,
  coachId: string,
  clientId: string,
): Promise<{ ok: boolean; error?: string }> {
  const db = getDb();

  try {
    await db.transaction(async (tx) => {
      const now = new Date();
      const today = now.toISOString().split("T")[0];

      // Verify the target exists, is a draft, and belongs to this client
      const [draft] = await tx
        .select()
        .from(clientNutritionTargets)
        .where(
          and(
            eq(clientNutritionTargets.id, targetId),
            eq(clientNutritionTargets.clientId, clientId),
            eq(clientNutritionTargets.status, "draft"),
          ),
        )
        .limit(1);

      if (!draft) throw new Error("Draft target not found.");

      // Archive any currently published target for this client
      await tx
        .update(clientNutritionTargets)
        .set({
          status: "archived",
          archivedAt: now,
          archivedBy: coachId,
          updatedAt: now,
        })
        .where(
          and(
            eq(clientNutritionTargets.clientId, clientId),
            eq(clientNutritionTargets.status, "published"),
          ),
        );

      // Promote the draft to published
      await tx
        .update(clientNutritionTargets)
        .set({
          status: "published",
          publishedAt: now,
          effectiveDate: draft.effectiveDate ?? today,
          coachId,
          updatedAt: now,
        })
        .where(eq(clientNutritionTargets.id, targetId));

      // Create notification (nutrition_updated)
      await tx.insert(clientNotifications).values({
        clientId,
        actorId: coachId,
        eventType: "nutrition_updated",
        resourceType: "nutrition_target",
        resourceId: targetId,
        title: "Your nutrition targets have been updated.",
        body: "Your coach has published new daily targets. Open Nutrition to see them.",
      });
    });

    return { ok: true };
  } catch (err) {
    const message = err instanceof Error ? err.message : "";
    if (message === "Draft target not found.") {
      return { ok: false, error: message };
    }
    console.error("[nutrition-target-service] publishTarget error:", err);
    return { ok: false, error: "Failed to publish target. Please try again." };
  }
}

// Archives a target (draft or published).
// Use when removing a target without replacing it.
// clientId is required and enforced in WHERE to prevent cross-client archive.
export async function archiveTarget(
  targetId: string,
  clientId: string,
  coachId: string,
): Promise<{ ok: boolean; error?: string }> {
  const db = getDb();
  const now = new Date();

  try {
    const [target] = await db
      .select({ status: clientNutritionTargets.status })
      .from(clientNutritionTargets)
      .where(
        and(
          eq(clientNutritionTargets.id, targetId),
          eq(clientNutritionTargets.clientId, clientId),
        ),
      )
      .limit(1);

    if (!target) return { ok: false, error: "Target not found." };
    if (target.status === "archived") {
      return { ok: false, error: "Target is already archived." };
    }

    await db
      .update(clientNutritionTargets)
      .set({
        status: "archived",
        archivedAt: now,
        archivedBy: coachId,
        updatedAt: now,
      })
      .where(
        and(
          eq(clientNutritionTargets.id, targetId),
          eq(clientNutritionTargets.clientId, clientId),
        ),
      );

    return { ok: true };
  } catch (err) {
    console.error("[nutrition-target-service] archiveTarget error:", err);
    return { ok: false, error: "Failed to archive target. Please try again." };
  }
}
