#!/usr/bin/env npx tsx
// ─────────────────────────────────────────────────────────────
// Catalyst OS — Golden Path Demo Client Seed
//
// Creates Emma Carter: a fully-populated demo athlete that exercises
// every Nutrition surface without manual data entry. Also serves as
// the canonical Catalyst demo account across all future modules.
//
// Usage:
//   source .env.local && \
//   DEMO_CLIENT_EMAIL=emma@example.com npx tsx scripts/seed-demo-client.ts
//
// Or set a default in .env.local:
//   DEMO_CLIENT_EMAIL=emma.carter@catalyst-demo.internal
//
// Requires:
//   DATABASE_URL_DIRECT  — postgres connection string (service role / superuser)
//   DEMO_CLIENT_EMAIL    — email of an existing auth.users + public.users client row
//
// Pre-flight:
//   The user must already exist in auth.users + public.users with role="client".
//   Create via Supabase Dashboard → Authentication → Invite User, or use
//   the Supabase admin CLI. This script does not create auth rows.
//
// Idempotency:
//   - Profile data: upserted (safe to re-run, updates in place)
//   - Body composition: replaces sentinel-tagged rows only
//   - Goals: replaces sentinel-tagged rows only
//   - Nutrition targets: deletes ALL existing targets for this client, then seeds fresh
//   - Notifications: deletes old demo notifications, seeds one fresh
//
// DEMO ONLY — do not run against production users.
// ─────────────────────────────────────────────────────────────

import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { eq, and, ilike } from "drizzle-orm";
import { calculate, FORMULA_VERSION } from "../lib/nutrition/calculator";
import {
  users,
  clientProfiles,
  coachingEnrollments,
} from "../lib/db/schema";
import {
  healthProfiles,
  bodyCompositionRecords,
  clientGoals,
} from "../lib/db/schema-profile";
import { clientNotifications } from "../lib/db/schema-notifications";

// ─────────────────────────────────────────────────────────────
// ENVIRONMENT
// ─────────────────────────────────────────────────────────────

const rawUrl = process.env.DATABASE_URL_DIRECT;
if (!rawUrl) {
  console.error("ERROR: DATABASE_URL_DIRECT is not set.");
  console.error("  Run: source .env.local && DEMO_CLIENT_EMAIL=you@example.com npx tsx scripts/seed-demo-client.ts");
  process.exit(1);
}

const DEMO_CLIENT_EMAIL = (process.env.DEMO_CLIENT_EMAIL ?? "").toLowerCase().trim();
if (!DEMO_CLIENT_EMAIL) {
  console.error("ERROR: DEMO_CLIENT_EMAIL is not set.");
  console.error("  Run: DEMO_CLIENT_EMAIL=you@example.com source .env.local && npx tsx scripts/seed-demo-client.ts");
  process.exit(1);
}

// ─────────────────────────────────────────────────────────────
// CONNECTIONS
// ─────────────────────────────────────────────────────────────

// postgres.js tagged-template client — used for raw SQL (nutrition table
// imports schema-nutrition.ts which has `import "server-only"`, so we
// bypass the module and write SQL directly).
const sql = postgres(rawUrl, { prepare: false });

// Drizzle ORM client — used for type-safe upserts on non-server-only tables.
const db = drizzle(sql);

// ─────────────────────────────────────────────────────────────
// CONSTANTS
// ─────────────────────────────────────────────────────────────

const DEMO_SENTINEL = "catalyst-golden-path-demo";

// Emma Carter — 29-year-old female, fat loss goal, moderately active.
// DOB chosen so she is 29 in 2026.
const DEMO = {
  fullName:       "Emma Carter",
  preferredName:  "Emma",
  dateOfBirth:    "1997-04-12", // 29 years old
  heightInches:   66,           // 5'6"
  weightLbs:      162,
  bodyFatPct:     29,
  biologicalSex:  "female" as const,
  activityLevel:  "moderately_active" as const,
  goalType:       "fat_loss" as const,
  goalDescription:
    "Lose approximately 20 lbs while preserving lean muscle. Target: 142 lbs at ~22% body fat.",
};

