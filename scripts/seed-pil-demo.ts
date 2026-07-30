#!/usr/bin/env npx tsx
// ─────────────────────────────────────────────────────────────
// Catalyst OS — PIL Demo Programs Seed
//
// Creates two program templates specifically designed to showcase
// Catalyst Insights during demos:
//
//   1. "Demo — Overloaded Split"  → triggers multiple findings
//      • RECOVERY_CONSECUTIVE (hamstrings + quads trained back-to-back)
//      • REDUNDANCY_PATTERN_MUSCLE (Back Squat + Leg Press)
//      • VOLUME_HIGH_DIRECT (10+ sets hamstrings per session)
//      • MOVEMENT_PUSH_PULL_H (push_horizontal with no pull_horizontal)
//      • VOLUME_ZERO_DIRECT_MAJOR (lats never trained)
//
//   2. "Demo — Balanced Performance" → clean or near-clean audit
//      • Proper push/pull balance (horizontal + vertical)
//      • 2-day recovery gaps for all major muscles
//      • Appropriate per-session volume
//      • No redundant exercise pairs
//
// Usage:
//   source .env.local && npx tsx scripts/seed-pil-demo.ts
//
// Idempotency:
//   Cleans up sentinel-tagged templates before reseeding.
//   Safe to run multiple times.
// ─────────────────────────────────────────────────────────────

import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { eq, inArray, ilike } from "drizzle-orm";
import {
  programTemplates,
  workoutTemplates,
} from "../lib/db/schema";
import {
  programWeeks,
  programWeekDays,
} from "../lib/db/schema-program";
import {
  workoutTemplateSections,
  workoutTemplateExercises,
  exercises,
} from "../lib/db/schema-exercise";

// ─── Environment ──────────────────────────────────────────────────────────────

const rawUrl = process.env.DATABASE_URL_DIRECT;
if (!rawUrl) {
  console.error("ERROR: DATABASE_URL_DIRECT is not set.");
  process.exit(1);
}

const sql = postgres(rawUrl, { prepare: false });
const db = drizzle(sql);

const SENTINEL = "catalyst-pil-demo";

// ─── Types ────────────────────────────────────────────────────────────────────

interface ExPrescription {
  exerciseName: string;
  exerciseId?: string;
  id?: string;
  orderIndex: number;
  sets: number;
  repsMin: number | null;
  repsMax: number | null;
  durationSeconds: number | null;
  restSeconds: number | null;
  targetRpe: string | null;
  coachNotes: string | null;
}

interface SectionDef {
  name: string;
  sectionType: string;
  orderIndex: number;
  estimatedMinutes: number | null;
  id?: string;
  exercises: ExPrescription[];
}

interface TemplateDef {
  name: string;
  slug: string;
  description: string;
  estimatedMinutes: number;
  id?: string;
  sections: SectionDef[];
}

