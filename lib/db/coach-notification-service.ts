import "server-only";

import { and, desc, eq, inArray, isNull } from "drizzle-orm";
import { getDb } from "./client";
import {
  coachNotifications,
  type CoachNotification,
} from "./schema-coach-notifications";
import { coachingEnrollments, clientProfiles } from "./schema";

export interface CreateCoachNotificationInput {
  coachId: string;
  actorId?: string | null;
  eventType: string;
  resourceType?: string | null;
  resourceId?: string | null;
  title: string;
  body?: string | null;
}

export interface CoachNotificationSummary {
  notifications: CoachNotification[];
  unreadCount: number;
}

export async function createCoachNotification(
  input: CreateCoachNotificationInput,
): Promise<CoachNotification> {
  const db = getDb();
  const [row] = await db
    .insert(coachNotifications)
    .values({
      coachId: input.coachId,
      actorId: input.actorId ?? null,
      eventType: input.eventType,
      resourceType: input.resourceType ?? null,
      resourceId: input.resourceId ?? null,
      title: input.title,
      body: input.body ?? null,
    })
    .returning();
  return row;
}

export async function listCoachNotifications(
  coachId: string,
  limit = 20,
): Promise<CoachNotificationSummary> {
  const db = getDb();
  const safeLimit = Math.max(1, Math.min(limit, 50));

  const [notifications, unreadRows] = await Promise.all([
    db
      .select()
      .from(coachNotifications)
      .where(eq(coachNotifications.coachId, coachId))
      .orderBy(desc(coachNotifications.createdAt))
      .limit(safeLimit),
    db
      .select({ id: coachNotifications.id })
      .from(coachNotifications)
      .where(
        and(
          eq(coachNotifications.coachId, coachId),
          isNull(coachNotifications.readAt),
        ),
      ),
  ]);

  return {
    notifications,
    unreadCount: unreadRows.length,
  };
}

export async function markCoachNotificationsRead(
  coachId: string,
  notificationIds: string[],
): Promise<number> {
  if (notificationIds.length === 0) return 0;
  const db = getDb();
  const rows = await db
    .update(coachNotifications)
    .set({ readAt: new Date() })
    .where(
      and(
        eq(coachNotifications.coachId, coachId),
        inArray(coachNotifications.id, notificationIds),
        isNull(coachNotifications.readAt),
      ),
    )
    .returning({ id: coachNotifications.id });
  return rows.length;
}

export async function markAllCoachNotificationsRead(
  coachId: string,
): Promise<number> {
  const db = getDb();
  const rows = await db
    .update(coachNotifications)
    .set({ readAt: new Date() })
    .where(
      and(
        eq(coachNotifications.coachId, coachId),
        isNull(coachNotifications.readAt),
      ),
    )
    .returning({ id: coachNotifications.id });
  return rows.length;
}

// ─────────────────────────────────────────────────────────────
// EVENT PRODUCERS
//
// Every real write path that should notify a coach calls one of these
// — never createCoachNotification() directly from outside this file —
// so title/body copy and tenant resolution stay in one place instead
// of being hand-rolled at each call site. Each producer below is
// non-throwing: a notification is a side effect of a real product
// event, never a reason the underlying action (check-in submission,
// message send, program generation, billing sync) should fail. Errors
// are logged and swallowed.
//
// Tenant scoping: every producer either receives an already-resolved
// coachId from its caller (the caller already proved that coachId owns
// the relevant client/resource — see each call site) or resolves one
// itself via coaching_enrollments (the same source of truth
// lib/auth/guards.ts's coachOwnsClient() uses), scoped to status =
// 'active' so a client's notification always reaches their CURRENT
// coach, never a past one from a prior enrollment.
// ─────────────────────────────────────────────────────────────

async function safeNotify(input: CreateCoachNotificationInput): Promise<void> {
  try {
    await createCoachNotification(input);
  } catch (err) {
    console.error(
      `[coach-notification-service] Failed to create "${input.eventType}" notification for coach ${input.coachId}:`,
      err instanceof Error ? err.message : err,
    );
  }
}

// Resolves the client's current (active) coach — coaching_enrollments
// is the sole source of truth for "who coaches this client" throughout
// this codebase (see lib/auth/guards.ts's coachOwnsClient()). A client
// can accumulate multiple historical enrollment rows (upgrades, past
// coaches); ordering by updatedAt picks the most recently touched
// active one. Returns null if the client has no active enrollment —
// callers skip notifying rather than guessing a coach.
async function resolveActiveCoachForClient(
  clientId: string,
): Promise<{ coachId: string; clientName: string | null } | null> {
  const db = getDb();
  const [row] = await db
    .select({
      coachId: coachingEnrollments.coachId,
      clientName: clientProfiles.fullName,
    })
    .from(coachingEnrollments)
    .leftJoin(clientProfiles, eq(clientProfiles.userId, coachingEnrollments.clientId))
    .where(
      and(
        eq(coachingEnrollments.clientId, clientId),
        eq(coachingEnrollments.status, "active"),
      ),
    )
    .orderBy(desc(coachingEnrollments.updatedAt))
    .limit(1);
  return row ? { coachId: row.coachId, clientName: row.clientName } : null;
}

