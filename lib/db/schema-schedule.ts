import {
  pgTable,
  pgEnum,
  uuid,
  text,
  timestamp,
  index,
  check,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { users } from "./schema";

export const coachAppointmentStatusEnum = pgEnum("coach_appointment_status", [
  "scheduled",
  "completed",
  "cancelled",
]);

export const coachAppointmentCategoryEnum = pgEnum("coach_appointment_category", [
  "consultation",
  "check_in",
  "training",
  "nutrition",
  "admin",
  "personal",
  "other",
]);

export const coachAppointments = pgTable(
  "coach_appointments",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    coachId: uuid("coach_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    clientId: uuid("client_id").references(() => users.id, {
      onDelete: "set null",
    }),
    title: text("title"),
    category: coachAppointmentCategoryEnum("category").notNull().default("consultation"),
    status: coachAppointmentStatusEnum("status").notNull().default("scheduled"),
    startsAt: timestamp("starts_at", { withTimezone: true }).notNull(),
    endsAt: timestamp("ends_at", { withTimezone: true }).notNull(),
    privateNotes: text("private_notes"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index("idx_coach_appointments_coach_start").on(table.coachId, table.startsAt),
    index("idx_coach_appointments_coach_status").on(table.coachId, table.status),
    index("idx_coach_appointments_client_id").on(table.clientId),
    check("chk_coach_appointment_time_order", sql`${table.endsAt} > ${table.startsAt}`),
  ],
);

export type CoachAppointment = typeof coachAppointments.$inferSelect;
export type NewCoachAppointment = typeof coachAppointments.$inferInsert;
export type CoachAppointmentStatus =
  (typeof coachAppointmentStatusEnum.enumValues)[number];
export type CoachAppointmentCategory =
  (typeof coachAppointmentCategoryEnum.enumValues)[number];