// ─────────────────────────────────────────────────────────────
// BLUEPRINT DEFINITIONS — Program 1: Overloaded Split
// ─────────────────────────────────────────────────────────────
//
// Blueprint A: "Strength Lower" — deliberately overloaded lower body.
//
//   Intentional issues:
//   • Back Squat + Leg Press = same movement_pattern (squat_bilateral) +
//     same primary_muscle_group (quadriceps) → REDUNDANCY_PATTERN_MUSCLE
//   • 5 sets RDL + 5 sets Seated Leg Curl = 10 direct hamstring sets
//     → VOLUME_HIGH_DIRECT for hamstrings (threshold ≥10)
//   • 5 sets Back Squat + 5 sets Leg Press = 10 direct quadricep sets
//     → VOLUME_HIGH_DIRECT for quadriceps
//
const OVERLOADED_LOWER: TemplateDef = {
  name: `${SENTINEL} — Strength Lower`,
  slug: "pil-demo-strength-lower",
  description: "Demo blueprint: overloaded lower body with redundant quad exercises and excessive hamstring volume.",
  estimatedMinutes: 70,
  sections: [
    {
      name: "Activation",
      sectionType: "activation",
      orderIndex: 0,
      estimatedMinutes: 8,
      exercises: [
        {
          exerciseName: "Banded Glute Walk",
          orderIndex: 0,
          sets: 2,
          repsMin: 15,
          repsMax: 20,
          durationSeconds: null,
          restSeconds: 45,
          targetRpe: "4",
          coachNotes: "Activate glutes and abductors before loading.",
        },
        {
          exerciseName: "Plank",
          orderIndex: 1,
          sets: 2,
          repsMin: null,
          repsMax: null,
          durationSeconds: 30,
          restSeconds: 45,
          targetRpe: "5",
          coachNotes: null,
        },
      ],
    },
    {
      name: "Main Work",
      sectionType: "main_lift",
      orderIndex: 1,
      estimatedMinutes: 62,
      exercises: [
        {
          exerciseName: "Romanian Deadlift",
          orderIndex: 0,
          sets: 5,
          repsMin: 6,
          repsMax: 8,
          durationSeconds: null,
          restSeconds: 180,
          targetRpe: "8",
          coachNotes: "Control the descent. Feel the hamstring stretch.",
        },
        {
          exerciseName: "Back Squat",
          orderIndex: 1,
          sets: 5,
          repsMin: 6,
          repsMax: 8,
          durationSeconds: null,
          restSeconds: 180,
          targetRpe: "8",
          coachNotes: "Drive knees out. Brace hard throughout.",
        },
        {
          exerciseName: "Leg Press",
          orderIndex: 2,
          sets: 5,
          repsMin: 8,
          repsMax: 12,
          durationSeconds: null,
          restSeconds: 120,
          targetRpe: "8",
          coachNotes: "Full range. Same quad stimulus as squat — this creates redundancy.",
        },
        {
          exerciseName: "Seated Leg Curl",
          orderIndex: 3,
          sets: 5,
          repsMin: 10,
          repsMax: 12,
          durationSeconds: null,
          restSeconds: 90,
          targetRpe: "8",
          coachNotes: null,
        },
        {
          exerciseName: "Hip Thrust",
          orderIndex: 4,
          sets: 3,
          repsMin: 12,
          repsMax: 15,
          durationSeconds: null,
          restSeconds: 90,
          targetRpe: "7",
          coachNotes: null,
        },
      ],
    },
  ],
};

// Blueprint B: "Push Upper Only" — no horizontal or vertical pulls.
//
//   Intentional issues:
//   • 5 sets Dumbbell Bench Press = push_horizontal, no pull_horizontal exercises
//     → MOVEMENT_PUSH_PULL_H (horizontal push/pull imbalance)
//   • No lat or upper_back exercises across the entire program
//     → VOLUME_ZERO_DIRECT_MAJOR for lats and upper_back
//
const PUSH_UPPER_ONLY: TemplateDef = {
  name: `${SENTINEL} — Push Upper Only`,
  slug: "pil-demo-push-upper-only",
  description: "Demo blueprint: push-only upper body. No pulling exercises. Demonstrates push/pull imbalance finding.",
  estimatedMinutes: 55,
  sections: [
    {
      name: "Main Work",
      sectionType: "main_lift",
      orderIndex: 0,
      estimatedMinutes: 55,
      exercises: [
        {
          exerciseName: "Dumbbell Bench Press",
          orderIndex: 0,
          sets: 5,
          repsMin: 6,
          repsMax: 10,
          durationSeconds: null,
          restSeconds: 150,
          targetRpe: "8",
          coachNotes: "Primary push movement. No horizontal pulling to balance this.",
        },
        {
          exerciseName: "Cable Lateral Raise",
          orderIndex: 1,
          sets: 4,
          repsMin: 12,
          repsMax: 15,
          durationSeconds: null,
          restSeconds: 60,
          targetRpe: "7",
          coachNotes: null,
        },
        {
          exerciseName: "Cable Triceps Pressdown",
          orderIndex: 2,
          sets: 4,
          repsMin: 12,
          repsMax: 15,
          durationSeconds: null,
          restSeconds: 60,
          targetRpe: "7",
          coachNotes: null,
        },
        {
          exerciseName: "Dumbbell Curl",
          orderIndex: 3,
          sets: 3,
          repsMin: 12,
          repsMax: 15,
          durationSeconds: null,
          restSeconds: 60,
          targetRpe: "7",
          coachNotes: null,
        },
      ],
    },
  ],
};

