"use server";

// ─────────────────────────────────────────────────────────────
// Kynovant HQ — Application Review Actions
//
// Server actions run on the server and can be called from Client
// Components. Auth is re-validated independently here because
// Server Actions bypass middleware — same pattern as
// app/hq/check-ins/[checkInId]/actions.ts.
// ─────────────────────────────────────────────────────────────

import { revalidatePath } from "next/cache";
import { requireCoachOrAdmin } from "@/lib/auth/guards";
import {
  updateApplicationStatus,
  saveApplicationNotes,
} from "@/lib/db/application-service";
import type { ApplicationStatus } from "@/lib/db/schema-applications";

export async function updateApplicationStatusAction(
  applicationId: string,
  status: ApplicationStatus,
): Promise<{ ok: boolean; error?: string }> {
  const guard = await requireCoachOrAdmin();
  if (!guard.ok) return { ok: false, error: "Unauthorized" };

  const result = await updateApplicationStatus(applicationId, status, guard.dbUser.id);

  if (result.ok) {
    revalidatePath(`/hq/applications/${applicationId}`);
    revalidatePath("/hq/applications");
  }

  return result;
}

export async function saveApplicationNotesAction(
  applicationId: string,
  notes: string,
): Promise<{ ok: boolean; error?: string }> {
  const guard = await requireCoachOrAdmin();
  if (!guard.ok) return { ok: false, error: "Unauthorized" };

  const result = await saveApplicationNotes(applicationId, notes, guard.dbUser.id);

  if (result.ok) {
    revalidatePath(`/hq/applications/${applicationId}`);
  }

  return result;
}
