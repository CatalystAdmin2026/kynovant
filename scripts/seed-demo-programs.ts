#!/usr/bin/env npx tsx
// ─────────────────────────────────────────────────────────────
// Catalyst OS — Golden Path Demo: Programs & Check-ins Seed
//
// Extends the demo client (Emma Carter) with:
//   • Three consecutive workout blocks (Foundation, Strength, Current)
//   • Completed workout sessions with realistic set logs and progressive overload
//   • Nine weekly check-ins covering the full coaching arc
//
// Run AFTER seed-demo-client.ts (requires client profile to exist).
//
// Usage:
//   set -a && source .env.local && set +a && \
//   DEMO_CLIENT_EMAIL=you@example.com npx tsx scripts/seed-demo-programs.ts
//
// Requires:
//   DATABASE_URL_DIRECT — postgres connection (service role / superuser)
//   DEMO_CLIENT_EMAIL   — must already exist from seed-demo-client.ts run
//
// Idempotency:
//   Cleans up all sentinel-tagged program templates, workout templates,
//   client programs, sessions, set logs, and check-ins before reseeding.
//   Safe to run multiple times.
//
// DEMO ONLY — do not run against production users.
// ─────────────────────────────────────────────────────────────

import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { eq, and, inArray, ilike } from "drizzle-orm";
import {
  users,
  programTemplates,
  workoutTemplates,
  coachingEnrollments,
} from "../lib/db/schema";
import {
  programWeeks,
  programWeekDays,
  clientPrograms,
  clientProgramWeeks,
  clientProgramWeekDays,
  workoutSessions,
  workoutSetLogs,
} from "../lib/db/schema-program";
import {
  workoutTemplateSections,
  workoutTemplateExercises,
  exercises,
} from "../lib/db/schema-exercise";
import { weeklyCheckIns } from "../lib/db/schema-check-in";

// ─────────────────────────────────────────────────────────────
// ENVIRONMENT
// ─────────────────────────────────────────────────────────────

const rawUrl = process.env.DATABASE_URL_DIRECT;
if (!rawUrl) {
  console.error("ERROR: DATABASE_URL_DIRECT is not set.");
  process.exit(1);
}

const DEMO_CLIENT_EMAIL = (process.env.DEMO_CLIENT_EMAIL ?? "").toLowerCase().trim();
if (!DEMO_CLIENT_EMAIL) {
  console.error("ERROR: DEMO_CLIENT_EMAIL is not set.");
  process.exit(1);
}

const sql = postgres(rawUrl, { prepare: false });
const db  = drizzle(sql);

// ─────────────────────────────────────────────────────────────
// CONSTANTS
// ─────────────────────────────────────────────────────────────

const DEMO_SENTINEL = "catalyst-golden-path-demo";

// Program block timeline
const BLOCK1_START = "2026-03-30"; // Monday — Foundation begins
const BLOCK1_END   = "2026-05-08"; // Friday — 6 weeks
const BLOCK2_START = "2026-05-11"; // Monday — Strength begins
const BLOCK2_END   = "2026-07-03"; // Friday — 8 weeks
const BLOCK3_START = "2026-07-06"; // Monday — Current block

// ─────────────────────────────────────────────────────────────
// TYPES
// ─────────────────────────────────────────────────────────────

interface ExercisePrescription {
  exerciseName:      string;
  exerciseId?:       string; // filled in after DB lookup
  id?:               string; // workout_template_exercise.id, filled after insert
  orderIndex:        number;
  sets:              number | null;
  repsMin:           number | null;
  repsMax:           number | null;
  durationSeconds:   number | null;
  restSeconds:       number | null;
  targetRpe:         string | null;
  coachNotes:        string | null;
  isRequired:        boolean;
  // For progressive set log generation
  baseWeightKg:      number | null; // null = bodyweight / time-based
  weeklyGainKg:      number;        // kg added per program week
}

interface SectionDef {
  name:             string;
  sectionType:      string;
  orderIndex:       number;
  estimatedMinutes: number | null;
  id?:              string; // filled after insert
  exercises:        ExercisePrescription[];
}

interface WorkoutTemplateDef {
  name:              string;
  slug:              string;
  description:       string;
  estimatedMinutes:  number;
  id?:               string; // filled after insert
  sections:          SectionDef[];
}

// ─────────────────────────────────────────────────────────────
// DATE HELPERS
// ─────────────────────────────────────────────────────────────

function parseDate(s: string): Date {
  return new Date(s + "T12:00:00Z");
}

function toDateStr(d: Date): string {
  return d.toISOString().split("T")[0];
}

function addDays(d: Date, n: number): Date {
  return new Date(d.getTime() + n * 86_400_000);
}

// Returns all dates in [start, end] that fall on one of daysOfWeek.
// daysOfWeek: 0=Sun, 1=Mon … 6=Sat (UTC)
function sessionDates(
  start: string,
  end: string,
  daysOfWeek: number[],
): { date: string; dow: number }[] {
  const result: { date: string; dow: number }[] = [];
  const endDate = parseDate(end);
  let cur = parseDate(start);
  while (cur <= endDate) {
    const dow = cur.getUTCDay();
    if (daysOfWeek.includes(dow)) {
      result.push({ date: toDateStr(cur), dow });
    }
    cur = addDays(cur, 1);
  }
  return result;
}

// Returns the 1-indexed program week number for a session date.
function weekNum(programStartStr: string, sessionDateStr: string): number {
  const s = parseDate(programStartStr);
  const d = parseDate(sessionDateStr);
  return Math.floor((d.getTime() - s.getTime()) / (7 * 86_400_000)) + 1;
}

// ─────────────────────────────────────────────────────────────
// SNAPSHOT BUILDER (mirrors buildWorkoutSnapshot in service)
// ─────────────────────────────────────────────────────────────

function buildSnapshot(t: WorkoutTemplateDef): Record<string, unknown> {
  return {
    templateId:               t.id,
    templateName:             t.name,
    estimatedDurationMinutes: t.estimatedMinutes,
    unsectioned: [],
    sections: t.sections.map((sec) => ({
      id:               sec.id,
      name:             sec.name,
      sectionType:      sec.sectionType,
      orderIndex:       sec.orderIndex,
      estimatedMinutes: sec.estimatedMinutes,
      exercises: sec.exercises.map((ex) => ({
        id:             ex.id,
        exerciseId:     ex.exerciseId,
        exerciseName:   ex.exerciseName,
        orderIndex:     ex.orderIndex,
        groupId:        null,
        groupPosition:  null,
        sets:           ex.sets,
        repsMin:        ex.repsMin,
        repsMax:        ex.repsMax,
        durationSeconds: ex.durationSeconds,
        restSeconds:    ex.restSeconds,
        tempo:          null,
        targetRpe:      ex.targetRpe,
        targetRir:      null,
        setTechnique:   null,
        coachNotes:     ex.coachNotes,
        isRequired:     ex.isRequired,
      })),
    })),
  };
}

// ─────────────────────────────────────────────────────────────
// SET LOG GENERATORS
// ─────────────────────────────────────────────────────────────

// RPE arc: starts low, peaks by final weeks
function sessionRpe(wk: number, totalWeeks: number): number {
  const progress = wk / totalWeeks;
  if (progress < 0.3) return 6.5;
  if (progress < 0.6) return 7.5;
  if (progress < 0.85) return 8;
  return 8.5;
}

// Actual reps for a set (slight descending fatigue across sets)
function actualReps(repsMax: number, setNum: number): number {
  return Math.max(repsMax - (setNum - 1), repsMax - 3);
}