// ─────────────────────────────────────────────────────────────
// HELPERS
// ─────────────────────────────────────────────────────────────

function daysAgo(n: number): Date {
  return new Date(Date.now() - n * 24 * 60 * 60 * 1000);
}

function daysLater(n: number): string {
  const d = new Date(Date.now() + n * 24 * 60 * 60 * 1000);
  return d.toISOString().split("T")[0];
}

function localDateString(date: Date): string {
  return date.toISOString().split("T")[0];
}

// ─────────────────────────────────────────────────────────────
// MAIN
// ─────────────────────────────────────────────────────────────

async function main() {
  const today = localDateString(new Date());

  console.log("═══════════════════════════════════════════════════════════");
  console.log("  Catalyst OS — Golden Path Demo Client Seed");
  console.log("═══════════════════════════════════════════════════════════");
  console.log(`  Demo athlete: ${DEMO.fullName}`);
  console.log(`  Email:        ${DEMO_CLIENT_EMAIL}`);
  console.log(`  Date:         ${today}`);
  console.log("═══════════════════════════════════════════════════════════\n");

  // ── 1. Resolve demo client UUID ──────────────────────────────
  console.log("Step 1: Resolving demo client...");

  const [clientRow] = await db
    .select({ id: users.id, role: users.role, status: users.status })
    .from(users)
    .where(eq(users.normalizedEmail, DEMO_CLIENT_EMAIL));

  if (!clientRow) {
    console.error(`\n  ERROR: No public.users row found for "${DEMO_CLIENT_EMAIL}"`);
    console.error("\n  The auth.users + public.users rows must exist before running this script.");
    console.error("  To create the demo user:");
    console.error("    1. Open the Supabase Dashboard → Authentication → Users → Invite User");
    console.error(`    2. Enter email: ${DEMO_CLIENT_EMAIL}`);
    console.error("    3. After the row appears in auth.users, the Stripe/onboarding webhook");
    console.error("       normally creates the public.users row. For a dev-only user, insert");
    console.error("       manually into public.users with role='client', status='active'.");
    console.error("    4. Re-run this script.\n");
    await sql.end();
    process.exit(1);
  }

  const CLIENT_ID = clientRow.id;
  console.log(`  ✓ Found: id=${CLIENT_ID} role=${clientRow.role} status=${clientRow.status}`);

  if (clientRow.role !== "client") {
    console.error(`\n  ERROR: User has role="${clientRow.role}" — expected "client".`);
    console.error("  Do not run the demo seed against coach or admin accounts.");
    await sql.end();
    process.exit(1);
  }

  // ── 2. Find a coach to use as actor ─────────────────────────
  console.log("\nStep 2: Finding a coach user...");

  const [coachRow] = await db
    .select({ id: users.id, email: users.email })
    .from(users)
    .where(eq(users.role, "coach"))
    .limit(1);

  const COACH_ID: string | null = coachRow?.id ?? null;
  console.log(
    COACH_ID
      ? `  ✓ Coach: ${coachRow.email} (${COACH_ID})`
      : "  ℹ No coach found — coach_id will be null on targets (safe).",
  );

  // ── 3. Run the calculator ────────────────────────────────────
  console.log("\nStep 3: Running nutrition calculator...");

  const rec = calculate({
    heightInches: DEMO.heightInches,
    weightLbs:    DEMO.weightLbs,
    ageYears:     29,
    biologicalSex: DEMO.biologicalSex,
    activityLevel: DEMO.activityLevel,
    goalType:      DEMO.goalType,
  });

  console.log(`  BMR:           ${rec.bmr} kcal`);
  console.log(`  TDEE:          ${rec.tdee} kcal`);
  console.log(`  Adjustment:    ${rec.calorieAdjustment} kcal (fat_loss)`);
  console.log(`  Recommended:   ${rec.recommendedCalories} kcal`);
  console.log(`  Protein:       ${rec.recommendedProteinG}g`);
  console.log(`  Fat:           ${rec.recommendedFatG}g`);
  console.log(`  Carbs:         ${rec.recommendedCarbG}g`);
  console.log(`  Formula:       ${rec.formulaVersion}`);

  // ── 4. Upsert client_profiles ────────────────────────────────
  console.log("\nStep 4: Upserting client profile...");

  await db
    .insert(clientProfiles)
    .values({
      userId:        CLIENT_ID,
      fullName:      DEMO.fullName,
      preferredName: DEMO.preferredName,
      timezone:      "America/New_York",
      occupation:    "Marketing Director",
    })
    .onConflictDoUpdate({
      target: clientProfiles.userId,
      set: {
        fullName:      DEMO.fullName,
        preferredName: DEMO.preferredName,
        timezone:      "America/New_York",
        occupation:    "Marketing Director",
        updatedAt:     new Date(),
      },
    });

  console.log(`  ✓ client_profiles upserted`);

  // ── 5. Upsert health_profiles ────────────────────────────────
  console.log("\nStep 5: Upserting health profile...");

  await db
    .insert(healthProfiles)
    .values({
      clientId:       CLIENT_ID,
      heightInches:   String(DEMO.heightInches),
      biologicalSex:  DEMO.biologicalSex,
      dateOfBirth:    DEMO.dateOfBirth,
      sleepHoursAverage: "7.5",
      stressLevel:    4,
    })
    .onConflictDoUpdate({
      target: healthProfiles.clientId,
      set: {
        heightInches:      String(DEMO.heightInches),
        biologicalSex:     DEMO.biologicalSex,
        dateOfBirth:       DEMO.dateOfBirth,
        sleepHoursAverage: "7.5",
        stressLevel:       4,
        updatedAt:         new Date(),
      },
    });

  console.log(`  ✓ health_profiles upserted`);

  // ── 6. Body composition record ───────────────────────────────
  console.log("\nStep 6: Seeding body composition...");

  const leanMass = Math.round(DEMO.weightLbs * (1 - DEMO.bodyFatPct / 100) * 10) / 10;
  const fatMass  = Math.round(DEMO.weightLbs * (DEMO.bodyFatPct / 100) * 10) / 10;

  // Delete old sentinel-tagged body comp rows
  const existingBodyComp = await db
    .select({ id: bodyCompositionRecords.id })
    .from(bodyCompositionRecords)
    .where(
      and(
        eq(bodyCompositionRecords.clientId, CLIENT_ID),
        ilike(bodyCompositionRecords.notes, `%${DEMO_SENTINEL}%`),
      ),
    );

  for (const row of existingBodyComp) {
    await db.delete(bodyCompositionRecords)
      .where(eq(bodyCompositionRecords.id, row.id));
  }

  // Current measurement
  await db.insert(bodyCompositionRecords).values({
    clientId:        CLIENT_ID,
    recordedAt:      daysAgo(3),
    weightPounds:    String(DEMO.weightLbs),
    bodyFatPercent:  String(DEMO.bodyFatPct),
    leanMassPounds:  String(leanMass),
    fatMassPounds:   String(fatMass),
    source:          "coach_entry",
    notes:           `${DEMO_SENTINEL} — current measurement`,
  });

  // Starting measurement (4 months ago)
  await db.insert(bodyCompositionRecords).values({
    clientId:        CLIENT_ID,
    recordedAt:      daysAgo(120),
    weightPounds:    "171",
    bodyFatPercent:  "32",
    leanMassPounds:  "116.3",
    fatMassPounds:   "54.7",
    source:          "onboarding",
    notes:           `${DEMO_SENTINEL} — starting measurement`,
  });

  console.log(`  ✓ 2 body composition records seeded (current + starting)`);

  // ── 7. Active goal ───────────────────────────────────────────
  console.log("\nStep 7: Seeding client goal...");

  // Deactivate existing sentinel-tagged goals
  const existingGoals = await db
    .select({ id: clientGoals.id })
    .from(clientGoals)
    .where(
      and(
        eq(clientGoals.clientId, CLIENT_ID),
        ilike(clientGoals.description, `%${DEMO_SENTINEL}%`),
      ),
    );

  for (const row of existingGoals) {
    await db
      .update(clientGoals)
      .set({ status: "superseded", updatedAt: new Date() })
      .where(eq(clientGoals.id, row.id));
  }

  await db.insert(clientGoals).values({
    clientId:    CLIENT_ID,
    goalType:    DEMO.goalType,
    description: `${DEMO_SENTINEL} — ${DEMO.goalDescription}`,
    priority:    1,
    targetValue: "142",
    targetUnit:  "lbs",
    targetDate:  daysLater(180),
    status:      "active",
    startedAt:   localDateString(daysAgo(120)),
  });

  console.log(`  ✓ Goal seeded: fat_loss`);

  // ── 8. Coaching enrollment ───────────────────────────────────
  console.log("\nStep 8: Seeding coaching enrollment...");

  if (COACH_ID) {
    const existingEnrollment = await db
      .select({ id: coachingEnrollments.id })
      .from(coachingEnrollments)
      .where(
        and(
          eq(coachingEnrollments.clientId, CLIENT_ID),
          eq(coachingEnrollments.status, "active"),
        ),
      )
      .limit(1);

    if (existingEnrollment.length === 0) {
      await db.insert(coachingEnrollments).values({
        clientId:         CLIENT_ID,
        coachId:          COACH_ID,
        packageType:      "Standard",
        monthlyRateCents: 39700,
        status:           "active",
        startDate:        localDateString(daysAgo(120)),
        checkInDayOfWeek: 1, // Monday
        pipelineStage:    "Active Client",
      });
      console.log(`  ✓ Enrollment created`);
    } else {
      console.log(`  ✓ Active enrollment already exists (${existingEnrollment[0].id})`);
    }
  } else {
    console.log("  ⚠ No coach user found — skipping enrollment");
  }

  // ── 9. Nutrition targets ─────────────────────────────────────
  //
  // schema-nutrition.ts has `import "server-only"` which throws when
  // imported in a Node.js tsx script (not a Next.js server context).
  // We use postgres.js tagged-template SQL directly for this table.
  //
  console.log("\nStep 9: Seeding nutrition targets...");

  // Remove ALL existing nutrition targets for this demo client.
  // This is a dedicated demo account — it's safe to wipe and reseed.
  const deleted = await sql`
    DELETE FROM client_nutrition_targets
    WHERE client_id = ${CLIENT_ID}
    RETURNING id
  `;
  if (deleted.length > 0) {
    console.log(`  ✓ Removed ${deleted.length} previous target(s)`);
  }

  // Date anchors
  const archivedEffectiveDate = "2026-02-15";
  const archivedAt            = daysAgo(86);  // ~Feb → archived ~May 1
  const publishedEffectiveDate = "2026-06-15";
  const publishedAt           = daysAgo(41);  // ~June 15
  const draftEffectiveDate    = daysLater(6);  // next week

  // 9a. Archived (initial plan — conservative start)
  const [archived] = await sql`
    INSERT INTO client_nutrition_targets (
      client_id, coach_id, status, effective_date,
      calc_height_inches, calc_weight_lbs, calc_age_years,
      calc_biological_sex, calc_activity_level, calc_goal_type,
      rec_calories, rec_protein_g, rec_fat_g, rec_carb_g,
      rec_bmr, rec_tdee, rec_formula_version,
      calorie_target, protein_grams, fat_grams, carb_grams,
      adjustment_reason, coach_notes, internal_notes,
      archived_at, archived_by,
      created_at, updated_at
    ) VALUES (
      ${CLIENT_ID}, ${COACH_ID}, 'archived', ${archivedEffectiveDate},
      ${String(DEMO.heightInches)}, ${String(DEMO.weightLbs)}, ${29},
      ${DEMO.biologicalSex}, ${DEMO.activityLevel}, ${DEMO.goalType},
      ${rec.recommendedCalories}, ${rec.recommendedProteinG},
      ${rec.recommendedFatG}, ${rec.recommendedCarbG},
      ${rec.bmr}, ${rec.tdee}, ${FORMULA_VERSION},
      ${1950}, ${150}, ${60}, ${210},
      ${'Starting conservatively — will reduce after 4-week baseline when habits are established'},
      ${'Start here. Log protein first — hit 150g daily before worrying about the calorie target exactly. We\'ll tighten things up after your first check-in.'},
      ${`${DEMO_SENTINEL} — phase 1, archived`},
      ${archivedAt}, ${COACH_ID},
      ${daysAgo(120)}, ${archivedAt}
    )
    RETURNING id
  `;

  console.log(`  ✓ Archived target: ${archived.id}`);
  console.log(`    1950 kcal / 150g protein / 60g fat / 210g carbs (effective ${archivedEffectiveDate})`);

  // 9b. Published (current plan — matches recommendation exactly)
  const [published] = await sql`
    INSERT INTO client_nutrition_targets (
      client_id, coach_id, status, effective_date,
      calc_height_inches, calc_weight_lbs, calc_age_years,
      calc_biological_sex, calc_activity_level, calc_goal_type,
      rec_calories, rec_protein_g, rec_fat_g, rec_carb_g,
      rec_bmr, rec_tdee, rec_formula_version,
      calorie_target, protein_grams, fat_grams, carb_grams,
      coach_notes, internal_notes,
      published_at,
      created_at, updated_at
    ) VALUES (
      ${CLIENT_ID}, ${COACH_ID}, 'published', ${publishedEffectiveDate},
      ${String(DEMO.heightInches)}, ${String(DEMO.weightLbs)}, ${29},
      ${DEMO.biologicalSex}, ${DEMO.activityLevel}, ${DEMO.goalType},
      ${rec.recommendedCalories}, ${rec.recommendedProteinG},
      ${rec.recommendedFatG}, ${rec.recommendedCarbG},
      ${rec.bmr}, ${rec.tdee}, ${FORMULA_VERSION},
      ${rec.recommendedCalories}, ${rec.recommendedProteinG},
      ${rec.recommendedFatG}, ${rec.recommendedCarbG},
      ${'For the next two weeks, prioritize consistency over perfection. Hit your protein target first, spread meals evenly through the day, and don\'t worry if calories vary slightly from day to day. We\'re building sustainable habits while maintaining training performance.'},
      ${`${DEMO_SENTINEL} — phase 2, current published plan`},
      ${publishedAt},
      ${daysAgo(41)}, ${daysAgo(41)}
    )
    RETURNING id
  `;

  console.log(`  ✓ Published target: ${published.id}`);
  console.log(`    ${rec.recommendedCalories} kcal / ${rec.recommendedProteinG}g protein / ${rec.recommendedFatG}g fat / ${rec.recommendedCarbG}g carbs (effective ${publishedEffectiveDate})`);

  // 9c. Draft (upcoming — tightening deficit for phase 3)
  // Slightly lower calories, bumped protein, reduced carbs
  const draftCalories = rec.recommendedCalories - 75;
  const draftProtein  = rec.recommendedProteinG + 5;
  const draftFat      = rec.recommendedFatG - 2;
  const draftCarbs    = Math.max(
    0,
    Math.round((draftCalories - draftProtein * 4 - draftFat * 9) / 4),
  );

  const [draft] = await sql`
    INSERT INTO client_nutrition_targets (
      client_id, coach_id, status, effective_date,
      calc_height_inches, calc_weight_lbs, calc_age_years,
      calc_biological_sex, calc_activity_level, calc_goal_type,
      rec_calories, rec_protein_g, rec_fat_g, rec_carb_g,
      rec_bmr, rec_tdee, rec_formula_version,
      calorie_target, protein_grams, fat_grams, carb_grams,
      adjustment_reason, coach_notes, internal_notes,
      created_at, updated_at
    ) VALUES (
      ${CLIENT_ID}, ${COACH_ID}, 'draft', ${draftEffectiveDate},
      ${String(DEMO.heightInches)}, ${String(DEMO.weightLbs)}, ${29},
      ${DEMO.biologicalSex}, ${DEMO.activityLevel}, ${DEMO.goalType},
      ${rec.recommendedCalories}, ${rec.recommendedProteinG},
      ${rec.recommendedFatG}, ${rec.recommendedCarbG},
      ${rec.bmr}, ${rec.tdee}, ${FORMULA_VERSION},
      ${draftCalories}, ${draftProtein}, ${draftFat}, ${draftCarbs},
      ${'Tightening deficit for phase 3. Compliance on protein has been excellent. Reducing carbs slightly while bumping protein to protect lean mass.'},
      ${'You\'ve built the habits — now we dial it in. Same priority order: protein first, then fill with carbs around your training sessions. The lower calorie target shouldn\'t feel dramatic.'},
      ${`${DEMO_SENTINEL} — phase 3, pending review`},
      ${new Date()}, ${new Date()}
    )
    RETURNING id
  `;

  console.log(`  ✓ Draft target:     ${draft.id}`);
  console.log(`    ${draftCalories} kcal / ${draftProtein}g protein / ${draftFat}g fat / ${draftCarbs}g carbs (effective ${draftEffectiveDate})`);

  // ── 10. Notification ─────────────────────────────────────────
  console.log("\nStep 10: Seeding notification...");

  // Remove old demo notifications for this client
  await sql`
    DELETE FROM client_notifications
    WHERE client_id = ${CLIENT_ID}
      AND event_type = 'nutrition_updated'
      AND body ILIKE ${'%' + DEMO_SENTINEL + '%'}
  `;

  await db.insert(clientNotifications).values({
    clientId:     CLIENT_ID,
    actorId:      COACH_ID ?? undefined,
    eventType:    "nutrition_updated",
    resourceType: "nutrition_target",
    resourceId:   published.id,
    title:        "Your nutrition targets have been updated.",
    body:         `${DEMO_SENTINEL} — Your coach has published Phase 2 daily targets. Open Nutrition to review them.`,
    readAt:       daysAgo(38), // already read
  });

  console.log(`  ✓ nutrition_updated notification seeded`);

  // ── Summary ──────────────────────────────────────────────────

  console.log("\n═══════════════════════════════════════════════════════════");
  console.log("  SEED COMPLETE");
  console.log("═══════════════════════════════════════════════════════════");
  console.log(`\n  Demo Client`);
  console.log(`    Name:     ${DEMO.fullName}`);
  console.log(`    Email:    ${DEMO_CLIENT_EMAIL}`);
  console.log(`    ID:       ${CLIENT_ID}`);

  console.log(`\n  Calculator (Mifflin-St Jeor v1)`);
  console.log(`    Height:   ${DEMO.heightInches}" (5'6")`);
  console.log(`    Weight:   ${DEMO.weightLbs} lbs  |  Age: 29  |  Sex: Female`);
  console.log(`    Activity: Moderately Active  |  Goal: Fat Loss`);
  console.log(`    BMR:      ${rec.bmr} kcal`);
  console.log(`    TDEE:     ${rec.tdee} kcal`);
  console.log(`    Adj:      ${rec.calorieAdjustment} kcal`);
  console.log(`    Rec:      ${rec.recommendedCalories} kcal`);

  console.log(`\n  Nutrition Targets`);
  console.log(`    ARCHIVED  ${archivedEffectiveDate}  1950 kcal / 150g / 60g / 210g`);
  console.log(`    PUBLISHED ${publishedEffectiveDate}  ${rec.recommendedCalories} kcal / ${rec.recommendedProteinG}g / ${rec.recommendedFatG}g / ${rec.recommendedCarbG}g`);
  console.log(`    DRAFT     ${draftEffectiveDate}  ${draftCalories} kcal / ${draftProtein}g / ${draftFat}g / ${draftCarbs}g`);

  console.log(`\n  Review the experience`);
  console.log(`    Coach:  /hq/clients/${CLIENT_ID}/nutrition`);
  console.log(`    Client: /portal/nutrition  (log in as ${DEMO_CLIENT_EMAIL})`);

  console.log(`\n  This seed is repeatable. Re-run anytime to reset demo data.`);
  console.log("═══════════════════════════════════════════════════════════\n");

  await sql.end();
}

main().catch(async (err) => {
  console.error("\nSeed failed:", err.message ?? err);
  await sql.end();
  process.exit(1);
});