// ─────────────────────────────────────────────────────────────
// BLUEPRINT DEFINITIONS — Program 2: Balanced Performance
// ─────────────────────────────────────────────────────────────
//
// Blueprint A: "Full Body A" — push/pull balanced, appropriate volume.
//
//   Design choices:
//   • Dumbbell Bench Press (push_horizontal) + Chest-Supported Row (pull_horizontal)
//     → horizontal balance satisfied
//   • Lat Pulldown (pull_vertical) included
//     → vertical pulling present
//   • 3 sets each → per-session volume well under 10-set threshold
//
const BALANCED_FULL_BODY_A: TemplateDef = {
  name: `${SENTINEL} — Balanced Full Body A`,
  slug: "pil-demo-balanced-a",
  description: "Demo blueprint: full body with proper push/pull balance. Push horizontal + horizontal + vertical pull included.",
  estimatedMinutes: 65,
  sections: [
    {
      name: "Activation",
      sectionType: "activation",
      orderIndex: 0,
      estimatedMinutes: 8,
      exercises: [
        {
          exerciseName: "Banded Glute Walk",
          orderIndex: 0,
          sets: 2,
          repsMin: 15,
          repsMax: 20,
          durationSeconds: null,
          restSeconds: 45,
          targetRpe: "4",
          coachNotes: null,
        },
        {
          exerciseName: "Plank",
          orderIndex: 1,
          sets: 2,
          repsMin: null,
          repsMax: null,
          durationSeconds: 30,
          restSeconds: 45,
          targetRpe: "4",
          coachNotes: null,
        },
      ],
    },
    {
      name: "Main Work",
      sectionType: "main_lift",
      orderIndex: 1,
      estimatedMinutes: 57,
      exercises: [
        {
          exerciseName: "Romanian Deadlift",
          orderIndex: 0,
          sets: 3,
          repsMin: 8,
          repsMax: 10,
          durationSeconds: null,
          restSeconds: 150,
          targetRpe: "7",
          coachNotes: null,
        },
        {
          exerciseName: "Dumbbell Bench Press",
          orderIndex: 1,
          sets: 3,
          repsMin: 8,
          repsMax: 12,
          durationSeconds: null,
          restSeconds: 120,
          targetRpe: "7",
          coachNotes: null,
        },
        {
          exerciseName: "Chest-Supported Dumbbell Row",
          orderIndex: 2,
          sets: 3,
          repsMin: 10,
          repsMax: 14,
          durationSeconds: null,
          restSeconds: 90,
          targetRpe: "7",
          coachNotes: "Balances the horizontal pressing with equal horizontal pulling.",
        },
        {
          exerciseName: "Lat Pulldown",
          orderIndex: 3,
          sets: 3,
          repsMin: 10,
          repsMax: 12,
          durationSeconds: null,
          restSeconds: 90,
          targetRpe: "7",
          coachNotes: null,
        },
        {
          exerciseName: "Hip Thrust",
          orderIndex: 4,
          sets: 3,
          repsMin: 12,
          repsMax: 15,
          durationSeconds: null,
          restSeconds: 90,
          targetRpe: "7",
          coachNotes: null,
        },
        {
          exerciseName: "Cable Lateral Raise",
          orderIndex: 5,
          sets: 2,
          repsMin: 12,
          repsMax: 15,
          durationSeconds: null,
          restSeconds: 60,
          targetRpe: "6",
          coachNotes: null,
        },
      ],
    },
  ],
};