// Weight for a given week (progressive overload)
function weeklyWeight(base: number, gainPerWeek: number, wk: number): number {
  const raw = base + gainPerWeek * (wk - 1);
  // Round to nearest 0.5
  return Math.round(raw * 2) / 2;
}

// ─────────────────────────────────────────────────────────────
// WORKOUT TEMPLATE DEFINITIONS
// ─────────────────────────────────────────────────────────────

// Block 1 — Full Body A (Squat + Push + Compound Row)
const B1_FULL_BODY_A: WorkoutTemplateDef = {
  name: `${DEMO_SENTINEL} — B1 Full Body A`,
  slug: "gp-b1-full-body-a",
  description: "Block 1: Foundation full body A — squat and push focus with compound row.",
  estimatedMinutes: 65,
  sections: [
    {
      name: "Warm-up", sectionType: "warmup", orderIndex: 0, estimatedMinutes: 10,
      exercises: [
        { exerciseName: "Banded Glute Walk", orderIndex: 0, sets: 2, repsMin: 15, repsMax: 20, durationSeconds: null, restSeconds: 45, targetRpe: "5", coachNotes: "Activate glutes before loading.", isRequired: true, baseWeightKg: null, weeklyGainKg: 0 },
        { exerciseName: "Plank",             orderIndex: 1, sets: 2, repsMin: null, repsMax: null, durationSeconds: 30, restSeconds: 45, targetRpe: "5", coachNotes: "Brace, squeeze glutes.", isRequired: true, baseWeightKg: null, weeklyGainKg: 0 },
      ],
    },
    {
      name: "Main Lifts", sectionType: "main_lift", orderIndex: 1, estimatedMinutes: 45,
      exercises: [
        { exerciseName: "Leg Press",                  orderIndex: 0, sets: 4, repsMin: 10, repsMax: 12, durationSeconds: null, restSeconds: 120, targetRpe: "7", coachNotes: "Full range. Feet shoulder-width.", isRequired: true, baseWeightKg: 50, weeklyGainKg: 2.5 },
        { exerciseName: "Romanian Deadlift",          orderIndex: 1, sets: 3, repsMin: 10, repsMax: 12, durationSeconds: null, restSeconds: 120, targetRpe: "7", coachNotes: "Soft knee, feel the hamstring stretch.", isRequired: true, baseWeightKg: 25, weeklyGainKg: 2.5 },
        { exerciseName: "Dumbbell Bench Press",       orderIndex: 2, sets: 4, repsMin: 8,  repsMax: 12, durationSeconds: null, restSeconds: 90,  targetRpe: "7", coachNotes: "2-sec eccentric. Elbows 45°.", isRequired: true, baseWeightKg: 9, weeklyGainKg: 0.5 },
        { exerciseName: "Chest-Supported Dumbbell Row", orderIndex: 3, sets: 4, repsMin: 10, repsMax: 14, durationSeconds: null, restSeconds: 90,  targetRpe: "7", coachNotes: "Dead hang at bottom. Drive elbows high.", isRequired: true, baseWeightKg: 10, weeklyGainKg: 0.75 },
      ],
    },
    {
      name: "Cardio Finisher", sectionType: "finisher", orderIndex: 2, estimatedMinutes: 15,
      exercises: [
        { exerciseName: "Stair Climber", orderIndex: 0, sets: 1, repsMin: null, repsMax: null, durationSeconds: 900, restSeconds: null, targetRpe: "6", coachNotes: "Moderate pace. Keep heart rate 130-145.", isRequired: true, baseWeightKg: null, weeklyGainKg: 0 },
      ],
    },
  ],
};

// Block 1 — Full Body B (Hip + Pull)
const B1_FULL_BODY_B: WorkoutTemplateDef = {
  name: `${DEMO_SENTINEL} — B1 Full Body B`,
  slug: "gp-b1-full-body-b",
  description: "Block 1: Foundation full body B — hip hinge and pull focus.",
  estimatedMinutes: 65,
  sections: [
    {
      name: "Warm-up", sectionType: "warmup", orderIndex: 0, estimatedMinutes: 10,
      exercises: [
        { exerciseName: "Banded Glute Walk", orderIndex: 0, sets: 2, repsMin: 15, repsMax: 20, durationSeconds: null, restSeconds: 45, targetRpe: "5", coachNotes: null, isRequired: true, baseWeightKg: null, weeklyGainKg: 0 },
        { exerciseName: "Plank",             orderIndex: 1, sets: 2, repsMin: null, repsMax: null, durationSeconds: 30, restSeconds: 45, targetRpe: "5", coachNotes: null, isRequired: true, baseWeightKg: null, weeklyGainKg: 0 },
      ],
    },
    {
      name: "Main Lifts", sectionType: "main_lift", orderIndex: 1, estimatedMinutes: 45,
      exercises: [
        { exerciseName: "Hip Thrust",           orderIndex: 0, sets: 4, repsMin: 12, repsMax: 15, durationSeconds: null, restSeconds: 90,  targetRpe: "7", coachNotes: "Full hip extension. Squeeze at top.", isRequired: true, baseWeightKg: 40, weeklyGainKg: 2.5 },
        { exerciseName: "Bulgarian Split Squat", orderIndex: 1, sets: 3, repsMin: 8,  repsMax: 12, durationSeconds: null, restSeconds: 90,  targetRpe: "7", coachNotes: "Rear foot elevated. Torso upright.", isRequired: true, baseWeightKg: 8, weeklyGainKg: 0.75 },
        { exerciseName: "Lat Pulldown",         orderIndex: 2, sets: 3, repsMin: 10, repsMax: 12, durationSeconds: null, restSeconds: 75,  targetRpe: "7", coachNotes: "Pull to upper chest. Full arm extension.", isRequired: true, baseWeightKg: 40, weeklyGainKg: 2.5 },
        { exerciseName: "Cable Lateral Raise",  orderIndex: 3, sets: 3, repsMin: 12, repsMax: 15, durationSeconds: null, restSeconds: 60,  targetRpe: "7", coachNotes: "Unilateral. Control the descent.", isRequired: true, baseWeightKg: 5, weeklyGainKg: 0.25 },
      ],
    },
    {
      name: "Cardio Finisher", sectionType: "finisher", orderIndex: 2, estimatedMinutes: 15,
      exercises: [
        { exerciseName: "Stair Climber", orderIndex: 0, sets: 1, repsMin: null, repsMax: null, durationSeconds: 900, restSeconds: null, targetRpe: "6", coachNotes: null, isRequired: true, baseWeightKg: null, weeklyGainKg: 0 },
      ],
    },
  ],
};

