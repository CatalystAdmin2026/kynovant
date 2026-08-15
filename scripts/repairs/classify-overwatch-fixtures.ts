import { sql } from "drizzle-orm";
import { getDb } from "@/lib/db/client";

const FIXTURE_PATTERNS = [
  "program-gen-test-coach-%@isolation-test.invalid",
  "messaging-test-coach-%@isolation-test.invalid",
  "isolation-test-coach-%@isolation-test.invalid",
  "review-triage-test-coach-%@isolation-test.invalid",
  "candidate-test-coach-%@isolation-test.invalid",
] as const;

const apply = process.argv.includes("--apply");

async function main() {
  const db = getDb();
  const rows = await db.execute<{
    id: string;
    email: string;
    normalized_email: string;
    matched_pattern: string;
  }>(sql`
    select
      u.id,
      u.email,
      u.normalized_email,
      pattern.pattern as matched_pattern
    from users u
    cross join unnest(${FIXTURE_PATTERNS}::text[]) as pattern(pattern)
    left join internal_account_flags f on f.user_id = u.id
    where u.role = 'coach'
      and f.user_id is null
      and u.normalized_email like pattern.pattern
    order by u.normalized_email
  `);

  console.log(`Overwatch fixture classifier ${apply ? "APPLY" : "DRY RUN"}`);
  console.log(`Patterns: ${FIXTURE_PATTERNS.join(", ")}`);
  console.table(rows);

  if (!apply) {
    console.log("No rows updated. Re-run with --apply after reviewing the matched accounts.");
    return;
  }

  const updated = await db.execute<{ user_id: string }>(sql`
    insert into internal_account_flags (user_id, classification, reason, reviewed_at)
    select distinct
      u.id,
      'test_fixture'::account_classification,
      'Reviewed legacy Overwatch fixture backfill: normalized_email matched explicit test-coach pattern.',
      now()
    from users u
    cross join unnest(${FIXTURE_PATTERNS}::text[]) as pattern(pattern)
    left join internal_account_flags f on f.user_id = u.id
    where u.role = 'coach'
      and f.user_id is null
      and u.normalized_email like pattern.pattern
    returning user_id
  `);

  console.log(`Classified ${updated.length} fixture account(s).`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
