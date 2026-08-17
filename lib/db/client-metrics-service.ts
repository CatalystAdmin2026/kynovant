// ─────────────────────────────────────────────────────────────
// Catalyst OS — Client Body Metrics Service
//
// SERVER-ONLY — never import from a Client Component.
//
// Coach-facing writes for the canonical body-metric sources the
// nutrition calculator (lib/nutrition/calculator.ts) reads from:
//   - health_profiles      — height, biological sex, date of birth
//                             (one row per client; upserted)
//   - body_composition_records — weight (append-only measurement
//                             history; never overwritten)
//
// Both tables previously had no application write path at all —
// health_profiles was only ever populated by scripts/seed-demo-client.ts.
// For a real client, that meant these fields could never be filled in,
// so the nutrition calculator was permanently unusable. This service
// is the smallest correct fix: write straight through to the existing
// canonical tables via the same upsert/insert shape scripts/seed-demo-
// client.ts already established, rather than inventing a parallel
// nutrition-only copy of these values.
// ─────────────────────────────────────────────────────────────

import "server-only";
import { getDb } from "./client";
import { healthProfiles, bodyCompositionRecords } from "./schema-profile";
import type { BiologicalSex } from "./schema-profile";

// Mirrors the bounds lib/nutrition/calculator.ts's validateInputs()
// enforces, applied here too since this is a separate write path.
const MIN_HEIGHT_INCHES = 1;
const MAX_HEIGHT_INCHES = 120;
const MIN_WEIGHT_LBS = 1;
const MAX_WEIGHT_LBS = 2000;

export interface ClientMetricsInput {
  heightInches?: number;
  weightLbs?: number;
  dateOfBirth?: string; // "YYYY-MM-DD"
  biologicalSex?: BiologicalSex;
}

export interface ClientMetricsResult {
  ok: boolean;
  error?: string;
}

function isValidDobString(dob: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dob)) return false;
  const date = new Date(dob + "T00:00:00");
  if (Number.isNaN(date.getTime())) return false;
  return date.getTime() <= Date.now(); // not in the future
}

// Saves whatever subset of height / weight / DOB / biological sex the
// coach provided. Height/sex/DOB upsert the client's single
// health_profiles row; weight appends a new body_composition_records
// entry (that table's history is append-only by design — see its
// schema comment). Both writes are independent — a failure in one
// does not roll back the other, since neither enforces an invariant
// over the other (unlike publishTarget's archive+promote pair).
export async function saveClientMetrics(
  clientId: string,
  input: ClientMetricsInput,
): Promise<ClientMetricsResult> {
  const errors: string[] = [];

  if (input.heightInches !== undefined) {
    if (
      !Number.isFinite(input.heightInches) ||
      input.heightInches < MIN_HEIGHT_INCHES ||
      input.heightInches > MAX_HEIGHT_INCHES
    ) {
      errors.push("Height must be between 1 and 120 inches.");
    }
  }
  if (input.weightLbs !== undefined) {
    if (
      !Number.isFinite(input.weightLbs) ||
      input.weightLbs < MIN_WEIGHT_LBS ||
      input.weightLbs > MAX_WEIGHT_LBS
    ) {
      errors.push("Weight must be between 1 and 2000 lbs.");
    }
  }
  if (input.dateOfBirth !== undefined && !isValidDobString(input.dateOfBirth)) {
    errors.push("Date of birth must be a valid date, not in the future.");
  }

  if (errors.length > 0) {
    return { ok: false, error: errors[0] };
  }

  const hasHealthProfileFields =
    input.heightInches !== undefined ||
    input.biologicalSex !== undefined ||
    input.dateOfBirth !== undefined;

  try {
    const db = getDb();
    const now = new Date();

    if (hasHealthProfileFields) {
      await db
        .insert(healthProfiles)
        .values({
          clientId,
          heightInches:
            input.heightInches !== undefined ? String(input.heightInches) : null,
          biologicalSex: input.biologicalSex ?? null,
          dateOfBirth: input.dateOfBirth ?? null,
        })
        .onConflictDoUpdate({
          target: healthProfiles.clientId,
          set: {
            ...(input.heightInches !== undefined && {
              heightInches: String(input.heightInches),
            }),
            ...(input.biologicalSex !== undefined && {
              biologicalSex: input.biologicalSex,
            }),
            ...(input.dateOfBirth !== undefined && {
              dateOfBirth: input.dateOfBirth,
            }),
            updatedAt: now,
          },
        });
    }

    if (input.weightLbs !== undefined) {
      await db.insert(bodyCompositionRecords).values({
        clientId,
        recordedAt: now,
        weightPounds: String(input.weightLbs),
        source: "coach_entry",
      });
    }

    return { ok: true };
  } catch (err) {
    console.error("[client-metrics-service] saveClientMetrics error:", err);
    return { ok: false, error: "Failed to save client metrics. Please try again." };
  }
}