// Block 2 — Upper Body (Push + Pull + Arms)
const B2_UPPER: WorkoutTemplateDef = {
  name: `${DEMO_SENTINEL} — B2 Upper Body`,
  slug: "gp-b2-upper",
  description: "Block 2: Upper/Lower split — push, pull, and arm isolation.",
  estimatedMinutes: 65,
  sections: [
    {
      name: "Warm-up", sectionType: "warmup", orderIndex: 0, estimatedMinutes: 10,
      exercises: [
        { exerciseName: "Cable Lateral Raise", orderIndex: 0, sets: 2, repsMin: 15, repsMax: 20, durationSeconds: null, restSeconds: 45, targetRpe: "4", coachNotes: "Light — shoulder priming.", isRequired: true, baseWeightKg: null, weeklyGainKg: 0 },
      ],
    },
    {
      name: "Main Lifts", sectionType: "main_lift", orderIndex: 1, estimatedMinutes: 50,
      exercises: [
        { exerciseName: "Dumbbell Bench Press",         orderIndex: 0, sets: 4, repsMin: 6,  repsMax: 10, durationSeconds: null, restSeconds: 150, targetRpe: "8", coachNotes: "2-sec eccentric. RPE 8 on top sets.", isRequired: true, baseWeightKg: 13, weeklyGainKg: 0.5 },
        { exerciseName: "Chest-Supported Dumbbell Row", orderIndex: 1, sets: 4, repsMin: 8,  repsMax: 12, durationSeconds: null, restSeconds: 120, targetRpe: "8", coachNotes: "Full dead-hang at bottom.", isRequired: true, baseWeightKg: 15, weeklyGainKg: 0.75 },
        { exerciseName: "Lat Pulldown",                 orderIndex: 2, sets: 3, repsMin: 10, repsMax: 12, durationSeconds: null, restSeconds: 90,  targetRpe: "8", coachNotes: null, isRequired: true, baseWeightKg: 55, weeklyGainKg: 1.25 },
        { exerciseName: "Cable Lateral Raise",          orderIndex: 3, sets: 3, repsMin: 12, repsMax: 15, durationSeconds: null, restSeconds: 60,  targetRpe: "8", coachNotes: null, isRequired: true, baseWeightKg: 7, weeklyGainKg: 0.25 },
        { exerciseName: "Cable Triceps Pressdown",      orderIndex: 4, sets: 3, repsMin: 12, repsMax: 15, durationSeconds: null, restSeconds: 60,  targetRpe: "8", coachNotes: "Elbows pinned. Hard squeeze.", isRequired: true, baseWeightKg: 22, weeklyGainKg: 1 },
        { exerciseName: "Dumbbell Curl",                orderIndex: 5, sets: 3, repsMin: 12, repsMax: 15, durationSeconds: null, restSeconds: 60,  targetRpe: "8", coachNotes: "Supinate at peak. Strict form.", isRequired: true, baseWeightKg: 7.5, weeklyGainKg: 0.25 },
      ],
    },
  ],
};

// Block 2 — Lower Body
const B2_LOWER: WorkoutTemplateDef = {
  name: `${DEMO_SENTINEL} — B2 Lower Body`,
  slug: "gp-b2-lower",
  description: "Block 2: Upper/Lower split — hip hinge, quad, and hamstring focus.",
  estimatedMinutes: 65,
  sections: [
    {
      name: "Warm-up", sectionType: "warmup", orderIndex: 0, estimatedMinutes: 10,
      exercises: [
        { exerciseName: "Banded Glute Walk", orderIndex: 0, sets: 2, repsMin: 20, repsMax: 20, durationSeconds: null, restSeconds: 45, targetRpe: "4", coachNotes: null, isRequired: true, baseWeightKg: null, weeklyGainKg: 0 },
        { exerciseName: "Plank",             orderIndex: 1, sets: 2, repsMin: null, repsMax: null, durationSeconds: 40, restSeconds: 45, targetRpe: "4", coachNotes: null, isRequired: true, baseWeightKg: null, weeklyGainKg: 0 },
      ],
    },
    {
      name: "Main Lifts", sectionType: "main_lift", orderIndex: 1, estimatedMinutes: 55,
      exercises: [
        { exerciseName: "Romanian Deadlift",   orderIndex: 0, sets: 4, repsMin: 8,  repsMax: 10, durationSeconds: null, restSeconds: 150, targetRpe: "8", coachNotes: "Controlled descent. RPE 8 top set.", isRequired: true, baseWeightKg: 40, weeklyGainKg: 2 },
        { exerciseName: "Hip Thrust",          orderIndex: 1, sets: 4, repsMin: 10, repsMax: 15, durationSeconds: null, restSeconds: 90,  targetRpe: "8", coachNotes: null, isRequired: true, baseWeightKg: 57.5, weeklyGainKg: 2 },
        { exerciseName: "Leg Press",           orderIndex: 2, sets: 4, repsMin: 10, repsMax: 15, durationSeconds: null, restSeconds: 120, targetRpe: "7", coachNotes: null, isRequired: true, baseWeightKg: 65, weeklyGainKg: 2.5 },
        { exerciseName: "Seated Leg Curl",     orderIndex: 3, sets: 3, repsMin: 10, repsMax: 15, durationSeconds: null, restSeconds: 75,  targetRpe: "8", coachNotes: null, isRequired: true, baseWeightKg: 30, weeklyGainKg: 1.5 },
        { exerciseName: "Bulgarian Split Squat", orderIndex: 4, sets: 3, repsMin: 8, repsMax: 12, durationSeconds: null, restSeconds: 90,  targetRpe: "8", coachNotes: null, isRequired: true, baseWeightKg: 13, weeklyGainKg: 0.5 },
      ],
    },
  ],
};

// Block 3 — Upper Push-Pull (current, progressive)
const B3_UPPER: WorkoutTemplateDef = {
  name: `${DEMO_SENTINEL} — B3 Upper Push-Pull`,
  slug: "gp-b3-upper",
  description: "Block 3: Current block — upper intensity phase with added volume on pulls.",
  estimatedMinutes: 65,
  sections: [
    {
      name: "Warm-up", sectionType: "warmup", orderIndex: 0, estimatedMinutes: 10,
      exercises: [
        { exerciseName: "Cable Lateral Raise", orderIndex: 0, sets: 2, repsMin: 20, repsMax: 20, durationSeconds: null, restSeconds: 45, targetRpe: "4", coachNotes: null, isRequired: true, baseWeightKg: null, weeklyGainKg: 0 },
      ],
    },
    {
      name: "Main Lifts", sectionType: "main_lift", orderIndex: 1, estimatedMinutes: 55,
      exercises: [
        { exerciseName: "Dumbbell Bench Press",         orderIndex: 0, sets: 4, repsMin: 6,  repsMax: 10, durationSeconds: null, restSeconds: 150, targetRpe: "8", coachNotes: "Stay tight. Don't rush the eccentric.", isRequired: true, baseWeightKg: 18, weeklyGainKg: 0.5 },
        { exerciseName: "Chest-Supported Dumbbell Row", orderIndex: 1, sets: 4, repsMin: 8,  repsMax: 12, durationSeconds: null, restSeconds: 120, targetRpe: "8", coachNotes: null, isRequired: true, baseWeightKg: 22, weeklyGainKg: 0.5 },
        { exerciseName: "Lat Pulldown",                 orderIndex: 2, sets: 4, repsMin: 8,  repsMax: 12, durationSeconds: null, restSeconds: 90,  targetRpe: "8", coachNotes: null, isRequired: true, baseWeightKg: 66, weeklyGainKg: 1 },
        { exerciseName: "Cable Lateral Raise",          orderIndex: 3, sets: 4, repsMin: 15, repsMax: 20, durationSeconds: null, restSeconds: 60,  targetRpe: "8", coachNotes: null, isRequired: true, baseWeightKg: 9.5, weeklyGainKg: 0.25 },
        { exerciseName: "Cable Triceps Pressdown",      orderIndex: 4, sets: 3, repsMin: 12, repsMax: 15, durationSeconds: null, restSeconds: 60,  targetRpe: "8", coachNotes: null, isRequired: true, baseWeightKg: 31, weeklyGainKg: 0.5 },
        { exerciseName: "Dumbbell Curl",                orderIndex: 5, sets: 3, repsMin: 12, repsMax: 15, durationSeconds: null, restSeconds: 60,  targetRpe: "8", coachNotes: null, isRequired: true, baseWeightKg: 10.5, weeklyGainKg: 0.25 },
      ],
    },
  ],
};

