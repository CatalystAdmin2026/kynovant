import "server-only";

import {
  boolean,
  index,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uuid,
} from "drizzle-orm/pg-core";
import { users } from "./schema";

export const accountClassificationEnum = pgEnum("account_classification", [
  "customer",
  "internal",
  "test_fixture",
  "founder_admin",
  "demo",
]);

export const internalAccountFlags = pgTable(
  "internal_account_flags",
  {
    userId: uuid("user_id")
      .primaryKey()
      .references(() => users.id, { onDelete: "restrict" }),
    classification: accountClassificationEnum("classification")
      .notNull()
      .default("customer"),
    reason: text("reason"),
    reviewedBy: uuid("reviewed_by").references(() => users.id, {
      onDelete: "set null",
    }),
    reviewedAt: timestamp("reviewed_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index("idx_internal_account_flags_classification").on(table.classification),
  ],
);

export const operatorProfiles = pgTable("operator_profiles", {
  userId: uuid("user_id")
    .primaryKey()
    .references(() => users.id, { onDelete: "restrict" }),
  firstName: text("first_name"),
  displayName: text("display_name"),
  timezone: text("timezone").notNull().default("America/Chicago"),
  isFounder: boolean("is_founder").notNull().default(false),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export type AccountClassification =
  (typeof accountClassificationEnum.enumValues)[number];
export type InternalAccountFlags = typeof internalAccountFlags.$inferSelect;
export type OperatorProfile = typeof operatorProfiles.$inferSelect;
