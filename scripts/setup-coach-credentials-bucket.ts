#!/usr/bin/env npx tsx
// ─────────────────────────────────────────────────────────────
// Kynovant — Coach Credentials Storage Bucket Setup
//
// Idempotently creates the private "coach-credentials" Supabase
// Storage bucket that lib/db/coach-credential-service.ts uploads
// proof documents to and generates signed URLs from. Mirrors
// scripts/setup-documents-bucket.ts exactly — same rationale, same
// caution.
//
// A SEPARATE bucket from "coaching-documents" (not a subfolder within
// it) because these are license/credential proof documents, not
// general coaching materials — different sensitivity, different
// retention expectations, and a mistake in one bucket's access
// pattern can't leak into the other's.
//
// This is infrastructure, not a database migration, so it isn't a
// drizzle/*.sql file — but it mutates shared, live Supabase project
// state just the same. It was NOT run against the shared project
// from this worktree. Run it once, before the credential submission
// feature is used:
//
//   set -a && source .env.local && set +a && npx tsx scripts/setup-coach-credentials-bucket.ts
//
// Safe to re-run — no-ops if the bucket already exists.
// ─────────────────────────────────────────────────────────────

import { createClient } from "@supabase/supabase-js";

const BUCKET_NAME = "coach-credentials";

// Mirrors coach-credential-service.ts's MAX_PROOF_DOCUMENT_SIZE_BYTES
// and ALLOWED_PROOF_MIME_TYPES — kept as literals here (rather than
// importing from a server-only module) so this script has zero
// app-code dependencies and can run standalone, same convention as
// setup-documents-bucket.ts. Setting allowedMimeTypes at the bucket
// level is defense-in-depth alongside the application-level allow-list
// and file-signature checks (coach-credential-service.ts) — even a
// bug in application code could not make Storage accept a disallowed
// type.
const MAX_PROOF_DOCUMENT_SIZE_BYTES = 10 * 1024 * 1024; // 10MB
const ALLOWED_PROOF_MIME_TYPES = ["application/pdf", "image/png", "image/jpeg", "image/webp"];

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
    fileSizeLimit: MAX_PROOF_DOCUMENT_SIZE_BYTES,
    allowedMimeTypes: ALLOWED_PROOF_MIME_TYPES,
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