// Block 3 — Lower Strength (current)
const B3_LOWER: WorkoutTemplateDef = {
  name: `${DEMO_SENTINEL} — B3 Lower Strength`,
  slug: "gp-b3-lower",
  description: "Block 3: Current block — lower strength focus, deficit phase.",
  estimatedMinutes: 65,
  sections: [
    {
      name: "Warm-up", sectionType: "warmup", orderIndex: 0, estimatedMinutes: 10,
      exercises: [
        { exerciseName: "Banded Glute Walk", orderIndex: 0, sets: 2, repsMin: 20, repsMax: 20, durationSeconds: null, restSeconds: 45, targetRpe: "4", coachNotes: null, isRequired: true, baseWeightKg: null, weeklyGainKg: 0 },
        { exerciseName: "Plank",             orderIndex: 1, sets: 2, repsMin: null, repsMax: null, durationSeconds: 45, restSeconds: 45, targetRpe: "4", coachNotes: null, isRequired: true, baseWeightKg: null, weeklyGainKg: 0 },
      ],
    },
    {
      name: "Main Lifts", sectionType: "main_lift", orderIndex: 1, estimatedMinutes: 55,
      exercises: [
        { exerciseName: "Romanian Deadlift",   orderIndex: 0, sets: 4, repsMin: 6, repsMax: 8,   durationSeconds: null, restSeconds: 180, targetRpe: "8", coachNotes: "Heavier this block. RPE 8 on all top sets.", isRequired: true, baseWeightKg: 57, weeklyGainKg: 1.5 },
        { exerciseName: "Hip Thrust",          orderIndex: 1, sets: 5, repsMin: 10, repsMax: 12, durationSeconds: null, restSeconds: 90,  targetRpe: "8", coachNotes: null, isRequired: true, baseWeightKg: 75, weeklyGainKg: 2.5 },
        { exerciseName: "Leg Press",           orderIndex: 2, sets: 4, repsMin: 10, repsMax: 15, durationSeconds: null, restSeconds: 120, targetRpe: "7", coachNotes: null, isRequired: true, baseWeightKg: 87.5, weeklyGainKg: 2.5 },
        { exerciseName: "Seated Leg Curl",     orderIndex: 3, sets: 4, repsMin: 10, repsMax: 12, durationSeconds: null, restSeconds: 75,  targetRpe: "8", coachNotes: null, isRequired: true, baseWeightKg: 43, weeklyGainKg: 1 },
        { exerciseName: "Bulgarian Split Squat", orderIndex: 4, sets: 3, repsMin: 8, repsMax: 10, durationSeconds: null, restSeconds: 90,  targetRpe: "8", coachNotes: null, isRequired: true, baseWeightKg: 19, weeklyGainKg: 0.5 },
      ],
    },
  ],
};

// ─────────────────────────────────────────────────────────────
// PROGRAM BLOCK DEFINITIONS
// ─────────────────────────────────────────────────────────────

// (dayOfWeek → workout template def) — 1=Mon … 6=Sat
type BlockSchedule = Map<number, WorkoutTemplateDef>;

interface BlockDef {
  programName:  string;
  description:  string;
  startDate:    string;
  endDate:      string | null; // null = active
  status:       "completed" | "active";
  totalWeeks:   number;
  schedule:     BlockSchedule;           // DOW → template
  skipDates:    Set<string>;             // dates to mark as skipped
}

// Skip patterns for realistic compliance
const B1_SKIPS = new Set(["2026-04-03", "2026-05-01"]); // 2 of 18 = 89%
const B2_SKIPS = new Set(["2026-05-22", "2026-06-19"]); // 2 of 32 = 94%
const B3_SKIPS = new Set(["2026-07-10"]);                // 1 of 12 so far = 92%

// ─────────────────────────────────────────────────────────────
// WEEKLY CHECK-IN DATA
// ─────────────────────────────────────────────────────────────

interface CheckInDef {
  weekStartDate:           string; // must be Sunday
  status:                  "reviewed" | "in_review" | "submitted";
  bodyWeightLbs:           number;
  waistInches:             number | null;
  averageSleepHours:       number;
  averageStress:           number;  // 1–10
  averageEnergy:           number;  // 1–10
  averageHunger:           number;  // 1–10
  digestionRating:         number;  // 1–10
  averageWaterOunces:      number;
  averageSteps:            number;
  workoutCompliancePct:    number;  // 0–100
  nutritionCompliancePct:  number;  // 0–100
  wins:                    string;
  challenges:              string;
  questions:               string;
  coachResponse:           string | null;
}

