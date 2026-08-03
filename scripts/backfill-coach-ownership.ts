#!/usr/bin/env npx tsx
// ─────────────────────────────────────────────────────────────
// Catalyst OS — Coach Ownership Backfill
//
// Part of the coach-tenant-isolation remediation
// (docs/catalyst-os-scale-readiness-audit.md, "Critical Before Launch").
//
// Problem this solves:
//   Every coach-facing read/write is now scoped by coaching_enrollments
//   (client ownership) and program_templates/workout_templates.createdBy
//   (template ownership). Any pre-existing client with zero enrollment
//   rows, or any pre-existing template with a null createdBy, becomes
//   invisible to every coach the moment that scoping goes live — admin
//   is unaffected (admin bypasses scoping entirely), but a real coach
//   would never see that data again without this backfill.
//
// Why this requires an explicit --coach-email, not a default:
//   As of this script being written, this database has ZERO role='coach'
//   users — only role='admin'. There is no way to determine "who coach #1
//   is" from the data itself; that is a real-world identity decision, not
//   something this script can infer. Pass the coach who should inherit
//   this pre-existing data explicitly. If that coach account doesn't
//   exist yet, create it first (see docs/roadmaps/saas-evolution/
//   kynovant-saas-evolution-roadmap.md Phase 1's provisioning runbook).
//
// Safety:
//   - Dry-run by default. Nothing is written unless --apply is passed.
//   - Idempotent: only touches clients with ZERO existing enrollment
//     rows, and only templates with a null createdBy — running this
//     twice against the same coach is a safe no-op the second time.
//   - Single transaction in --apply mode: either everything below
//     commits, or nothing does.
//   - packageType/monthlyRateCents on the created coaching_enrollments
//     rows are placeholders ("Standard" / 0) — those columns describe
//     Kynovant's own consumer coaching packages and have no defined
//     meaning yet for an independent coach's own client roster. Flagged
//     here for the same reason it's flagged in
//     app/api/internal/clients/route.ts's client-invite path.
//
// Usage:
//   set -a && source .env.local && set +a
//   npx tsx scripts/backfill-coach-ownership.ts --coach-email=coach@example.com          # dry run
//   npx tsx scripts/backfill-coach-ownership.ts --coach-email=coach@example.com --apply   # writes
// ─────────────────────────────────────────────────────────────

import postgres from "postgres";

// ── CLI args ─────────────────────────────────────────────────

const args = process.argv.slice(2);
const apply = args.includes("--apply");
const emailArg = args.find((a) => a.startsWith("--coach-email="));
const coachEmail = emailArg?.slice("--coach-email=".length).trim().toLowerCase();

if (!coachEmail) {
  console.error(
    "Usage: npx tsx scripts/backfill-coach-ownership.ts --coach-email=<email> [--apply]",
  );
  console.error("(omit --apply for a dry run — nothing is written)");
  process.exit(1);
}

// ── Environment ───────────────────────────────────────────────

const dbUrl = process.env.DATABASE_URL_DIRECT ?? process.env.DATABASE_URL;
if (!dbUrl) {
  console.error("DATABASE_URL_DIRECT (or DATABASE_URL) is not set.");
  console.error("Load your .env.local before running this script.");
  process.exit(1);
}

const sql = postgres(dbUrl, { prepare: false });

async function main(coachEmail: string) {
  console.log(`Mode: ${apply ? "APPLY (will write)" : "DRY RUN (no writes)"}`);
  console.log(`Target coach: ${coachEmail}`);
  console.log("");

  // ── Resolve the coach — must already exist with role='coach' ────
  const coachRows = await sql<{ id: string; role: string; status: string }[]>`
    SELECT id, role, status FROM users WHERE normalized_email = ${coachEmail} LIMIT 1
  `;
  const coach = coachRows[0];

  if (!coach) {
    console.error(`No user found with email ${coachEmail}. Nothing to do.`);
    console.error("This script never creates a coach account — provision one first.");
    process.exit(1);
  }
  if (coach.role !== "coach") {
    console.error(
      `User ${coachEmail} has role='${coach.role}', not 'coach'. Refusing to guess — ` +
        `set role='coach' deliberately first if that's really intended.`,
    );
    process.exit(1);
  }
  console.log(`Resolved coach: ${coach.id} (role=${coach.role}, status=${coach.status})`);
  console.log("");

  // ── Orphaned clients: role='client', zero coaching_enrollments rows ──
  const orphanedClients = await sql<{ id: string; email: string }[]>`
    SELECT u.id, u.email
    FROM users u
    WHERE u.role = 'client'
      AND NOT EXISTS (
        SELECT 1 FROM coaching_enrollments ce WHERE ce.client_id = u.id
      )
    ORDER BY u.created_at
  `;

  console.log(`Clients with zero enrollment rows (would become owned by ${coachEmail}):`);
  if (orphanedClients.length === 0) {
    console.log("  (none)");
  } else {
    for (const c of orphanedClients) console.log(`  - ${c.email} (${c.id})`);
  }
  console.log("");

  // ── Templates with no author ──────────────────────────────────
  const orphanedProgramTemplates = await sql<{ id: string; name: string }[]>`
    SELECT id, name FROM program_templates WHERE created_by IS NULL ORDER BY created_at
  `;
  const orphanedWorkoutTemplates = await sql<{ id: string; name: string }[]>`
    SELECT id, name FROM workout_templates WHERE created_by IS NULL ORDER BY created_at
  `;

  console.log(`Program templates with no createdBy (would be attributed to ${coachEmail}):`);
  if (orphanedProgramTemplates.length === 0) {
    console.log("  (none)");
  } else {
    for (const t of orphanedProgramTemplates) console.log(`  - ${t.name} (${t.id})`);
  }
  console.log("");

  console.log(`Workout templates with no createdBy (would be attributed to ${coachEmail}):`);
  if (orphanedWorkoutTemplates.length === 0) {
    console.log("  (none)");
  } else {
    for (const t of orphanedWorkoutTemplates) console.log(`  - ${t.name} (${t.id})`);
  }
  console.log("");

  const totalChanges =
    orphanedClients.length + orphanedProgramTemplates.length + orphanedWorkoutTemplates.length;

  if (totalChanges === 0) {
    console.log("Nothing to backfill. Exiting.");
    await sql.end();
    return;
  }

  if (!apply) {
    console.log(`Dry run complete. ${totalChanges} row(s) would change. Re-run with --apply to write.`);
    await sql.end();
    return;
  }

  console.log(`Applying ${totalChanges} change(s) in a single transaction...`);

  await sql.begin(async (tx) => {
    if (orphanedClients.length > 0) {
      const clientIds = orphanedClients.map((c) => c.id);
      await tx`
        INSERT INTO coaching_enrollments (client_id, coach_id, package_type, monthly_rate_cents, status)
        SELECT id, ${coach.id}, 'Standard', 0, 'active'
        FROM users
        WHERE id = ANY(${clientIds})
      `;
    }
    if (orphanedProgramTemplates.length > 0) {
      await tx`
        UPDATE program_templates SET created_by = ${coach.id}, updated_at = now()
        WHERE created_by IS NULL
      `;
    }
    if (orphanedWorkoutTemplates.length > 0) {
      await tx`
        UPDATE workout_templates SET created_by = ${coach.id}, updated_at = now()
        WHERE created_by IS NULL
      `;
    }
  });

  console.log("Done.");
  await sql.end();
}

main(coachEmail).catch((err) => {
  console.error("Backfill failed:", err instanceof Error ? err.message : err);
  process.exit(1);
});