// Blueprint B: "Full Body B" — hip hinge / pull focus variation.
const BALANCED_FULL_BODY_B: TemplateDef = {
  name: `${SENTINEL} — Balanced Full Body B`,
  slug: "pil-demo-balanced-b",
  description: "Demo blueprint: full body variation. Hip hinge and pulling emphasis. Complements Full Body A.",
  estimatedMinutes: 65,
  sections: [
    {
      name: "Activation",
      sectionType: "activation",
      orderIndex: 0,
      estimatedMinutes: 8,
      exercises: [
        {
          exerciseName: "Banded Glute Walk",
          orderIndex: 0,
          sets: 2,
          repsMin: 15,
          repsMax: 20,
          durationSeconds: null,
          restSeconds: 45,
          targetRpe: "4",
          coachNotes: null,
        },
      ],
    },
    {
      name: "Main Work",
      sectionType: "main_lift",
      orderIndex: 1,
      estimatedMinutes: 57,
      exercises: [
        {
          exerciseName: "Hip Thrust",
          orderIndex: 0,
          sets: 4,
          repsMin: 10,
          repsMax: 12,
          durationSeconds: null,
          restSeconds: 90,
          targetRpe: "7",
          coachNotes: null,
        },
        {
          exerciseName: "Bulgarian Split Squat",
          orderIndex: 1,
          sets: 3,
          repsMin: 8,
          repsMax: 12,
          durationSeconds: null,
          restSeconds: 90,
          targetRpe: "7",
          coachNotes: null,
        },
        {
          exerciseName: "Chest-Supported Dumbbell Row",
          orderIndex: 2,
          sets: 4,
          repsMin: 8,
          repsMax: 12,
          durationSeconds: null,
          restSeconds: 90,
          targetRpe: "7",
          coachNotes: null,
        },
        {
          exerciseName: "Dumbbell Bench Press",
          orderIndex: 3,
          sets: 3,
          repsMin: 8,
          repsMax: 12,
          durationSeconds: null,
          restSeconds: 90,
          targetRpe: "7",
          coachNotes: null,
        },
        {
          exerciseName: "Seated Leg Curl",
          orderIndex: 4,
          sets: 3,
          repsMin: 10,
          repsMax: 12,
          durationSeconds: null,
          restSeconds: 75,
          targetRpe: "7",
          coachNotes: null,
        },
        {
          exerciseName: "Dumbbell Curl",
          orderIndex: 5,
          sets: 2,
          repsMin: 12,
          repsMax: 15,
          durationSeconds: null,
          restSeconds: 60,
          targetRpe: "6",
          coachNotes: null,
        },
      ],
    },
  ],
};

// ─────────────────────────────────────────────────────────────
// MAIN
// ─────────────────────────────────────────────────────────────