// Narrative arc: start hesitant → build momentum → confidence
const CHECK_INS: CheckInDef[] = [
  {
    weekStartDate: "2026-04-05",
    status: "reviewed",
    bodyWeightLbs: 171,
    waistInches: 31.5,
    averageSleepHours: 6.8,
    averageStress: 6,
    averageEnergy: 5,
    averageHunger: 7,
    digestionRating: 6,
    averageWaterOunces: 72,
    averageSteps: 6200,
    workoutCompliancePct: 67, // 2/3 sessions
    nutritionCompliancePct: 60,
    wins: "Completed my first two workouts. Hip thrusts were really hard but I felt it in the right place. Drank water every morning before coffee.",
    challenges: "Missed Friday — I was exhausted from a work event Thursday night. Protein is harder than I expected. I hit my calories but protein was only around 100g most days.",
    questions: "Can I do something lighter on the days I miss a workout? Or should I just skip?",
    coachResponse: "Great start, Emma — two sessions with real effort in your first week is exactly right. On missed days: rest is fine. A walk, a stretch, or just nothing. Don't try to \"make up\" the workout — it tends to lead to overdoing it and then more skips. On protein: this is the #1 thing I want you to nail in the next two weeks. 150g is the goal. Try adding a protein shake on days when dinner is lighter. We'll adjust the rest once protein is dialed in.",
  },
  {
    weekStartDate: "2026-04-19",
    status: "reviewed",
    bodyWeightLbs: 170.2,
    waistInches: 31.4,
    averageSleepHours: 7,
    averageStress: 5,
    averageEnergy: 6,
    averageHunger: 6,
    digestionRating: 7,
    averageWaterOunces: 80,
    averageSteps: 7100,
    workoutCompliancePct: 100,
    nutritionCompliancePct: 70,
    wins: "Hit all three workouts for the first time. Weights all went up — added 5 lbs to leg press and rows felt much more controlled. Protein hit 140g three days this week.",
    challenges: "Weekend was tough. Family dinner Saturday — pasta, wine. Didn't track. Hunger is still high around 4pm every day.",
    questions: "Should I be sore after every session? Some days I barely feel it.",
    coachResponse: "Perfect week, Emma. Progress on leg press and rows in only two weeks is a great sign. On soreness: some is normal, zero is also fine — especially as your body adapts. What matters is that you're executing the reps with intention and the weights are moving up. On the 4pm hunger: try a protein snack (Greek yogurt, cottage cheese, or a shake) around 3pm. It'll make dinner easier and help you hit your numbers. The weekend will always be the battleground — keep pasta but add protein to it (grilled chicken alongside). One imperfect weekend won't derail anything.",
  },
  {
    weekStartDate: "2026-05-03",
    status: "reviewed",
    bodyWeightLbs: 168.8,
    waistInches: 31.0,
    averageSleepHours: 7.2,
    averageStress: 4,
    averageEnergy: 7,
    averageHunger: 5,
    digestionRating: 7,
    averageWaterOunces: 85,
    averageSteps: 8200,
    workoutCompliancePct: 100,
    nutritionCompliancePct: 80,
    wins: "Down 2.2 lbs from start — clothes are fitting differently. Hit 150g protein four days this week. Energy is noticeably better in the afternoon now.",
    challenges: "Last session of the block felt heavy. Legs were tired by the time I got to Bulgarian split squats. Romanian Deadlift weight hasn't gone up as fast.",
    questions: "Am I supposed to hit the same weight every set, or go heavier on later sets? I've been going same weight all sets.",
    coachResponse: "Excellent end to the block, Emma. 2.2 lbs in 5 weeks — and you built real strength at the same time. That's textbook fat loss + muscle retention. On your question: for these rep ranges, keep the same weight all sets (\"straight sets\") and aim to hit the top of the prescribed range on every set before going up next session. That's the signal to progress. On the tired legs at the end: totally normal at the end of a block. We're switching things up next week — upper/lower split, 4 days — which will let each muscle group recover more between sessions. You've earned it.",
  },
  {
    weekStartDate: "2026-05-17",
    status: "reviewed",
    bodyWeightLbs: 168.0,
    waistInches: 30.8,
    averageSleepHours: 7.3,
    averageStress: 4,
    averageEnergy: 7,
    averageHunger: 5,
    digestionRating: 8,
    averageWaterOunces: 88,
    averageSteps: 8600,
    workoutCompliancePct: 100,
    nutritionCompliancePct: 82,
    wins: "Love the upper/lower split. Upper body day feels totally different — I don't feel like I'm dying by the end. Hit a new personal best on dumbbell bench: 30 lbs per hand for 8 reps.",
    challenges: "Lower day is hard. Romanian deadlifts at this weight are a real challenge. My lower back feels fatigued after, not painful, just tired.",
    questions: "Should I be eating differently on training days vs rest days? I've seen some people do this.",
    coachResponse: "Great first week of Block 2. And dumbbell bench at 30 per hand after just 6 weeks is excellent progress. On the lower back fatigue after RDLs: that's expected — the spinal erectors work hard. Make sure you're bracing your core before each rep and not hyperextending at the top. If it ever becomes actual pain, flag it immediately. On nutrient timing: for where you are right now, it's not the lever to pull. Hit your daily protein and calorie targets first — that's the 90% of the result. We'll layer in carb timing if we need to once you've been consistent for another 4–6 weeks.",
  },
  {
    weekStartDate: "2026-06-07",
    status: "reviewed",
    bodyWeightLbs: 165.6,
    waistInches: 30.4,
    averageSleepHours: 7.4,
    averageStress: 4,
    averageEnergy: 8,
    averageHunger: 5,
    digestionRating: 8,
    averageWaterOunces: 90,
    averageSteps: 9000,
    workoutCompliancePct: 100,
    nutritionCompliancePct: 85,
    wins: "Down 5.4 lbs from when I started. People at work are noticing. My energy is completely different from April — I actually feel awake without coffee by 9am. Protein is becoming automatic now.",
    challenges: "Travel week coming up. I'm in NYC July 8-11 and I'm nervous about keeping things together.",
    questions: "What should I do in NYC? I won't have access to a full gym.",
    coachResponse: "Emma, this is one of the best progress updates I've seen. 5+ lbs down, protein automatic, energy transformed, and performance still climbing — this is the definition of sustainable progress. On NYC: I'll send you a hotel-room workout you can do in 30 minutes. Priority order: 1) protein target every day (restaurant protein is easy — grilled chicken, steak, fish), 2) walking (aim for 10k steps), 3) the bodyweight workout 2x that week. Don't stress about macros during travel. Hit protein, move, enjoy yourself. You've built the habits now — a week of imperfection won't undo that.",
  },
  {
    weekStartDate: "2026-06-14",
    status: "reviewed",
    bodyWeightLbs: 164.0,
    waistInches: 30.0,
    averageSleepHours: 7.5,
    averageStress: 3,
    averageEnergy: 8,
    averageHunger: 4,
    digestionRating: 8,
    averageWaterOunces: 92,
    averageSteps: 9400,
    workoutCompliancePct: 100,
    nutritionCompliancePct: 88,
    wins: "1889 calories and 162g protein feels completely manageable now. I'm not counting every bite — I just know roughly what to eat. Hip thrust PR: 165 lbs for 12.",
    challenges: "Hunger is low but I sometimes feel a little flat during evening training sessions. Like my legs work but don't have the pop they had a few weeks ago.",
    questions: "Is this a plateau? The scale hasn't moved much this week.",
    coachResponse: "That hip thrust number is exceptional. 165 for 12 after 11 weeks — your glutes and hamstrings are significantly stronger than when we started. On the flatness: this is normal in a sustained deficit. The scale will stall for 1-2 weeks periodically and then drop. What matters is the 12-week trend, not any single week. I've published updated nutrition targets today — I want you to look at them. One key change: I've set your targets based on your current body weight rather than your starting weight, which means a slightly tighter deficit as you've already lost 7+ lbs. Keep doing exactly what you're doing.",
  },
  {
    weekStartDate: "2026-06-28",
    status: "reviewed",
    bodyWeightLbs: 163.2,
    waistInches: 29.8,
    averageSleepHours: 7.5,
    averageStress: 3,
    averageEnergy: 8,
    averageHunger: 4,
    digestionRating: 9,
    averageWaterOunces: 92,
    averageSteps: 9800,
    workoutCompliancePct: 94,
    nutritionCompliancePct: 90,
    wins: "Scale is moving again. New bench PR: 35 lbs per hand for 8. Waist down half an inch this month. I took progress photos and the difference is real.",
    challenges: "One workout skipped Friday — I had a late work deadline and just ran out of time. I felt guilty about it.",
    questions: "How much longer until I hit my goal? I'm at 163 and want to be around 142.",
    coachResponse: "35 lbs for 8 on bench — that's a genuine strength level, Emma. Don't feel guilty about one missed session; guilt about skips is a sign you're taking this seriously, but it doesn't owe you anything. Move on immediately. On timeline: at a pound per week (roughly where you are), you have about 20 weeks to goal. But I'd expect the last 10 lbs to come slower — we'll assess around 155 lbs. The good news: your body is recomping as you lose. You're likely building muscle while losing fat, which is why the strength keeps going up even in a deficit. This is the best possible outcome.",
  },
  {
    weekStartDate: "2026-07-12",
    status: "reviewed",
    bodyWeightLbs: 162.0,
    waistInches: 29.5,
    averageSleepHours: 7.6,
    averageStress: 3,
    averageEnergy: 9,
    averageHunger: 4,
    digestionRating: 9,
    averageWaterOunces: 96,
    averageSteps: 10200,
    workoutCompliancePct: 100,
    nutritionCompliancePct: 91,
    wins: "First week of Block 3 done. RDLs at 127 lbs felt strong. I'm starting to genuinely enjoy training — which I never expected. Hip thrust got up to 175 lbs for 10.",
    challenges: "Block 3 is harder. 4 sessions per week is doable but the lower days are brutal. My legs were sore most of the week.",
    questions: "Should I be worried that my waist didn't change much this week?",
    coachResponse: "Emma, 162 lbs — that's exactly 9 lbs down from where you started. And Block 3 in week one, hitting those numbers — you've built a real athlete over these 15 weeks. On the soreness: expected when intensity goes up. Your body will adapt in 2-3 weeks. On the waist: week-to-week variation is normal — fluid retention, salt, stress all affect it. Look at the monthly trend: you're down 2 inches since April. That's significant. Keep building.",
  },
  {
    weekStartDate: "2026-07-19",
    status: "in_review",
    bodyWeightLbs: 161.5,
    waistInches: 29.4,
    averageSleepHours: 7.6,
    averageStress: 3,
    averageEnergy: 9,
    averageHunger: 4,
    digestionRating: 9,
    averageWaterOunces: 96,
    averageSteps: 10500,
    workoutCompliancePct: 100,
    nutritionCompliancePct: 92,
    wins: "All four sessions done. Leg press went up to 200 lbs. I feel strong. I'm starting to look forward to lower days instead of dreading them.",
    challenges: "Protein is still 162g. Hitting it consistently but I'm eating a lot of chicken. Need some new meal ideas.",
    questions: "Can we look at introducing some new exercises? I feel like I know these ones really well now.",
    coachResponse: null, // not yet reviewed
  },
];

