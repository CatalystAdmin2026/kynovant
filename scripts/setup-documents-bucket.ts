#!/usr/bin/env npx tsx
// ─────────────────────────────────────────────────────────────
// Catalyst OS — Documents Storage Bucket Setup (ADR-012)
//
// Idempotently creates the private "coaching-documents" Supabase
// Storage bucket that lib/db/document-service.ts uploads to and
// generates signed URLs from. Confirmed via a direct listBuckets()
// call during development that this bucket does not exist yet in
// the shared project — this script is how it gets provisioned.
//
// This is infrastructure, not a database migration, so it isn't a
// drizzle/*.sql file — but it carries the same caution as one: it
// mutates shared, live Supabase project state. It was NOT run
// against the shared project from this isolated worktree. Run it
// once, from any worktree, before the Documents feature is used:
//
//   set -a && source .env.local && set +a && npx tsx scripts/setup-documents-bucket.ts
//
// Safe to re-run — no-ops if the bucket already exists.
// ─────────────────────────────────────────────────────────────

import { createClient } from "@supabase/supabase-js";

const BUCKET_NAME = "coaching-documents";

// Mirrors document-service.ts's MAX_DOCUMENT_SIZE_BYTES — kept as a
// literal here (rather than importing from a server-only module) so
// this script has zero app-code dependencies and can run standalone.
const MAX_DOCUMENT_SIZE_BYTES = 25 * 1024 * 1024;

async function main() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !serviceRoleKey) {
    console.error("NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY are not set.");
    console.error("Load your .env.local before running this script.");
    process.exit(1);
  }

  const supabase = createClient(url, serviceRoleKey);

  const { data: buckets, error: listError } = await supabase.storage.listBuckets();
  if (listError) {
    console.error("Failed to list buckets:", listError.message);
    process.exit(1);
  }

  if (buckets.some((b) => b.name === BUCKET_NAME)) {
    console.log(`✓ Bucket "${BUCKET_NAME}" already exists — nothing to do.`);
    return;
  }

  const { error: createError } = await supabase.storage.createBucket(BUCKET_NAME, {
    public: false, // private — all access via short-lived signed URLs only
    fileSizeLimit: MAX_DOCUMENT_SIZE_BYTES,
  });

  if (createError) {
    console.error(`Failed to create bucket "${BUCKET_NAME}":`, createError.message);
    process.exit(1);
  }

  console.log(`✓ Created private bucket "${BUCKET_NAME}".`);
}

main().catch((err) => {
  console.error("Setup failed:", err instanceof Error ? err.message : err);
  process.exit(1);
});