// ── 1. Client submits a check-in ───────────────────────────────
// Called from check-in-service.ts's submitCheckIn(), inside the same
// "status actually just transitioned draft -> submitted" branch that
// guards the existing timeline-event insert — a concurrent double-
// submit already can't reach that branch twice (see submitCheckIn's
// own optimistic-WHERE-guard comment), so this inherits that same
// dedup for free without any notification-specific logic.
export async function notifyCheckInSubmitted(params: {
  clientId: string;
  checkInId: string;
  // The specific occurrence date (weekly_check_ins.scheduledDate),
  // not just the week — a Wed+Sun client's coach gets two distinct
  // notifications, each naming its own date, never collapsed into one
  // ambiguous "week of X" for both.
  scheduledDate: string;
}): Promise<void> {
  const resolved = await resolveActiveCoachForClient(params.clientId);
  if (!resolved) return; // no active coach to notify (shouldn't happen for a real check-in, but never guess)

  const who = resolved.clientName ?? "A client";
  await safeNotify({
    coachId: resolved.coachId,
    actorId: params.clientId,
    eventType: "check_in_submitted",
    resourceType: "check_in",
    resourceId: params.checkInId,
    title: "New check-in submitted",
    body: `${who} submitted their check-in for ${params.scheduledDate}.`,
  });
}

// ── 2. Client sends a new message ──────────────────────────────
// Called from messaging-service.ts's sendMessage() only when the
// SENDER is the client half of the conversation — a coach messaging
// their own client never notifies the coach about their own message.
// coachId/clientId come directly from the already-loaded conversation
// row, which was only ever created after coachOwnsClient() confirmed a
// real enrollment (see messaging-service.ts's header) — no separate
// tenant lookup needed or possible to get wrong here.
export async function notifyNewMessage(params: {
  coachId: string;
  clientId: string;
  clientName: string | null;
  conversationId: string;
  preview: string;
}): Promise<void> {
  const who = params.clientName ?? "your client";
  await safeNotify({
    coachId: params.coachId,
    actorId: params.clientId,
    eventType: "new_message",
    resourceType: "conversation",
    resourceId: params.conversationId,
    title: `New message from ${who}`,
    body: params.preview,
  });
}

// ── 3/4. AI Program Generator draft ready / failed ─────────────
// Called once from each of generateProgramDraftAction() and
// resumeGenerationAction() (app/hq/programs/generate/actions.ts),
// right after their one runStagedGeneration() call resolves — every
// internal failure branch inside staged-generation.ts funnels through
// that single return, so these two producers cover all of them without
// needing a call at each individual failure site. coachId is the
// already-authenticated, already-ownership-checked actor from that
// action — never re-derived here. resumeGenerationAction's atomic
// claimFailedDraftForResume() already prevents a concurrent double-
// retry from reaching runStagedGeneration() twice for the same draft,
// so no separate dedup is needed here either.
export async function notifyProgramDraftReady(params: {
  coachId: string;
  draftId: string;
}): Promise<void> {
  await safeNotify({
    coachId: params.coachId,
    actorId: null,
    eventType: "program_draft_ready",
    resourceType: "program_draft",
    resourceId: params.draftId,
    title: "Program draft ready for review",
    body: "Your AI-generated program is ready to review.",
  });
}

export async function notifyProgramDraftFailed(params: {
  coachId: string;
  draftId: string;
  reason: string;
}): Promise<void> {
  await safeNotify({
    coachId: params.coachId,
    actorId: null,
    eventType: "program_draft_failed",
    resourceType: "program_draft",
    resourceId: params.draftId,
    title: "Program generation failed",
    body: params.reason,
  });
}

// ── 6. Billing: payment failed (coach-actionable, not duplicative
// of /hq/billing) ────────────────────────────────────────────────
// Called from coach-subscription-service.ts's upsertCoachSubscriptionFromStripe()
// only on a FRESH transition into past_due — the caller already gates
// this the same way it gates re-arming gracePeriodEnd, so a replayed
// webhook or a repeat invoice.payment_failed retry for the same
// still-unresolved failure never re-notifies. This is the one billing
// state genuinely worth interrupting a coach for: it's actionable
// (update payment within the grace window) and, unlike a full
// cancellation/suspension, the coach can still reach HQ to see it.
export async function notifyBillingPastDue(params: {
  coachId: string;
  subscriptionId: string;
  gracePeriodEnd: Date | null;
}): Promise<void> {
  const byWhen = params.gracePeriodEnd
    ? params.gracePeriodEnd.toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" })
    : "soon";
  await safeNotify({
    coachId: params.coachId,
    actorId: null,
    eventType: "billing_payment_failed",
    resourceType: "coach_subscription",
    resourceId: params.subscriptionId,
    title: "Payment failed",
    body: `Your last payment didn't go through. Update billing by ${byWhen} to keep HQ access.`,
  });
}