// ─────────────────────────────────────────────────────────────
// MAIN
// ─────────────────────────────────────────────────────────────

async function main() {
  const today = toDateStr(new Date());

  console.log("═══════════════════════════════════════════════════════════");
  console.log("  Catalyst OS — Demo Programs & Check-ins Seed");
  console.log("═══════════════════════════════════════════════════════════");
  console.log(`  Client: ${DEMO_CLIENT_EMAIL}`);
  console.log(`  Date:   ${today}`);
  console.log("═══════════════════════════════════════════════════════════\n");

  // ── 1. Resolve client ─────────────────────────────────────────
  console.log("Step 1: Resolving client...");
  const [clientRow] = await db
    .select({ id: users.id, role: users.role })
    .from(users)
    .where(eq(users.normalizedEmail, DEMO_CLIENT_EMAIL));

  if (!clientRow || clientRow.role !== "client") {
    console.error(`  ERROR: No client found for "${DEMO_CLIENT_EMAIL}".`);
    console.error("  Run seed-demo-client.ts first.");
    await sql.end();
    process.exit(1);
  }
  const CLIENT_ID = clientRow.id;
  console.log(`  ✓ ${CLIENT_ID}`);

  // ── 2. Resolve coach ──────────────────────────────────────────
  console.log("\nStep 2: Resolving coach...");
  const [coachRow] = await db
    .select({ id: users.id })
    .from(users)
    .where(eq(users.role, "coach"))
    .limit(1);
  const COACH_ID: string | null = coachRow?.id ?? null;
  console.log(COACH_ID ? `  ✓ ${COACH_ID}` : "  ⚠ No coach found");

  // ── 3. Resolve exercises ──────────────────────────────────────
  console.log("\nStep 3: Resolving exercises...");
  const neededNames = [
    "Leg Press", "Romanian Deadlift", "Hip Thrust", "Bulgarian Split Squat",
    "Lat Pulldown", "Chest-Supported Dumbbell Row", "Dumbbell Bench Press",
    "Cable Lateral Raise", "Seated Leg Curl",
    "Cable Triceps Pressdown", "Dumbbell Curl",
    "Plank", "Stair Climber", "Banded Glute Walk",
  ];
  const exerciseRows = await db
    .select({ id: exercises.id, name: exercises.name })
    .from(exercises)
    .where(inArray(exercises.name, neededNames));

  const exerciseMap = new Map(exerciseRows.map((r) => [r.name, r.id]));
  let missing = false;
  for (const name of neededNames) {
    if (!exerciseMap.has(name)) {
      console.error(`  ✗ MISSING exercise: "${name}" — run seed-exercises.ts first`);
      missing = true;
    }
  }
  if (missing) { await sql.end(); process.exit(1); }
  console.log(`  ✓ All ${neededNames.length} exercises found`);

  // ── 4. Resolve enrollment ─────────────────────────────────────
  console.log("\nStep 4: Resolving enrollment...");
  const [enrollmentRow] = await db
    .select({ id: coachingEnrollments.id })
    .from(coachingEnrollments)
    .where(eq(coachingEnrollments.clientId, CLIENT_ID))
    .limit(1);
  const ENROLLMENT_ID: string | null = enrollmentRow?.id ?? null;
  console.log(ENROLLMENT_ID ? `  ✓ ${ENROLLMENT_ID}` : "  ⚠ No enrollment found — FK will be null");

  // ── 5. Clean up previous demo data ───────────────────────────
  console.log("\nStep 5: Cleaning up previous demo data...");
  await cleanupDemoData(CLIENT_ID);

  // ── 6. Create workout templates ───────────────────────────────
  console.log("\nStep 6: Creating workout templates...");
  const allTemplates = [B1_FULL_BODY_A, B1_FULL_BODY_B, B2_UPPER, B2_LOWER, B3_UPPER, B3_LOWER];
  for (const tmpl of allTemplates) {
    await createWorkoutTemplate(tmpl, exerciseMap);
    console.log(`  ✓ ${tmpl.name.replace(DEMO_SENTINEL + " — ", "")}`);
  }

  // ── 7. Block 1: Full Body Foundation ─────────────────────────
  console.log("\nStep 7: Block 1 — Full Body Foundation (6 weeks, completed)...");
  const b1Schedule: BlockSchedule = new Map([
    [1, B1_FULL_BODY_A], // Mon → A
    [3, B1_FULL_BODY_B], // Wed → B
    [5, B1_FULL_BODY_A], // Fri → A
  ]);
  const block1: BlockDef = {
    programName: `${DEMO_SENTINEL} — Block 1: Full Body Foundation`,
    description: "6-week full body fat loss foundation. 3 days/week. Establish movement quality and training habit.",
    startDate: BLOCK1_START,
    endDate: BLOCK1_END,
    status: "completed",
    totalWeeks: 6,
    schedule: b1Schedule,
    skipDates: B1_SKIPS,
  };
  const { sessionsCreated: b1Sessions, setsCreated: b1Sets } =
    await seedBlock(block1, CLIENT_ID, ENROLLMENT_ID);
  console.log(`  ✓ Block 1: ${b1Sessions} sessions, ${b1Sets} set logs`);

  // ── 8. Block 2: Upper/Lower Strength ─────────────────────────
  console.log("\nStep 8: Block 2 — Upper/Lower Strength (8 weeks, completed)...");
  const b2Schedule: BlockSchedule = new Map([
    [1, B2_UPPER], // Mon → Upper
    [2, B2_LOWER], // Tue → Lower
    [4, B2_UPPER], // Thu → Upper
    [5, B2_LOWER], // Fri → Lower
  ]);
  const block2: BlockDef = {
    programName: `${DEMO_SENTINEL} — Block 2: Upper/Lower Strength`,
    description: "8-week upper/lower split. 4 days/week. Progressive overload focus.",
    startDate: BLOCK2_START,
    endDate: BLOCK2_END,
    status: "completed",
    totalWeeks: 8,
    schedule: b2Schedule,
    skipDates: B2_SKIPS,
  };
  const { sessionsCreated: b2Sessions, setsCreated: b2Sets } =
    await seedBlock(block2, CLIENT_ID, ENROLLMENT_ID);
  console.log(`  ✓ Block 2: ${b2Sessions} sessions, ${b2Sets} set logs`);

  // ── 9. Block 3: Current (active) ─────────────────────────────
  console.log("\nStep 9: Block 3 — High Intensity Fat Loss (active, current)...");
  const b3Schedule: BlockSchedule = new Map([
    [1, B3_UPPER], // Mon
    [2, B3_LOWER], // Tue
    [4, B3_UPPER], // Thu
    [5, B3_LOWER], // Fri
  ]);
  // End at yesterday (don't create sessions in the future)
  const b3EndDate = toDateStr(addDays(new Date(), -1));
  const block3: BlockDef = {
    programName: `${DEMO_SENTINEL} — Block 3: High Intensity Fat Loss`,
    description: "Current block. 4 days/week upper/lower split. Tighter deficit, higher intensity.",
    startDate: BLOCK3_START,
    endDate: b3EndDate,
    status: "active",
    totalWeeks: 12,
    schedule: b3Schedule,
    skipDates: B3_SKIPS,
  };
  const { sessionsCreated: b3Sessions, setsCreated: b3Sets } =
    await seedBlock(block3, CLIENT_ID, ENROLLMENT_ID);
  console.log(`  ✓ Block 3: ${b3Sessions} sessions, ${b3Sets} set logs`);

  // ── 10. Weekly check-ins ──────────────────────────────────────
  console.log("\nStep 10: Creating weekly check-ins...");
  let checkInsCreated = 0;

  for (const ci of CHECK_INS) {
    const submittedAt = new Date(ci.weekStartDate + "T18:00:00Z");
    submittedAt.setUTCDate(submittedAt.getUTCDate() + 1); // Submitted Monday

    await db.insert(weeklyCheckIns).values({
      clientId:               CLIENT_ID,
      enrollmentId:           ENROLLMENT_ID,
      scheduledDate:          ci.weekStartDate,
      weekStartDate:          ci.weekStartDate,
      status:                 ci.status,
      submittedAt:            submittedAt,
      bodyWeightLbs:          String(ci.bodyWeightLbs),
      waistInches:            ci.waistInches != null ? String(ci.waistInches) : null,
      averageSleepHours:      String(ci.averageSleepHours),
      averageStress:          ci.averageStress,
      averageEnergy:          ci.averageEnergy,
      averageHunger:          ci.averageHunger,
      digestionRating:        ci.digestionRating,
      averageWaterOunces:     ci.averageWaterOunces,
      averageSteps:           ci.averageSteps,
      workoutCompliancePct:   ci.workoutCompliancePct,
      nutritionCompliancePct: ci.nutritionCompliancePct,
      wins:                   ci.wins,
      challenges:             ci.challenges,
      questions:              ci.questions,
      clientNotes:            `${DEMO_SENTINEL}`,
      coachResponse:          ci.coachResponse,
      reviewedBy:             ci.status === "reviewed" ? (COACH_ID ?? null) : null,
      coachReviewedAt:        ci.status === "reviewed"
        ? new Date(ci.weekStartDate + "T20:00:00Z")
        : null,
    });

    checkInsCreated++;
  }
  console.log(`  ✓ ${checkInsCreated} check-ins created`);

  // ── Summary ───────────────────────────────────────────────────
  const totalSessions = b1Sessions + b2Sessions + b3Sessions;
  const totalSets = b1Sets + b2Sets + b3Sets;

  console.log("\n═══════════════════════════════════════════════════════════");
  console.log("  SEED COMPLETE");
  console.log("═══════════════════════════════════════════════════════════");
  console.log(`\n  Programs:    3 blocks (Block 1: ${b1Sessions} sessions, Block 2: ${b2Sessions}, Block 3: ${b3Sessions})`);
  console.log(`  Sessions:    ${totalSessions} total  (${totalSets} set logs)`);
  console.log(`  Check-ins:   ${checkInsCreated} (${CHECK_INS.filter(c => c.status === "reviewed").length} reviewed, ${CHECK_INS.filter(c => c.status === "in_review").length} in review)`);
  console.log(`\n  Client HQ:   /hq/clients/${CLIENT_ID}`);
  console.log(`  Portal:      /portal  (log in as ${DEMO_CLIENT_EMAIL})`);
  console.log("═══════════════════════════════════════════════════════════\n");

  await sql.end();
}

