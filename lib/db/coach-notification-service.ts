import "server-only";

import { and, desc, eq, inArray, isNull } from "drizzle-orm";
import { getDb } from "./client";
import {
  coachNotifications,
  type CoachNotification,
} from "./schema-coach-notifications";

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
