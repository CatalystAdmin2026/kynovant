-- ─────────────────────────────────────────────────────────────
-- Catalyst OS — Document Schema Migration (ADR-012)
--
-- Introduces the two-table document model:
--   documents                   — source docs owned by the coaching org
--   client_document_assignments — assignment lifecycle per client
--
-- Run:
--   node_modules/.bin/tsx --env-file=.env.local scripts/migrate.ts \
--     drizzle/0011_document_schema.sql
--
-- Dry run first:
--   node_modules/.bin/tsx --env-file=.env.local scripts/migrate.ts \
--     drizzle/0011_document_schema.sql --dry-run
--
-- Risk profile:
--   - Purely additive: two new enums, two new tables
--   - No existing rows modified
--   - No downtime required
--
-- Prerequisites: all prior migrations (0000–0010) must be applied.
-- ─────────────────────────────────────────────────────────────

CREATE TYPE "public"."document_category" AS ENUM (
  'meal_plan',
  'training_guide',
  'technique_reference',
  'posing_material',
  'progress_report',
  'educational',
  'agreement',
  'other'
);
--> statement-breakpoint

CREATE TYPE "public"."document_status" AS ENUM (
  'draft',
  'active',
  'archived'
);
--> statement-breakpoint

-- ─────────────────────────────────────────────────────────────
-- TABLE: documents
--
-- Source document record owned by the coaching organization.
-- storageKey is the path within the "coaching-documents" Supabase
-- Storage bucket. Never exposed to clients directly.
-- ─────────────────────────────────────────────────────────────

CREATE TABLE "documents" (
  "id"                  uuid        PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "created_by_coach_id" uuid        REFERENCES "users"("id") ON DELETE SET NULL,
  "title"               text        NOT NULL,
  "description"         text,
  "category"            "document_category" NOT NULL,
  "storage_key"         text        NOT NULL,
  "original_filename"   text        NOT NULL,
  "mime_type"           text        NOT NULL,
  "file_size_bytes"     integer,
  "version"             integer     NOT NULL DEFAULT 1,
  "status"              "document_status" NOT NULL DEFAULT 'draft',
  "created_at"          timestamptz NOT NULL DEFAULT now(),
  "updated_at"          timestamptz NOT NULL DEFAULT now(),
  "archived_at"         timestamptz
);
--> statement-breakpoint

CREATE INDEX "idx_documents_coach_id"
  ON "documents" ("created_by_coach_id");
--> statement-breakpoint

CREATE INDEX "idx_documents_status"
  ON "documents" ("status");
--> statement-breakpoint

CREATE INDEX "idx_documents_category"
  ON "documents" ("category");
--> statement-breakpoint

-- ─────────────────────────────────────────────────────────────
-- TABLE: client_document_assignments
--
-- One row per assignment event. Multiple historical rows allowed
-- for the same document+client pair (revoke → re-assign).
-- Only one active (non-revoked) assignment per pair at a time —
-- enforced by the partial unique index below.
-- ─────────────────────────────────────────────────────────────

CREATE TABLE "client_document_assignments" (
  "id"                    uuid        PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "document_id"           uuid        NOT NULL REFERENCES "documents"("id") ON DELETE RESTRICT,
  "client_id"             uuid        NOT NULL REFERENCES "users"("id") ON DELETE RESTRICT,
  "assigned_by_coach_id"  uuid        REFERENCES "users"("id") ON DELETE SET NULL,
  "document_version"      integer     NOT NULL,
  "required"              boolean     NOT NULL DEFAULT false,
  "due_at"                timestamptz,
  "viewed_at"             timestamptz,
  "acknowledged_at"       timestamptz,
  "revoked_at"            timestamptz,
  "revoked_by_coach_id"   uuid        REFERENCES "users"("id") ON DELETE SET NULL,
  "assigned_at"           timestamptz NOT NULL DEFAULT now(),
  "created_at"            timestamptz NOT NULL DEFAULT now()
);
--> statement-breakpoint

-- Only one active (non-revoked) assignment per document+client pair.
-- Partial index: NULLs in revoked_at are treated as distinct by Postgres,
-- so revoked rows do not conflict with active or with each other.
CREATE UNIQUE INDEX "uq_active_document_assignment"
  ON "client_document_assignments" ("document_id", "client_id")
  WHERE revoked_at IS NULL;
--> statement-breakpoint

CREATE INDEX "idx_doc_assignments_client_id"
  ON "client_document_assignments" ("client_id");
--> statement-breakpoint

CREATE INDEX "idx_doc_assignments_document_id"
  ON "client_document_assignments" ("document_id");
--> statement-breakpoint

CREATE INDEX "idx_doc_assignments_active"
  ON "client_document_assignments" ("client_id", "revoked_at");
--> statement-breakpoint

-- ─────────────────────────────────────────────────────────────
-- RLS — Row Level Security
--
-- documents:
--   No client SELECT policy. Clients never query this table directly.
--   All client access goes through client_document_assignments JOIN.
--   Coach writes use service-role connection, bypassing RLS.
--   Enable RLS as deny-by-default defense.
--
-- client_document_assignments:
--   Clients SELECT their own active (non-revoked) rows only.
--   No INSERT/UPDATE from client — all mutations via server actions.
-- ─────────────────────────────────────────────────────────────

ALTER TABLE "documents" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint

ALTER TABLE "client_document_assignments" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint

-- Clients can read only their own active assignments.
-- Active = revoked_at IS NULL (assignment has not been revoked).
CREATE POLICY "doc_assignments_client_select"
  ON "client_document_assignments"
  FOR SELECT
  TO authenticated
  USING (
    auth.uid() = client_id
    AND revoked_at IS NULL
  );