// ─────────────────────────────────────────────────────────────
// CLEANUP
// ─────────────────────────────────────────────────────────────

async function cleanupDemoData(clientId: string) {
  // Find all demo client_programs
  const demoCPs = await db
    .select({ id: clientPrograms.id })
    .from(clientPrograms)
    .where(
      and(
        eq(clientPrograms.clientId, clientId),
        ilike(clientPrograms.coachNotes, `%${DEMO_SENTINEL}%`),
      ),
    );

  if (demoCPs.length > 0) {
    const cpIds = demoCPs.map((r) => r.id);

    // set_logs → sessions → client_program_week_days → client_program_weeks → client_programs
    const sessionRows = await db
      .select({ id: workoutSessions.id })
      .from(workoutSessions)
      .where(inArray(workoutSessions.clientProgramId, cpIds));

    if (sessionRows.length > 0) {
      await db
        .delete(workoutSetLogs)
        .where(inArray(workoutSetLogs.workoutSessionId, sessionRows.map(r => r.id)));
      await db
        .delete(workoutSessions)
        .where(inArray(workoutSessions.clientProgramId, cpIds));
    }

    const cpWeekRows = await db
      .select({ id: clientProgramWeeks.id })
      .from(clientProgramWeeks)
      .where(inArray(clientProgramWeeks.clientProgramId, cpIds));

    if (cpWeekRows.length > 0) {
      await db
        .delete(clientProgramWeekDays)
        .where(inArray(clientProgramWeekDays.clientProgramWeekId, cpWeekRows.map(r => r.id)));
      await db
        .delete(clientProgramWeeks)
        .where(inArray(clientProgramWeeks.clientProgramId, cpIds));
    }

    await db.delete(clientPrograms).where(inArray(clientPrograms.id, cpIds));
    console.log(`  ✓ Removed ${demoCPs.length} previous demo program(s) and their history`);
  }

  // Clean up demo program templates and workout templates by sentinel name
  const demoPTs = await db
    .select({ id: programTemplates.id })
    .from(programTemplates)
    .where(ilike(programTemplates.name, `%${DEMO_SENTINEL}%`));

  for (const pt of demoPTs) {
    const ptWeeks = await db
      .select({ id: programWeeks.id })
      .from(programWeeks)
      .where(eq(programWeeks.programTemplateId, pt.id));
    if (ptWeeks.length > 0) {
      await db.delete(programWeekDays)
        .where(inArray(programWeekDays.programWeekId, ptWeeks.map(r => r.id)));
      await db.delete(programWeeks).where(eq(programWeeks.programTemplateId, pt.id));
    }
    await db.delete(programTemplates).where(eq(programTemplates.id, pt.id));
  }
  if (demoPTs.length > 0) {
    console.log(`  ✓ Removed ${demoPTs.length} previous demo program template(s)`);
  }

  const demoWTs = await db
    .select({ id: workoutTemplates.id })
    .from(workoutTemplates)
    .where(ilike(workoutTemplates.name, `%${DEMO_SENTINEL}%`));

  for (const wt of demoWTs) {
    await db.delete(workoutTemplateExercises)
      .where(eq(workoutTemplateExercises.workoutTemplateId, wt.id));
    await db.delete(workoutTemplateSections)
      .where(eq(workoutTemplateSections.workoutTemplateId, wt.id));
    await db.delete(workoutTemplates).where(eq(workoutTemplates.id, wt.id));
  }
  if (demoWTs.length > 0) {
    console.log(`  ✓ Removed ${demoWTs.length} previous demo workout template(s)`);
  }

  // Clean up check-ins
  await db
    .delete(weeklyCheckIns)
    .where(
      and(
        eq(weeklyCheckIns.clientId, clientId),
        ilike(weeklyCheckIns.clientNotes, `%${DEMO_SENTINEL}%`),
      ),
    );
  // drizzle delete returns the deleted rows count differently per driver
  console.log(`  ✓ Check-ins cleared`);
}

// ─────────────────────────────────────────────────────────────
// CREATE WORKOUT TEMPLATE
// ─────────────────────────────────────────────────────────────

