#!/usr/bin/env npx tsx
// ─────────────────────────────────────────────────────────────
// Catalyst OS — Check-In Progress Photos Storage Bucket Setup
//
// Idempotently creates the private "check-in-photos" Supabase Storage
// bucket that lib/db/check-in-photo-service.ts uploads to and
// generates signed URLs from. Mirrors
// scripts/setup-documents-bucket.ts's structure exactly.
//
// This is infrastructure, not a database migration, so it isn't a
// drizzle/*.sql file — but it carries the same caution as one: it
// mutates shared, live Supabase project state.
//
// NOT RUN against the shared project from this isolated worktree, and
// must not be run until this pass is reviewed and approved. Once
// approved, run once, against STAGING first:
//
//   set -a && source .env.staging.local && set +a && npx tsx scripts/assert-staging-db.ts && \
//     npx tsx scripts/setup-check-in-photos-bucket.ts
//
// Safe to re-run — no-ops if the bucket already exists.
//
// Deliberately a SEPARATE bucket from "coaching-documents" and
// "coach-credentials" — progress photos are a distinct sensitivity
// class (client body photos, not coaching materials or license
// proofs), kept in their own namespace so a bucket-level policy
// mistake on one domain can't leak into another.
// ─────────────────────────────────────────────────────────────

import { createClient } from "@supabase/supabase-js";

const BUCKET_NAME = "check-in-photos";

// Mirrors check-in-photo-service.ts's MAX_PHOTO_SIZE_BYTES /
// ALLOWED_PHOTO_MIME_TYPES — kept as literals here (rather than
// importing from a server-only module) so this script has zero
// app-code dependencies and can run standalone.
const MAX_PHOTO_SIZE_BYTES = 15 * 1024 * 1024;
const ALLOWED_PHOTO_MIME_TYPES = ["image/png", "image/jpeg", "image/webp"];

async function main() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !serviceRoleKey) {
    console.error("NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY are not set.");
    console.error("Load your env file before running this script.");
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
    fileSizeLimit: MAX_PHOTO_SIZE_BYTES,
    allowedMimeTypes: ALLOWED_PHOTO_MIME_TYPES, // bucket-level defense-in-depth alongside the app-layer allow-list + magic-byte check
  });

  if (createError) {
    console.error(`Failed to create bucket "${BUCKET_NAME}":`, createError.message);
    process.exit(1);
  }

  console.log(`✓ Created private bucket "${BUCKET_NAME}" (max ${MAX_PHOTO_SIZE_BYTES / (1024 * 1024)}MB, ${ALLOWED_PHOTO_MIME_TYPES.join("/")}).`);
}

main().catch((err) => {
  console.error("Setup failed:", err instanceof Error ? err.message : err);
  process.exit(1);
});
