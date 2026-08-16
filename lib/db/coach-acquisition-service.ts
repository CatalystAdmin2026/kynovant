import "server-only";
import { eq, sql } from "drizzle-orm";
import { getDb } from "./client";
import { coachAcquisitionLeads } from "./schema-coach-acquisition";

export async function getAcquisitionInviteLead(normalizedEmail: string) {
  const db = getDb();
  const [row] = await db
    .select({
      source: coachAcquisitionLeads.source,
      inviteStatus: coachAcquisitionLeads.inviteStatus,
      accountUserId: coachAcquisitionLeads.accountUserId,
    })
    .from(coachAcquisitionLeads)
    .where(eq(coachAcquisitionLeads.normalizedEmail, normalizedEmail))
    .limit(1);
  return row ?? null;
}

export type AcquisitionInviteStatus =
  | "not_sent"
  | "sent"
  | "failed"
  | "already_active"
  | "already_invited"
  | "client_conflict"
  | "rate_limited";

export async function recordAcquisitionSignup(input: {
  normalizedEmail: string;
  submittedName: string;
  source?: string;
}): Promise<void> {
  const db = getDb();
  const now = new Date();
  await db
    .insert(coachAcquisitionLeads)
    .values({
      normalizedEmail: input.normalizedEmail,
      submittedName: input.submittedName,
      source: input.source ?? "start_trial",
      firstSignupAt: now,
      lastSignupAt: now,
      updatedAt: now,
    })
    .onConflictDoUpdate({
      target: coachAcquisitionLeads.normalizedEmail,
      set: {
        submittedName: input.submittedName,
        source: input.source ?? "start_trial",
        lastSignupAt: now,
        updatedAt: now,
      },
    });
}

export async function markAcquisitionInviteStatus(input: {
  normalizedEmail: string;
  status: AcquisitionInviteStatus;
  accountUserId?: string | null;
  inviteSentAt?: Date | null;
}): Promise<void> {
  const db = getDb();
  await db
    .update(coachAcquisitionLeads)
    .set({
      inviteStatus: input.status,
      ...(input.accountUserId !== undefined ? { accountUserId: input.accountUserId } : {}),
      ...(input.inviteSentAt !== undefined ? { inviteSentAt: input.inviteSentAt } : {}),
      updatedAt: new Date(),
    })
    .where(eq(coachAcquisitionLeads.normalizedEmail, input.normalizedEmail));
}

export async function linkAcquisitionLeadToAccount(input: {
  normalizedEmail: string;
  accountUserId: string;
}): Promise<void> {
  const db = getDb();
  await db
    .update(coachAcquisitionLeads)
    .set({
      accountUserId: input.accountUserId,
      updatedAt: sql`now()`,
    })
    .where(eq(coachAcquisitionLeads.normalizedEmail, input.normalizedEmail));
}
