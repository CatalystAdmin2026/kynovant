"use server";

import { revalidatePath } from "next/cache";
import { requireClientUser } from "@/lib/supabase/session";
import {
  createOrUpdateDraftCheckIn,
  submitCheckIn,
  editSubmittedCheckIn,
  type CheckInDraftData,
} from "@/lib/db/check-in-service";
import {
  validateCheckInDraft,
  hasFieldErrors,
  type CheckInFieldErrors,
} from "@/lib/db/check-in-validation";

// ─────────────────────────────────────────────────────────────
// SAVE DRAFT
//
// Creates or updates the current week's draft check-in.
// Validates all numeric fields before touching Drizzle.
// Returns structured field errors on validation failure.
// ─────────────────────────────────────────────────────────────

export async function saveDraftCheckInAction(
  scheduledDate: string,
  data: CheckInDraftData,
): Promise<{ ok: boolean; checkInId?: string; error?: string; fieldErrors?: CheckInFieldErrors }> {
  const { dbUser } = await requireClientUser();
  if (dbUser.role !== "client") {
    return { ok: false, error: "Forbidden" };
  }

  if (!/^\d{4}-\d{2}-\d{2}$/.test(scheduledDate)) {
    return { ok: false, error: "Invalid check-in date." };
  }

  const fieldErrors = validateCheckInDraft(data);
  if (hasFieldErrors(fieldErrors)) {
    return { ok: false, fieldErrors };
  }

  try {
    const result = await createOrUpdateDraftCheckIn(dbUser.id, scheduledDate, data);
    if (result.ok) {
      revalidatePath("/portal/check-ins");
    }
    return result;
  } catch {
    return { ok: false, error: "Failed to save check-in. Please try again." };
  }
}

// ─────────────────────────────────────────────────────────────
// EDIT SUBMITTED CHECK-IN
//
// Updates an existing submitted check-in with corrected data.
// Enforces server-side: must be authenticated client, must own
// the check-in, status must still be 'submitted'. Atomic
// conditional update prevents race with coach status change.
// ─────────────────────────────────────────────────────────────

export async function editSubmittedCheckInAction(
  checkInId: string,
  data: CheckInDraftData,
): Promise<{ ok: boolean; error?: string; fieldErrors?: CheckInFieldErrors }> {
  const { dbUser } = await requireClientUser();
  if (dbUser.role !== "client") {
    return { ok: false, error: "Forbidden" };
  }

  // Server-side validation before the service call — returns structured
  // field errors the client can display, rather than relying on DB CHECK
  // constraint failures to surface malformed data.
  const fieldErrors = validateCheckInDraft(data);
  if (hasFieldErrors(fieldErrors)) {
    return { ok: false, fieldErrors };
  }

  try {
    const result = await editSubmittedCheckIn(dbUser.id, checkInId, data);
    if (result.ok) {
      revalidatePath("/portal/check-ins");
      revalidatePath(`/portal/check-ins/${checkInId}`);
    }
    return result;
  } catch {
    return { ok: false, error: "Failed to save changes. Please try again." };
  }
}

// ─────────────────────────────────────────────────────────────
// SUBMIT
//
// Transitions draft → submitted for the given check-in.
// Validates all numeric fields before submitting.
// ─────────────────────────────────────────────────────────────

export async function submitCheckInAction(
  checkInId: string,
): Promise<{ ok: boolean; error?: string }> {
  const { dbUser } = await requireClientUser();
  if (dbUser.role !== "client") {
    return { ok: false, error: "Forbidden" };
  }

  try {
    const result = await submitCheckIn(dbUser.id, checkInId);
    if (result.ok) {
      revalidatePath("/portal/check-ins");
      revalidatePath(`/portal/check-ins/${checkInId}`);
    }
    return result;
  } catch {
    return { ok: false, error: "Failed to submit check-in. Please try again." };
  }
}