async function createWorkoutTemplate(
  tmpl: WorkoutTemplateDef,
  exerciseMap: Map<string, string>,
) {
  const [wtRow] = await db
    .insert(workoutTemplates)
    .values({
      name:                            tmpl.name,
      slug:                            tmpl.slug,
      description:                     tmpl.description,
      estimatedDurationMinutes:        tmpl.estimatedMinutes,
      recommendedExperienceLevel:      "intermediate",
      status:                          "active",
      minimumDaysPerWeek:              3,
      maximumDaysPerWeek:              4,
    })
    .returning({ id: workoutTemplates.id });

  tmpl.id = wtRow.id;

  for (const sec of tmpl.sections) {
    const [secRow] = await db
      .insert(workoutTemplateSections)
      .values({
        workoutTemplateId: tmpl.id,
        name:              sec.name,
        sectionType:       sec.sectionType as "warmup" | "activation" | "potentiation" | "main_lift" | "accessory" | "conditioning" | "finisher" | "cooldown" | "rest_period",
        orderIndex:        sec.orderIndex,
        estimatedMinutes:  sec.estimatedMinutes,
      })
      .returning({ id: workoutTemplateSections.id });

    sec.id = secRow.id;

    for (const ex of sec.exercises) {
      const exId = exerciseMap.get(ex.exerciseName);
      if (!exId) throw new Error(`Exercise not found: ${ex.exerciseName}`);
      ex.exerciseId = exId;

      const [exRow] = await db
        .insert(workoutTemplateExercises)
        .values({
          workoutTemplateId: tmpl.id!,
          sectionId:         sec.id,
          exerciseId:        exId,
          orderIndex:        ex.orderIndex,
          sets:              ex.sets,
          repsMin:           ex.repsMin,
          repsMax:           ex.repsMax,
          durationSeconds:   ex.durationSeconds,
          restSeconds:       ex.restSeconds,
          targetRpe:         ex.targetRpe ? String(ex.targetRpe) : null,
          coachNotes:        ex.coachNotes,
          isRequired:        ex.isRequired,
        })
        .returning({ id: workoutTemplateExercises.id });

      ex.id = exRow.id;
    }
  }
}

// ─────────────────────────────────────────────────────────────
// SEED BLOCK
// ─────────────────────────────────────────────────────────────

async function seedBlock(
  block: BlockDef,
  clientId: string,
  enrollmentId: string | null,
): Promise<{ sessionsCreated: number; setsCreated: number }> {
  // 1. Create program template
  const [ptRow] = await db
    .insert(programTemplates)
    .values({
      name:                   block.programName,
      slug:                   block.programName.toLowerCase().replace(/[^a-z0-9]+/g, "-").slice(0, 60),
      category:               "fat_loss",
      experienceLevel:        "intermediate",
      description:            block.description,
      recommendedDaysPerWeek: block.schedule.size,
      defaultDurationWeeks:   block.totalWeeks,
      status:                 "active",
      version:                1,
    })
    .returning({ id: programTemplates.id });
  const ptId = ptRow.id;

  // 2. Create template weeks + days
  for (let wk = 1; wk <= block.totalWeeks; wk++) {
    const [pwRow] = await db
      .insert(programWeeks)
      .values({ programTemplateId: ptId, weekNumber: wk, label: `Week ${wk}` })
      .returning({ id: programWeeks.id });

    for (const [dow, tmpl] of block.schedule) {
      await db.insert(programWeekDays).values({
        programWeekId:      pwRow.id,
        dayOfWeek:          dow,
        workoutTemplateId:  tmpl.id!,
        label:              tmpl.name.replace(DEMO_SENTINEL + " — ", ""),
      });
    }
  }

  // 3. Create client_program (mirrors assignProgram service)
  const [cpRow] = await db
    .insert(clientPrograms)
    .values({
      clientId,
      enrollmentId:           enrollmentId ?? undefined,
      programTemplateId:      ptId,
      startDate:              block.startDate,
      endDate:                block.endDate ?? undefined,
      status:                 block.status,
      sourceTemplateName:     block.programName,
      sourceTemplateVersion:  1,
      coachNotes:             `${DEMO_SENTINEL} — ${block.description}`,
    })
    .returning({ id: clientPrograms.id });
  const cpId = cpRow.id;

  // 4. Deep-copy weeks + days to client-owned rows
  const templateWeeks = await db
    .select({ id: programWeeks.id, weekNumber: programWeeks.weekNumber, label: programWeeks.label })
    .from(programWeeks)
    .where(eq(programWeeks.programTemplateId, ptId))
    .orderBy(programWeeks.weekNumber);

  for (const week of templateWeeks) {
    const [cpwRow] = await db
      .insert(clientProgramWeeks)
      .values({ clientProgramId: cpId, sourceWeekId: week.id, weekNumber: week.weekNumber, label: week.label })
      .returning({ id: clientProgramWeeks.id });

    const templateDays = await db
      .select({ id: programWeekDays.id, dayOfWeek: programWeekDays.dayOfWeek, workoutTemplateId: programWeekDays.workoutTemplateId, label: programWeekDays.label })
      .from(programWeekDays)
      .where(eq(programWeekDays.programWeekId, week.id));

    for (const day of templateDays) {
      await db.insert(clientProgramWeekDays).values({
        clientProgramWeekId: cpwRow.id,
        sourceDayId:         day.id,
        dayOfWeek:           day.dayOfWeek,
        workoutTemplateId:   day.workoutTemplateId,
        label:               day.label,
      });
    }
  }

  // 5. Generate sessions + set logs
  const dows = [...block.schedule.keys()];
  const endDateStr = block.endDate ?? toDateStr(new Date());
  const dates = sessionDates(block.startDate, endDateStr, dows);

  let sessionsCreated = 0;
  let setsCreated = 0;

  for (const { date, dow } of dates) {
    const tmpl = block.schedule.get(dow)!;
    const isSkip = block.skipDates.has(date);
    const wk = weekNum(block.startDate, date);
    const completedAt = new Date(date + "T19:30:00Z");
    const startedAt   = new Date(date + "T18:00:00Z");
    const rpe = sessionRpe(wk, block.totalWeeks);

    // Build the snapshot from the template (mirrors buildWorkoutSnapshot)
    const snapshot = buildSnapshot(tmpl);

    if (isSkip) {
      await db.insert(workoutSessions).values({
        clientId,
        clientProgramId:   cpId,
        workoutTemplateId: tmpl.id!,
        programWeekNumber: wk,
        programDayOfWeek:  dow,
        scheduledDate:     date,
        status:            "skipped",
        completionPercent: 0,
        workoutSnapshot:   snapshot,
      });
      sessionsCreated++;
      continue;
    }

    // Create completed session
    const [sessionRow] = await db
      .insert(workoutSessions)
      .values({
        clientId,
        clientProgramId:   cpId,
        workoutTemplateId: tmpl.id!,
        programWeekNumber: wk,
        programDayOfWeek:  dow,
        scheduledDate:     date,
        startedAt,
        completedAt,
        status:            "completed",
        completionPercent: 100,
        workoutSnapshot:   snapshot,
      })
      .returning({ id: workoutSessions.id });
    sessionsCreated++;

    // Create set logs for main section exercises (not warmup/cardio)
    for (const sec of tmpl.sections) {
      if (sec.sectionType !== "main_lift") continue;

      for (const ex of sec.exercises) {
        if (!ex.sets || !ex.id) continue;
        const weightKg = ex.baseWeightKg != null
          ? weeklyWeight(ex.baseWeightKg, ex.weeklyGainKg, wk)
          : null;

        for (let setNum = 1; setNum <= ex.sets; setNum++) {
          const repsDone = ex.repsMax != null ? actualReps(ex.repsMax, setNum) : null;
          const setTime = new Date(startedAt.getTime() + setNum * 180_000);

          await db.insert(workoutSetLogs).values({
            workoutSessionId:          sessionRow.id,
            workoutTemplateExerciseId: ex.id,
            setNumber:                 setNum,
            completedAt:               setTime,
            actualReps:                repsDone,
            actualWeightKg:            weightKg != null ? String(weightKg) : null,
            actualRpe:                 String(rpe),
          });
          setsCreated++;
        }
      }
    }
  }

  return { sessionsCreated, setsCreated };
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
