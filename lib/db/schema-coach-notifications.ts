import { pgTable, uuid, text, timestamp, index } from "drizzle-orm/pg-core";
import { users } from "./schema";

export const coachNotifications = pgTable(
  "coach_notifications",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    coachId: uuid("coach_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    actorId: uuid("actor_id").references(() => users.id, {
      onDelete: "set null",
    }),
    eventType: text("event_type").notNull(),
    resourceType: text("resource_type"),
    resourceId: uuid("resource_id"),
    title: text("title").notNull(),
    body: text("body"),
    readAt: timestamp("read_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index("idx_coach_notifications_coach_created").on(table.coachId, table.createdAt),
    index("idx_coach_notifications_unread").on(table.coachId, table.readAt),
    index("idx_coach_notifications_event_type").on(table.eventType),
  ],
);

export type CoachNotification = typeof coachNotifications.$inferSelect;
export type NewCoachNotification = typeof coachNotifications.$inferInsert;