async function main() {
  console.log("═══════════════════════════════════════════════════════════");
  console.log("  Catalyst OS — PIL Demo Programs Seed");
  console.log("═══════════════════════════════════════════════════════════\n");

  // ── 1. Resolve exercises ──────────────────────────────────────────
  console.log("Step 1: Resolving exercises...");
  const neededNames = [
    "Romanian Deadlift", "Back Squat", "Leg Press", "Seated Leg Curl", "Hip Thrust",
    "Bulgarian Split Squat", "Dumbbell Bench Press", "Chest-Supported Dumbbell Row",
    "Lat Pulldown", "Cable Lateral Raise", "Cable Triceps Pressdown", "Dumbbell Curl",
    "Plank", "Banded Glute Walk",
  ];

  const exerciseRows = await db
    .select({ id: exercises.id, name: exercises.name })
    .from(exercises)
    .where(inArray(exercises.name, neededNames));

  const exerciseMap = new Map(exerciseRows.map((r) => [r.name, r.id]));

  let missing = false;
  for (const name of neededNames) {
    if (!exerciseMap.has(name)) {
      console.warn(`  ⚠ Missing exercise: "${name}" — run seed-exercises.ts first`);
      missing = true;
    }
  }
  if (missing) {
    console.error("\n  ERROR: Run seed-exercises.ts before this script.");
    await sql.end();
    process.exit(1);
  }
  console.log(`  ✓ All ${neededNames.length} exercises resolved`);

  // ── 2. Clean up previous PIL demo data ───────────────────────────
  console.log("\nStep 2: Cleaning up previous PIL demo data...");
  await cleanupPilDemo();

  // ── 3. Create Program 1: Overloaded Split ────────────────────────
  console.log("\nStep 3: Creating program 1 — Overloaded Split...");
  await createOverloadedSplitProgram(exerciseMap);
  console.log("  ✓ Program 1 complete");

  // ── 4. Create Program 2: Balanced Performance ────────────────────
  console.log("\nStep 4: Creating program 2 — Balanced Performance...");
  await createBalancedProgram(exerciseMap);
  console.log("  ✓ Program 2 complete");

  // ── Summary ───────────────────────────────────────────────────────
  console.log("\n═══════════════════════════════════════════════════════════");
  console.log("  SEED COMPLETE");
  console.log("═══════════════════════════════════════════════════════════");
  console.log("\n  Program 1: Demo — Overloaded Split");
  console.log("    Expected findings: RECOVERY_CONSECUTIVE, REDUNDANCY_PATTERN_MUSCLE,");
  console.log("    VOLUME_HIGH_DIRECT (hamstrings + quads), MOVEMENT_PUSH_PULL_H,");
  console.log("    VOLUME_ZERO_DIRECT_MAJOR (lats)");
  console.log("\n  Program 2: Demo — Balanced Performance");
  console.log("    Expected findings: minimal to none (clean audit)");
  console.log("\n  Open both programs in HQ → Programs, then click Run Insights.");
  console.log("═══════════════════════════════════════════════════════════\n");

  await sql.end();
}

// ─────────────────────────────────────────────────────────────
// CLEANUP
// ─────────────────────────────────────────────────────────────

async function cleanupPilDemo() {
  const demoPTs = await db
    .select({ id: programTemplates.id })
    .from(programTemplates)
    .where(ilike(programTemplates.name, `%${SENTINEL}%`));

  for (const pt of demoPTs) {
    const ptWeeks = await db
      .select({ id: programWeeks.id })
      .from(programWeeks)
      .where(eq(programWeeks.programTemplateId, pt.id));
    if (ptWeeks.length > 0) {
      await db.delete(programWeekDays)
        .where(inArray(programWeekDays.programWeekId, ptWeeks.map((r) => r.id)));
      await db.delete(programWeeks)
        .where(eq(programWeeks.programTemplateId, pt.id));
    }
    await db.delete(programTemplates).where(eq(programTemplates.id, pt.id));
  }
  if (demoPTs.length > 0) {
    console.log(`  ✓ Removed ${demoPTs.length} previous PIL demo program(s)`);
  }

  const demoWTs = await db
    .select({ id: workoutTemplates.id })
    .from(workoutTemplates)
    .where(ilike(workoutTemplates.name, `%${SENTINEL}%`));

  for (const wt of demoWTs) {
    await db.delete(workoutTemplateExercises)
      .where(eq(workoutTemplateExercises.workoutTemplateId, wt.id));
    await db.delete(workoutTemplateSections)
      .where(eq(workoutTemplateSections.workoutTemplateId, wt.id));
    await db.delete(workoutTemplates).where(eq(workoutTemplates.id, wt.id));
  }
  if (demoWTs.length > 0) {
    console.log(`  ✓ Removed ${demoWTs.length} previous PIL demo blueprint(s)`);
  }
}

// ─────────────────────────────────────────────────────────────
// CREATE WORKOUT TEMPLATE
// ─────────────────────────────────────────────────────────────

