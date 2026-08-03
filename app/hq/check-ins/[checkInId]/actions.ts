"use server";

import { revalidatePath } from "next/cache";
import { requireCoachOrAdmin, assertCoachOwnsCheckIn } from "@/lib/auth/guards";
import {
  startCheckInReview,
  saveCoachResponseDraft,
  markCheckInReviewed,
  reopenCheckIn,
} from "@/lib/db/coach-check-in-service";

// ─────────────────────────────────────────────────────────────
// AUTH HELPER
//
// Validates role/status (requireCoachOrAdmin) AND that the acting
// coach is actually enrolled with the client this check-in belongs
// to (assertCoachOwnsCheckIn — admin bypasses). coachId returned here
// is always the real actor's id, used for actorId/reviewedBy stamping
// on the underlying check-in row — ownership has already been verified
// separately above, so this id is safe to use for audit purposes
// regardless of whether the caller is a coach or admin.
// ─────────────────────────────────────────────────────────────

async function assertCoachOrAdmin(
  checkInId: string,
): Promise<{ ok: true; coachId: string } | { ok: false; error: string }> {
  const guard = await requireCoachOrAdmin();
  if (!guard.ok) return { ok: false, error: "Unauthorized" };
  const ownership = await assertCoachOwnsCheckIn(guard.dbUser, checkInId);
  if (!ownership.ok) return { ok: false, error: ownership.error };
  return { ok: true, coachId: guard.dbUser.id };
}

// ─────────────────────────────────────────────────────────────
// ACTIONS
// ─────────────────────────────────────────────────────────────

export async function startReviewAction(
  checkInId: string,
): Promise<{ ok: boolean; error?: string }> {
  const auth = await assertCoachOrAdmin(checkInId);
  if (!auth.ok) return { ok: false, error: auth.error };

  const result = await startCheckInReview(checkInId, auth.coachId);

  if (result.ok) {
    revalidatePath(`/hq/check-ins/${checkInId}`);
    revalidatePath("/hq/check-ins");
  }

  return result;
}

export async function saveDraftResponseAction(
  checkInId: string,
  response: string,
): Promise<{ ok: boolean; error?: string }> {
  const auth = await assertCoachOrAdmin(checkInId);
  if (!auth.ok) return { ok: false, error: auth.error };

  const result = await saveCoachResponseDraft(checkInId, auth.coachId, response);

  if (result.ok) {
    revalidatePath(`/hq/check-ins/${checkInId}`);
  }

  return result;
}

export async function markReviewedAction(
  checkInId: string,
  response: string,
): Promise<{ ok: boolean; error?: string }> {
  const auth = await assertCoachOrAdmin(checkInId);
  if (!auth.ok) return { ok: false, error: auth.error };

  const result = await markCheckInReviewed(checkInId, auth.coachId, response);

  if (result.ok) {
    revalidatePath(`/hq/check-ins/${checkInId}`);
    revalidatePath("/hq/check-ins");
  }

  return result;
}

export async function reopenCheckInAction(
  checkInId: string,
): Promise<{ ok: boolean; error?: string }> {
  const auth = await assertCoachOrAdmin(checkInId);
  if (!auth.ok) return { ok: false, error: auth.error };

  const result = await reopenCheckIn(checkInId, auth.coachId);

  if (result.ok) {
    revalidatePath(`/hq/check-ins/${checkInId}`);
    revalidatePath("/hq/check-ins");
  }

  return result;
}