async function createWorkoutTemplate(
  tmpl: TemplateDef,
  exerciseMap: Map<string, string>,
): Promise<string> {
  const [wtRow] = await db
    .insert(workoutTemplates)
    .values({
      name: tmpl.name,
      slug: tmpl.slug,
      description: tmpl.description,
      estimatedDurationMinutes: tmpl.estimatedMinutes,
      recommendedExperienceLevel: "intermediate",
      status: "active",
      minimumDaysPerWeek: 3,
      maximumDaysPerWeek: 5,
    })
    .returning({ id: workoutTemplates.id });
  tmpl.id = wtRow.id;

  for (const sec of tmpl.sections) {
    const [secRow] = await db
      .insert(workoutTemplateSections)
      .values({
        workoutTemplateId: tmpl.id,
        name: sec.name,
        sectionType: sec.sectionType as "warmup" | "activation" | "potentiation" | "main_lift" | "accessory" | "conditioning" | "finisher" | "cooldown" | "rest_period",
        orderIndex: sec.orderIndex,
        estimatedMinutes: sec.estimatedMinutes,
      })
      .returning({ id: workoutTemplateSections.id });
    sec.id = secRow.id;

    for (const ex of sec.exercises) {
      const exId = exerciseMap.get(ex.exerciseName);
      if (!exId) throw new Error(`Exercise not found: "${ex.exerciseName}"`);
      ex.exerciseId = exId;

      const [exRow] = await db
        .insert(workoutTemplateExercises)
        .values({
          workoutTemplateId: tmpl.id!,
          sectionId: sec.id,
          exerciseId: exId,
          orderIndex: ex.orderIndex,
          sets: ex.sets,
          repsMin: ex.repsMin,
          repsMax: ex.repsMax,
          durationSeconds: ex.durationSeconds,
          restSeconds: ex.restSeconds,
          targetRpe: ex.targetRpe,
          coachNotes: ex.coachNotes,
          isRequired: true,
        })
        .returning({ id: workoutTemplateExercises.id });
      ex.id = exRow.id;
    }
  }

  return tmpl.id!;
}

// ─────────────────────────────────────────────────────────────
// PROGRAM 1: OVERLOADED SPLIT
// ─────────────────────────────────────────────────────────────
//
// Schedule (triggers consecutive recovery for quads + hamstrings):
//
//   Week structure (all 4 weeks):
//     Day 2 (Tue): Strength Lower  — hamstrings + quads primary
//     Day 3 (Wed): Strength Lower  — SAME blueprint, 1-day gap → RECOVERY_CONSECUTIVE
//     Day 5 (Fri): Push Upper Only — push horizontal only, no pulls
//
async function createOverloadedSplitProgram(exerciseMap: Map<string, string>) {
  // Create blueprints
  const lowerTemplateId = await createWorkoutTemplate(OVERLOADED_LOWER, exerciseMap);
  console.log(`    ✓ Blueprint: ${OVERLOADED_LOWER.name.replace(SENTINEL + " — ", "")}`);

  const pushTemplateId = await createWorkoutTemplate(PUSH_UPPER_ONLY, exerciseMap);
  console.log(`    ✓ Blueprint: ${PUSH_UPPER_ONLY.name.replace(SENTINEL + " — ", "")}`);

  // Create program template (4 weeks)
  const [ptRow] = await db
    .insert(programTemplates)
    .values({
      name: `${SENTINEL} — Overloaded Split`,
      slug: "pil-demo-overloaded-split",
      category: "athletic_performance",
      experienceLevel: "intermediate",
      description: "Demo program: multiple coaching findings. Consecutive lower-body days, push/pull imbalance, redundant exercises, and excessive hamstring volume. Use with Catalyst Insights to demonstrate the recommendation engine.",
      recommendedDaysPerWeek: 3,
      defaultDurationWeeks: 4,
      status: "active",
      version: 1,
    })
    .returning({ id: programTemplates.id });
  const ptId = ptRow.id;

  for (let wk = 1; wk <= 4; wk++) {
    const [pwRow] = await db
      .insert(programWeeks)
      .values({ programTemplateId: ptId, weekNumber: wk, label: `Week ${wk}` })
      .returning({ id: programWeeks.id });

    // Tue (2): Lower — Wed (3): Lower (consecutive!) — Fri (5): Upper Push
    await db.insert(programWeekDays).values([
      { programWeekId: pwRow.id, dayOfWeek: 2, workoutTemplateId: lowerTemplateId, label: "Strength Lower" },
      { programWeekId: pwRow.id, dayOfWeek: 3, workoutTemplateId: lowerTemplateId, label: "Strength Lower" },
      { programWeekId: pwRow.id, dayOfWeek: 5, workoutTemplateId: pushTemplateId, label: "Push Upper" },
    ]);
  }

  console.log(`    ✓ Program template: Demo — Overloaded Split (4 weeks)`);
}

// ─────────────────────────────────────────────────────────────
// PROGRAM 2: BALANCED PERFORMANCE
// ─────────────────────────────────────────────────────────────
//
// Schedule (clean recovery spacing):
//
//   Week structure (all 4 weeks):
//     Day 1 (Mon): Full Body A — push/pull balanced
//     Day 3 (Wed): Full Body B — hip hinge + pull emphasis
//     Day 5 (Fri): Full Body A — 2-day gap for all muscles
//
async function createBalancedProgram(exerciseMap: Map<string, string>) {
  const aTemplateId = await createWorkoutTemplate(BALANCED_FULL_BODY_A, exerciseMap);
  console.log(`    ✓ Blueprint: ${BALANCED_FULL_BODY_A.name.replace(SENTINEL + " — ", "")}`);

  const bTemplateId = await createWorkoutTemplate(BALANCED_FULL_BODY_B, exerciseMap);
  console.log(`    ✓ Blueprint: ${BALANCED_FULL_BODY_B.name.replace(SENTINEL + " — ", "")}`);

  const [ptRow] = await db
    .insert(programTemplates)
    .values({
      name: `${SENTINEL} — Balanced Performance`,
      slug: "pil-demo-balanced-performance",
      category: "lifestyle",
      experienceLevel: "intermediate",
      description: "Demo program: well-structured 3-day full body split. Push/pull balance, adequate recovery spacing, and appropriate volume. Use with Catalyst Insights to demonstrate a clean or near-clean audit result.",
      recommendedDaysPerWeek: 3,
      defaultDurationWeeks: 4,
      status: "active",
      version: 1,
    })
    .returning({ id: programTemplates.id });
  const ptId = ptRow.id;

  for (let wk = 1; wk <= 4; wk++) {
    const [pwRow] = await db
      .insert(programWeeks)
      .values({ programTemplateId: ptId, weekNumber: wk, label: `Week ${wk}` })
      .returning({ id: programWeeks.id });

    // Mon (1): A — Wed (3): B — Fri (5): A — all 2-day gaps
    await db.insert(programWeekDays).values([
      { programWeekId: pwRow.id, dayOfWeek: 1, workoutTemplateId: aTemplateId, label: "Full Body A" },
      { programWeekId: pwRow.id, dayOfWeek: 3, workoutTemplateId: bTemplateId, label: "Full Body B" },
      { programWeekId: pwRow.id, dayOfWeek: 5, workoutTemplateId: aTemplateId, label: "Full Body A" },
    ]);
  }

  console.log(`    ✓ Program template: Demo — Balanced Performance (4 weeks)`);
}

// ─────────────────────────────────────────────────────────────
// RUN
// ─────────────────────────────────────────────────────────────

main().catch(async (err) => {
  console.error("\nSeed failed:", err.message ?? err);
  if (err.stack) console.error(err.stack);
  await sql.end();
  process.exit(1);
});
