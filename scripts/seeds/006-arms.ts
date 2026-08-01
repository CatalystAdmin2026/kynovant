#!/usr/bin/env npx tsx
// ─────────────────────────────────────────────────────────────
// Catalyst OS — Exercise Library Seed 006: Arms
//
// Usage:
//   source .env.local && npx tsx scripts/seeds/006-arms.ts
//
// Covers:
//   Elbow flexion — barbell, EZ-bar, dumbbell, cable, machine, band curls
//   Biceps/brachialis/brachioradialis emphasis variants — hammer, preacher,
//     spider, drag, zottman, reverse, concentration, single-arm
//   Elbow extension — cable pushdowns, overhead extensions, skull crushers,
//     JM press, kickbacks, machine, band
//
// Count: 40 exercises
// Spec: docs/exercise-intelligence-spec.md
// ─────────────────────────────────────────────────────────────

import { SHARED_EQUIPMENT, db, sql, seedEquipment, seedExercises } from "./_shared";
import type { MuscleGroup, MuscleRole, EquipmentRequirement, ExerciseCueType, ExerciseRelationType } from "./_shared";

// ─── EXERCISES ───────────────────────────────────────────────

const EXERCISES = [

  // ── Biceps: Barbell / EZ-Bar ──────────────────────────────

  { slug: "barbell-curl", name: "Barbell Curl",
    movementPattern: "elbow_flexion" as const, classification: "isolation" as const,
    resistanceType: "barbell" as const, difficulty: "beginner" as const,
    defaultBodyPosition: "standing" as const,
    fatigueCost: 3, technicalComplexity: 3, stabilityDemand: 3,
    jointStressElbow: 4, jointStressWrist: 3,
    lengthenedBias: 3, shortenedBias: 6, stretchMediatedPotential: 2 },

  { slug: "ez-bar-curl", name: "EZ-Bar Curl",
    movementPattern: "elbow_flexion" as const, classification: "isolation" as const,
    resistanceType: "barbell" as const, difficulty: "beginner" as const,
    defaultBodyPosition: "standing" as const,
    fatigueCost: 3, technicalComplexity: 2, stabilityDemand: 3,
    jointStressElbow: 4, jointStressWrist: 2,
    lengthenedBias: 3, shortenedBias: 6, stretchMediatedPotential: 2 },

  { slug: "barbell-drag-curl", name: "Barbell Drag Curl",
    movementPattern: "elbow_flexion" as const, classification: "isolation" as const,
    resistanceType: "barbell" as const, difficulty: "intermediate" as const,
    defaultBodyPosition: "standing" as const,
    fatigueCost: 3, technicalComplexity: 4, stabilityDemand: 3,
    jointStressElbow: 4, jointStressWrist: 3, jointStressShoulder: 2,
    lengthenedBias: 3, shortenedBias: 7, stretchMediatedPotential: 3 },

  { slug: "reverse-barbell-curl", name: "Reverse Barbell Curl",
    movementPattern: "elbow_flexion" as const, classification: "isolation" as const,
    resistanceType: "barbell" as const, difficulty: "intermediate" as const,
    defaultBodyPosition: "standing" as const,
    fatigueCost: 3, technicalComplexity: 3, stabilityDemand: 3,
    jointStressElbow: 4, jointStressWrist: 4,
    lengthenedBias: 3, shortenedBias: 6, stretchMediatedPotential: 2 },

  { slug: "barbell-preacher-curl", name: "Barbell Preacher Curl",
    movementPattern: "elbow_flexion" as const, classification: "isolation" as const,
    resistanceType: "barbell" as const, difficulty: "intermediate" as const,
    defaultBodyPosition: "seated" as const,
    fatigueCost: 3, technicalComplexity: 3, stabilityDemand: 2,
    jointStressElbow: 5, jointStressWrist: 3,
    lengthenedBias: 6, shortenedBias: 4, stretchMediatedPotential: 6 },

  { slug: "ez-bar-spider-curl", name: "EZ-Bar Spider Curl",
    movementPattern: "elbow_flexion" as const, classification: "isolation" as const,
    resistanceType: "barbell" as const, difficulty: "intermediate" as const,
    defaultBodyPosition: "incline" as const,
    fatigueCost: 3, technicalComplexity: 4, stabilityDemand: 2,
    jointStressElbow: 4, jointStressWrist: 3,
    lengthenedBias: 7, shortenedBias: 5, stretchMediatedPotential: 7 },

  // ── Biceps: Dumbbell ───────────────────────────────────────

  { slug: "standing-dumbbell-curl", name: "Standing Dumbbell Curl",
    movementPattern: "elbow_flexion" as const, classification: "isolation" as const,
    resistanceType: "dumbbell" as const, difficulty: "beginner" as const,
    defaultBodyPosition: "standing" as const,
    fatigueCost: 2, technicalComplexity: 2, stabilityDemand: 3,
    jointStressElbow: 3, jointStressWrist: 2,
    lengthenedBias: 4, shortenedBias: 6, stretchMediatedPotential: 3 },

  { slug: "alternating-dumbbell-curl", name: "Alternating Dumbbell Curl",
    movementPattern: "elbow_flexion" as const, classification: "isolation" as const,
    resistanceType: "dumbbell" as const, difficulty: "beginner" as const,
    alternating: true, defaultBodyPosition: "standing" as const,
    fatigueCost: 2, technicalComplexity: 2, stabilityDemand: 3,
    jointStressElbow: 3, jointStressWrist: 2,
    lengthenedBias: 4, shortenedBias: 6, stretchMediatedPotential: 3 },

  { slug: "seated-dumbbell-curl", name: "Seated Dumbbell Curl",
    movementPattern: "elbow_flexion" as const, classification: "isolation" as const,
    resistanceType: "dumbbell" as const, difficulty: "beginner" as const,
    defaultBodyPosition: "seated" as const,
    fatigueCost: 2, technicalComplexity: 2, stabilityDemand: 2,
    jointStressElbow: 3, jointStressWrist: 2,
    lengthenedBias: 4, shortenedBias: 6, stretchMediatedPotential: 3 },

  { slug: "incline-dumbbell-curl", name: "Incline Dumbbell Curl",
    movementPattern: "elbow_flexion" as const, classification: "isolation" as const,
    resistanceType: "dumbbell" as const, difficulty: "intermediate" as const,
    defaultBodyPosition: "incline" as const,
    fatigueCost: 2, technicalComplexity: 4, stabilityDemand: 4,
    jointStressElbow: 4, jointStressWrist: 2, jointStressShoulder: 2,
    lengthenedBias: 8, shortenedBias: 3, stretchMediatedPotential: 8 },

  { slug: "dumbbell-preacher-curl", name: "Dumbbell Preacher Curl",
    movementPattern: "elbow_flexion" as const, classification: "isolation" as const,
    resistanceType: "dumbbell" as const, difficulty: "intermediate" as const,
    defaultBodyPosition: "seated" as const,
    fatigueCost: 2, technicalComplexity: 3, stabilityDemand: 2,
    jointStressElbow: 4, jointStressWrist: 2,
    lengthenedBias: 6, shortenedBias: 4, stretchMediatedPotential: 6 },

  { slug: "concentration-curl", name: "Concentration Curl",
    movementPattern: "elbow_flexion" as const, classification: "isolation" as const,
    resistanceType: "dumbbell" as const, difficulty: "beginner" as const,
    unilateral: true, defaultBodyPosition: "seated" as const,
    fatigueCost: 1, technicalComplexity: 2, stabilityDemand: 2,
    jointStressElbow: 3, jointStressWrist: 2,
    lengthenedBias: 5, shortenedBias: 6, stretchMediatedPotential: 4 },

  { slug: "dumbbell-zottman-curl", name: "Dumbbell Zottman Curl",
    movementPattern: "elbow_flexion" as const, classification: "isolation" as const,
    resistanceType: "dumbbell" as const, difficulty: "intermediate" as const,
    defaultBodyPosition: "standing" as const,
    fatigueCost: 3, technicalComplexity: 4, stabilityDemand: 3,
    jointStressElbow: 4, jointStressWrist: 4,
    lengthenedBias: 4, shortenedBias: 6, stretchMediatedPotential: 3 },

  { slug: "hammer-curl", name: "Hammer Curl",
    movementPattern: "elbow_flexion" as const, classification: "isolation" as const,
    resistanceType: "dumbbell" as const, difficulty: "beginner" as const,
    defaultBodyPosition: "standing" as const,
    fatigueCost: 2, technicalComplexity: 2, stabilityDemand: 3,
    jointStressElbow: 3, jointStressWrist: 2,
    lengthenedBias: 3, shortenedBias: 6, stretchMediatedPotential: 2 },

  { slug: "cross-body-hammer-curl", name: "Cross-Body Hammer Curl",
    movementPattern: "elbow_flexion" as const, classification: "isolation" as const,
    resistanceType: "dumbbell" as const, difficulty: "beginner" as const,
    alternating: true, defaultBodyPosition: "standing" as const,
    fatigueCost: 2, technicalComplexity: 3, stabilityDemand: 3,
    jointStressElbow: 3, jointStressWrist: 2,
    lengthenedBias: 3, shortenedBias: 6, stretchMediatedPotential: 2 },

  // ── Biceps: Cable, Machine, Band ──────────────────────────

  { slug: "cable-curl-straight-bar", name: "Cable Curl (Straight Bar)",
    movementPattern: "elbow_flexion" as const, classification: "isolation" as const,
    resistanceType: "cable" as const, difficulty: "beginner" as const,
    defaultBodyPosition: "standing" as const,
    fatigueCost: 2, technicalComplexity: 2, stabilityDemand: 3,
    jointStressElbow: 3, jointStressWrist: 1,
    lengthenedBias: 4, shortenedBias: 7, stretchMediatedPotential: 4 },

  { slug: "cable-rope-hammer-curl", name: "Cable Rope Hammer Curl",
    movementPattern: "elbow_flexion" as const, classification: "isolation" as const,
    resistanceType: "cable" as const, difficulty: "beginner" as const,
    defaultBodyPosition: "standing" as const,
    fatigueCost: 2, technicalComplexity: 2, stabilityDemand: 3,
    jointStressElbow: 3, jointStressWrist: 1,
    lengthenedBias: 4, shortenedBias: 7, stretchMediatedPotential: 3 },

  { slug: "single-arm-cable-curl", name: "Single-Arm Cable Curl",
    movementPattern: "elbow_flexion" as const, classification: "isolation" as const,
    resistanceType: "cable" as const, difficulty: "intermediate" as const,
    unilateral: true, defaultBodyPosition: "standing" as const,
    fatigueCost: 1, technicalComplexity: 3, stabilityDemand: 4,
    jointStressElbow: 3, jointStressWrist: 1,
    lengthenedBias: 4, shortenedBias: 7, stretchMediatedPotential: 4 },

  { slug: "machine-bicep-curl", name: "Machine Bicep Curl",
    movementPattern: "elbow_flexion" as const, classification: "isolation" as const,
    resistanceType: "machine" as const, difficulty: "beginner" as const,
    defaultBodyPosition: "seated" as const,
    fatigueCost: 1, technicalComplexity: 1, stabilityDemand: 1,
    jointStressElbow: 3, jointStressWrist: 0,
    lengthenedBias: 4, shortenedBias: 7, stretchMediatedPotential: 3 },

  { slug: "band-bicep-curl", name: "Band Bicep Curl",
    movementPattern: "elbow_flexion" as const, classification: "isolation" as const,
    resistanceType: "band" as const, difficulty: "beginner" as const,
    defaultBodyPosition: "standing" as const,
    fatigueCost: 2, technicalComplexity: 1, stabilityDemand: 2,
    jointStressElbow: 2, jointStressWrist: 1,
    lengthenedBias: 2, shortenedBias: 8, stretchMediatedPotential: 1 },

  // ── Triceps: Cable Pushdowns ───────────────────────────────

  { slug: "cable-triceps-pushdown-straight-bar", name: "Cable Triceps Pushdown (Straight Bar)",
    movementPattern: "elbow_extension" as const, classification: "isolation" as const,
    resistanceType: "cable" as const, difficulty: "beginner" as const,
    defaultBodyPosition: "standing" as const,
    fatigueCost: 2, technicalComplexity: 2, stabilityDemand: 3,
    jointStressElbow: 3, jointStressWrist: 1,
    lengthenedBias: 2, shortenedBias: 8, stretchMediatedPotential: 1 },

  { slug: "cable-rope-triceps-pushdown", name: "Cable Rope Triceps Pushdown",
    movementPattern: "elbow_extension" as const, classification: "isolation" as const,
    resistanceType: "cable" as const, difficulty: "beginner" as const,
    defaultBodyPosition: "standing" as const,
    fatigueCost: 2, technicalComplexity: 2, stabilityDemand: 3,
    jointStressElbow: 3, jointStressWrist: 1,
    lengthenedBias: 2, shortenedBias: 8, stretchMediatedPotential: 1 },

  { slug: "reverse-grip-cable-pushdown", name: "Reverse-Grip Cable Pushdown",
    movementPattern: "elbow_extension" as const, classification: "isolation" as const,
    resistanceType: "cable" as const, difficulty: "intermediate" as const,
    defaultBodyPosition: "standing" as const,
    fatigueCost: 2, technicalComplexity: 3, stabilityDemand: 3,
    jointStressElbow: 3, jointStressWrist: 3,
    lengthenedBias: 2, shortenedBias: 8, stretchMediatedPotential: 1 },

  { slug: "single-arm-cable-pushdown", name: "Single-Arm Cable Pushdown",
    movementPattern: "elbow_extension" as const, classification: "isolation" as const,
    resistanceType: "cable" as const, difficulty: "intermediate" as const,
    unilateral: true, defaultBodyPosition: "standing" as const,
    fatigueCost: 1, technicalComplexity: 3, stabilityDemand: 4,
    jointStressElbow: 3, jointStressWrist: 1,
    lengthenedBias: 2, shortenedBias: 8, stretchMediatedPotential: 1 },

  { slug: "band-triceps-pushdown", name: "Band Triceps Pushdown",
    movementPattern: "elbow_extension" as const, classification: "isolation" as const,
    resistanceType: "band" as const, difficulty: "beginner" as const,
    defaultBodyPosition: "standing" as const,
    fatigueCost: 2, technicalComplexity: 1, stabilityDemand: 2,
    jointStressElbow: 2, jointStressWrist: 1,
    lengthenedBias: 1, shortenedBias: 8, stretchMediatedPotential: 1 },

  // ── Triceps: Overhead Extension ────────────────────────────

  { slug: "overhead-cable-triceps-extension", name: "Overhead Cable Triceps Extension",
    movementPattern: "elbow_extension" as const, classification: "isolation" as const,
    resistanceType: "cable" as const, difficulty: "intermediate" as const,
    defaultBodyPosition: "standing" as const,
    fatigueCost: 2, technicalComplexity: 3, stabilityDemand: 4,
    jointStressElbow: 5, jointStressWrist: 2, jointStressShoulder: 3,
    lengthenedBias: 8, shortenedBias: 3, stretchMediatedPotential: 8 },

  { slug: "seated-overhead-dumbbell-triceps-extension-two-hand", name: "Seated Overhead Dumbbell Triceps Extension (Two-Hand)",
    movementPattern: "elbow_extension" as const, classification: "isolation" as const,
    resistanceType: "dumbbell" as const, difficulty: "intermediate" as const,
    defaultBodyPosition: "seated" as const,
    fatigueCost: 2, technicalComplexity: 3, stabilityDemand: 3,
    jointStressElbow: 5, jointStressWrist: 2, jointStressShoulder: 3,
    lengthenedBias: 8, shortenedBias: 3, stretchMediatedPotential: 8 },

  { slug: "single-arm-overhead-dumbbell-triceps-extension", name: "Single-Arm Overhead Dumbbell Triceps Extension",
    movementPattern: "elbow_extension" as const, classification: "isolation" as const,
    resistanceType: "dumbbell" as const, difficulty: "intermediate" as const,
    unilateral: true, defaultBodyPosition: "standing" as const,
    fatigueCost: 1, technicalComplexity: 4, stabilityDemand: 5,
    jointStressElbow: 5, jointStressWrist: 2, jointStressShoulder: 3,
    lengthenedBias: 8, shortenedBias: 3, stretchMediatedPotential: 8 },

  { slug: "standing-overhead-dumbbell-triceps-extension", name: "Standing Overhead Dumbbell Triceps Extension (Two-Hand)",
    movementPattern: "elbow_extension" as const, classification: "isolation" as const,
    resistanceType: "dumbbell" as const, difficulty: "beginner" as const,
    defaultBodyPosition: "standing" as const,
    fatigueCost: 2, technicalComplexity: 3, stabilityDemand: 4,
    jointStressElbow: 5, jointStressWrist: 2, jointStressShoulder: 3,
    lengthenedBias: 8, shortenedBias: 3, stretchMediatedPotential: 8 },

  { slug: "single-arm-overhead-cable-triceps-extension", name: "Single-Arm Overhead Cable Triceps Extension",
    movementPattern: "elbow_extension" as const, classification: "isolation" as const,
    resistanceType: "cable" as const, difficulty: "intermediate" as const,
    unilateral: true, defaultBodyPosition: "standing" as const,
    fatigueCost: 1, technicalComplexity: 4, stabilityDemand: 5,
    jointStressElbow: 5, jointStressWrist: 2, jointStressShoulder: 3,
    lengthenedBias: 8, shortenedBias: 3, stretchMediatedPotential: 8 },

  // ── Triceps: Lying / Skull Crusher Family ─────────────────

  { slug: "barbell-skull-crusher", name: "Barbell Skull Crusher (Lying Triceps Extension)",
    movementPattern: "elbow_extension" as const, classification: "isolation" as const,
    resistanceType: "barbell" as const, difficulty: "intermediate" as const,
    defaultBodyPosition: "lying_supine" as const,
    fatigueCost: 3, technicalComplexity: 5, stabilityDemand: 2,
    jointStressElbow: 5, jointStressWrist: 3, jointStressShoulder: 2,
    lengthenedBias: 7, shortenedBias: 3, stretchMediatedPotential: 7 },

  { slug: "ez-bar-skull-crusher", name: "EZ-Bar Skull Crusher",
    movementPattern: "elbow_extension" as const, classification: "isolation" as const,
    resistanceType: "barbell" as const, difficulty: "intermediate" as const,
    defaultBodyPosition: "lying_supine" as const,
    fatigueCost: 3, technicalComplexity: 5, stabilityDemand: 2,
    jointStressElbow: 5, jointStressWrist: 2, jointStressShoulder: 2,
    lengthenedBias: 7, shortenedBias: 3, stretchMediatedPotential: 7 },

  { slug: "dumbbell-skull-crusher", name: "Dumbbell Skull Crusher",
    movementPattern: "elbow_extension" as const, classification: "isolation" as const,
    resistanceType: "dumbbell" as const, difficulty: "intermediate" as const,
    defaultBodyPosition: "lying_supine" as const,
    fatigueCost: 2, technicalComplexity: 5, stabilityDemand: 3,
    jointStressElbow: 5, jointStressWrist: 2, jointStressShoulder: 2,
    lengthenedBias: 7, shortenedBias: 3, stretchMediatedPotential: 7 },

  { slug: "jm-press", name: "JM Press",
    movementPattern: "elbow_extension" as const, classification: "compound" as const,
    resistanceType: "barbell" as const, difficulty: "advanced" as const,
    defaultBodyPosition: "lying_supine" as const,
    fatigueCost: 6, technicalComplexity: 7, stabilityDemand: 3,
    jointStressElbow: 7, jointStressWrist: 3, jointStressShoulder: 3,
    lengthenedBias: 6, shortenedBias: 5, stretchMediatedPotential: 6 },

  { slug: "cable-lying-triceps-extension", name: "Cable Lying Triceps Extension",
    movementPattern: "elbow_extension" as const, classification: "isolation" as const,
    resistanceType: "cable" as const, difficulty: "intermediate" as const,
    defaultBodyPosition: "lying_supine" as const,
    fatigueCost: 2, technicalComplexity: 4, stabilityDemand: 3,
    jointStressElbow: 4, jointStressWrist: 2, jointStressShoulder: 2,
    lengthenedBias: 7, shortenedBias: 4, stretchMediatedPotential: 7 },

  { slug: "tate-press", name: "Tate Press",
    movementPattern: "elbow_extension" as const, classification: "isolation" as const,
    resistanceType: "dumbbell" as const, difficulty: "intermediate" as const,
    defaultBodyPosition: "lying_supine" as const,
    fatigueCost: 3, technicalComplexity: 5, stabilityDemand: 3,
    jointStressElbow: 5, jointStressWrist: 3, jointStressShoulder: 2,
    lengthenedBias: 5, shortenedBias: 6, stretchMediatedPotential: 5 },

  // ── Triceps: Kickback, Machine ────────────────────────────

  { slug: "dumbbell-triceps-kickback", name: "Dumbbell Triceps Kickback",
    movementPattern: "elbow_extension" as const, classification: "isolation" as const,
    resistanceType: "dumbbell" as const, difficulty: "beginner" as const,
    defaultBodyPosition: "hinge_position" as const,
    fatigueCost: 2, technicalComplexity: 3, stabilityDemand: 4,
    jointStressElbow: 3, jointStressWrist: 1,
    lengthenedBias: 2, shortenedBias: 8, stretchMediatedPotential: 1 },

  { slug: "cable-triceps-kickback", name: "Cable Triceps Kickback",
    movementPattern: "elbow_extension" as const, classification: "isolation" as const,
    resistanceType: "cable" as const, difficulty: "intermediate" as const,
    unilateral: true, defaultBodyPosition: "standing" as const,
    fatigueCost: 1, technicalComplexity: 3, stabilityDemand: 4,
    jointStressElbow: 3, jointStressWrist: 1,
    lengthenedBias: 2, shortenedBias: 8, stretchMediatedPotential: 1 },

  { slug: "cross-body-cable-triceps-extension", name: "Cross-Body Cable Triceps Extension",
    movementPattern: "elbow_extension" as const, classification: "isolation" as const,
    resistanceType: "cable" as const, difficulty: "intermediate" as const,
    unilateral: true, defaultBodyPosition: "standing" as const,
    fatigueCost: 1, technicalComplexity: 3, stabilityDemand: 4,
    jointStressElbow: 3, jointStressWrist: 1,
    lengthenedBias: 3, shortenedBias: 7, stretchMediatedPotential: 3 },

  { slug: "machine-triceps-extension", name: "Machine Triceps Extension",
    movementPattern: "elbow_extension" as const, classification: "isolation" as const,
    resistanceType: "machine" as const, difficulty: "beginner" as const,
    defaultBodyPosition: "seated" as const,
    fatigueCost: 1, technicalComplexity: 1, stabilityDemand: 1,
    jointStressElbow: 3, jointStressWrist: 0,
    lengthenedBias: 3, shortenedBias: 7, stretchMediatedPotential: 3 },

] as const;

// ─── MUSCLES ─────────────────────────────────────────────────
// [slug, muscle_group, role]

const MUSCLES: Array<[string, MuscleGroup, MuscleRole]> = [

  // Biceps: barbell / EZ-bar
  ["barbell-curl",                 "biceps",           "primary"],
  ["barbell-curl",                 "brachialis",       "secondary"],
  ["barbell-curl",                 "forearms",         "stabilizer"],

  ["ez-bar-curl",                  "biceps",           "primary"],
  ["ez-bar-curl",                  "brachialis",       "secondary"],
  ["ez-bar-curl",                  "forearms",         "stabilizer"],

  ["barbell-drag-curl",            "biceps",           "primary"],
  ["barbell-drag-curl",            "brachialis",       "secondary"],
  ["barbell-drag-curl",            "rear_deltoid",     "stabilizer"],
  ["barbell-drag-curl",            "forearms",         "stabilizer"],

  ["reverse-barbell-curl",         "brachioradialis",  "primary"],
  ["reverse-barbell-curl",         "biceps",           "secondary"],
  ["reverse-barbell-curl",         "forearms",         "stabilizer"],

  ["barbell-preacher-curl",        "biceps",           "primary"],
  ["barbell-preacher-curl",        "brachialis",       "secondary"],
  ["barbell-preacher-curl",        "forearms",         "stabilizer"],

  ["ez-bar-spider-curl",           "biceps",           "primary"],
  ["ez-bar-spider-curl",           "brachialis",       "secondary"],
  ["ez-bar-spider-curl",           "forearms",         "stabilizer"],

  // Biceps: dumbbell
  ["standing-dumbbell-curl",       "biceps",           "primary"],
  ["standing-dumbbell-curl",       "brachialis",       "secondary"],
  ["standing-dumbbell-curl",       "forearms",         "stabilizer"],

  ["alternating-dumbbell-curl",    "biceps",           "primary"],
  ["alternating-dumbbell-curl",    "brachialis",       "secondary"],
  ["alternating-dumbbell-curl",    "forearms",         "stabilizer"],

  ["seated-dumbbell-curl",         "biceps",           "primary"],
  ["seated-dumbbell-curl",         "brachialis",       "secondary"],
  ["seated-dumbbell-curl",         "forearms",         "stabilizer"],

  ["incline-dumbbell-curl",        "biceps",           "primary"],
  ["incline-dumbbell-curl",        "brachialis",       "secondary"],
  ["incline-dumbbell-curl",        "front_deltoid",    "stabilizer"],
  ["incline-dumbbell-curl",        "forearms",         "stabilizer"],

  ["dumbbell-preacher-curl",       "biceps",           "primary"],
  ["dumbbell-preacher-curl",       "brachialis",       "secondary"],
  ["dumbbell-preacher-curl",       "forearms",         "stabilizer"],

  ["concentration-curl",           "biceps",           "primary"],
  ["concentration-curl",           "brachialis",       "secondary"],
  ["concentration-curl",           "forearms",         "stabilizer"],

  ["dumbbell-zottman-curl",        "biceps",           "primary"],
  ["dumbbell-zottman-curl",        "brachialis",       "secondary"],
  ["dumbbell-zottman-curl",        "forearms",         "secondary"],

  ["hammer-curl",                  "brachialis",       "primary"],
  ["hammer-curl",                  "biceps",           "secondary"],
  ["hammer-curl",                  "brachioradialis",  "stabilizer"],
  ["hammer-curl",                  "forearms",         "stabilizer"],

  ["cross-body-hammer-curl",       "brachialis",       "primary"],
  ["cross-body-hammer-curl",       "biceps",           "secondary"],
  ["cross-body-hammer-curl",       "brachioradialis",  "stabilizer"],
  ["cross-body-hammer-curl",       "forearms",         "stabilizer"],

  // Biceps: cable, machine, band
  ["cable-curl-straight-bar",      "biceps",           "primary"],
  ["cable-curl-straight-bar",      "brachialis",       "secondary"],
  ["cable-curl-straight-bar",      "forearms",         "stabilizer"],

  ["cable-rope-hammer-curl",       "brachialis",       "primary"],
  ["cable-rope-hammer-curl",       "biceps",           "secondary"],
  ["cable-rope-hammer-curl",       "brachioradialis",  "stabilizer"],
  ["cable-rope-hammer-curl",       "forearms",         "stabilizer"],

  ["single-arm-cable-curl",        "biceps",           "primary"],
  ["single-arm-cable-curl",        "brachialis",       "secondary"],
  ["single-arm-cable-curl",        "obliques",         "stabilizer"],
  ["single-arm-cable-curl",        "forearms",         "stabilizer"],

  ["machine-bicep-curl",           "biceps",           "primary"],
  ["machine-bicep-curl",           "brachialis",       "secondary"],

  ["band-bicep-curl",              "biceps",           "primary"],
  ["band-bicep-curl",              "brachialis",       "secondary"],
  ["band-bicep-curl",              "forearms",         "stabilizer"],

  // Triceps: cable pushdowns
  ["cable-triceps-pushdown-straight-bar", "triceps",   "primary"],
  ["cable-triceps-pushdown-straight-bar", "forearms",  "stabilizer"],

  ["cable-rope-triceps-pushdown",  "triceps",          "primary"],
  ["cable-rope-triceps-pushdown",  "forearms",         "stabilizer"],

  ["reverse-grip-cable-pushdown",  "triceps",          "primary"],
  ["reverse-grip-cable-pushdown",  "forearms",         "stabilizer"],

  ["single-arm-cable-pushdown",    "triceps",          "primary"],
  ["single-arm-cable-pushdown",    "obliques",         "stabilizer"],
  ["single-arm-cable-pushdown",    "forearms",         "stabilizer"],

  ["band-triceps-pushdown",        "triceps",          "primary"],
  ["band-triceps-pushdown",        "forearms",         "stabilizer"],

  // Triceps: overhead extension
  ["overhead-cable-triceps-extension", "triceps",      "primary"],
  ["overhead-cable-triceps-extension", "front_deltoid","stabilizer"],

  ["seated-overhead-dumbbell-triceps-extension-two-hand", "triceps",       "primary"],
  ["seated-overhead-dumbbell-triceps-extension-two-hand", "front_deltoid", "stabilizer"],

  ["single-arm-overhead-dumbbell-triceps-extension", "triceps",       "primary"],
  ["single-arm-overhead-dumbbell-triceps-extension", "front_deltoid", "stabilizer"],
  ["single-arm-overhead-dumbbell-triceps-extension", "obliques",      "stabilizer"],

  ["standing-overhead-dumbbell-triceps-extension", "triceps",         "primary"],
  ["standing-overhead-dumbbell-triceps-extension", "front_deltoid",   "stabilizer"],

  ["single-arm-overhead-cable-triceps-extension", "triceps",          "primary"],
  ["single-arm-overhead-cable-triceps-extension", "front_deltoid",    "stabilizer"],
  ["single-arm-overhead-cable-triceps-extension", "obliques",         "stabilizer"],

  // Triceps: lying / skull crusher family
  ["barbell-skull-crusher",        "triceps",          "primary"],
  ["barbell-skull-crusher",        "front_deltoid",    "stabilizer"],

  ["ez-bar-skull-crusher",         "triceps",          "primary"],
  ["ez-bar-skull-crusher",         "front_deltoid",    "stabilizer"],

  ["dumbbell-skull-crusher",       "triceps",          "primary"],
  ["dumbbell-skull-crusher",       "front_deltoid",    "stabilizer"],

  ["jm-press",                     "triceps",          "primary"],
  ["jm-press",                     "chest",            "secondary"],
  ["jm-press",                     "front_deltoid",    "secondary"],

  ["cable-lying-triceps-extension","triceps",          "primary"],
  ["cable-lying-triceps-extension","front_deltoid",    "stabilizer"],

  ["tate-press",                   "triceps",          "primary"],
  ["tate-press",                   "chest",            "secondary"],
  ["tate-press",                   "front_deltoid",    "secondary"],

  // Triceps: kickback, machine
  ["dumbbell-triceps-kickback",    "triceps",          "primary"],
  ["dumbbell-triceps-kickback",    "rear_deltoid",     "stabilizer"],

  ["cable-triceps-kickback",       "triceps",          "primary"],
  ["cable-triceps-kickback",       "rear_deltoid",     "stabilizer"],
  ["cable-triceps-kickback",       "obliques",         "stabilizer"],

  ["cross-body-cable-triceps-extension", "triceps",    "primary"],
  ["cross-body-cable-triceps-extension", "obliques",   "stabilizer"],

  ["machine-triceps-extension",    "triceps",          "primary"],
];

// ─── EQUIPMENT LINKS ─────────────────────────────────────────
// [exercise_slug, equipment_slug, requirement_type]

const EXERCISE_EQUIPMENT: Array<[string, string, EquipmentRequirement]> = [
  ["barbell-curl",                             "barbell",              "required"],
  ["ez-bar-curl",                              "ez-curl-bar",          "required"],
  ["barbell-drag-curl",                        "barbell",              "required"],
  ["reverse-barbell-curl",                     "barbell",              "required"],
  ["barbell-preacher-curl",                    "barbell",              "required"],
  ["barbell-preacher-curl",                    "preacher-curl-bench",  "required"],
  ["ez-bar-spider-curl",                       "ez-curl-bar",          "required"],
  ["ez-bar-spider-curl",                       "preacher-curl-bench",  "required"],
  ["standing-dumbbell-curl",                   "dumbbells",            "required"],
  ["alternating-dumbbell-curl",                "dumbbells",            "required"],
  ["seated-dumbbell-curl",                     "dumbbells",            "required"],
  ["seated-dumbbell-curl",                     "flat-bench",           "required"],
  ["incline-dumbbell-curl",                    "dumbbells",            "required"],
  ["incline-dumbbell-curl",                    "adjustable-bench",     "required"],
  ["dumbbell-preacher-curl",                   "dumbbells",            "required"],
  ["dumbbell-preacher-curl",                   "preacher-curl-bench",  "required"],
  ["concentration-curl",                       "dumbbells",            "required"],
  ["concentration-curl",                       "flat-bench",           "required"],
  ["dumbbell-zottman-curl",                    "dumbbells",            "required"],
  ["hammer-curl",                              "dumbbells",            "required"],
  ["cross-body-hammer-curl",                   "dumbbells",            "required"],
  ["cable-curl-straight-bar",                  "cable-station",        "required"],
  ["cable-rope-hammer-curl",                   "cable-station",        "required"],
  ["single-arm-cable-curl",                    "cable-station",        "required"],
  ["machine-bicep-curl",                       "machine-curl",         "required"],
  ["band-bicep-curl",                          "resistance-band",      "required"],
  ["cable-triceps-pushdown-straight-bar",      "cable-station",        "required"],
  ["cable-rope-triceps-pushdown",              "cable-station",        "required"],
  ["reverse-grip-cable-pushdown",              "cable-station",        "required"],
  ["single-arm-cable-pushdown",                "cable-station",        "required"],
  ["band-triceps-pushdown",                    "resistance-band",      "required"],
  ["overhead-cable-triceps-extension",         "cable-station",        "required"],
  ["seated-overhead-dumbbell-triceps-extension-two-hand", "dumbbells",  "required"],
  ["seated-overhead-dumbbell-triceps-extension-two-hand", "flat-bench", "required"],
  ["single-arm-overhead-dumbbell-triceps-extension", "dumbbells",      "required"],
  ["standing-overhead-dumbbell-triceps-extension", "dumbbells",        "required"],
  ["single-arm-overhead-cable-triceps-extension", "cable-station",     "required"],
  ["barbell-skull-crusher",                    "barbell",              "required"],
  ["barbell-skull-crusher",                    "flat-bench",           "required"],
  ["ez-bar-skull-crusher",                     "ez-curl-bar",          "required"],
  ["ez-bar-skull-crusher",                     "flat-bench",           "required"],
  ["dumbbell-skull-crusher",                   "dumbbells",            "required"],
  ["dumbbell-skull-crusher",                   "flat-bench",           "required"],
  ["jm-press",                                 "barbell",              "required"],
  ["jm-press",                                 "flat-bench",           "required"],
  ["cable-lying-triceps-extension",            "cable-station",        "required"],
  ["cable-lying-triceps-extension",            "flat-bench",           "required"],
  ["tate-press",                               "dumbbells",            "required"],
  ["tate-press",                               "flat-bench",           "required"],
  ["dumbbell-triceps-kickback",                "dumbbells",            "required"],
  ["dumbbell-triceps-kickback",                "flat-bench",           "optional"],
  ["cable-triceps-kickback",                   "cable-station",        "required"],
  ["cross-body-cable-triceps-extension",       "cable-station",        "required"],
  ["machine-triceps-extension",                "machine-triceps-ext",  "required"],
];

// ─── COACHING CUES ───────────────────────────────────────────
// [slug, cue_type, content, order_index]

const CUES: Array<[string, ExerciseCueType, string, number]> = [

  ["barbell-curl", "setup",
    "Stand with feet hip-width, grip just outside the hips, elbows pinned lightly to the sides. Shoulders back, ribs stacked over the pelvis.",
    1],
  ["barbell-curl", "execution",
    "Curl the bar up by bending only at the elbow, keeping the upper arm still against the torso. Squeeze at the top before lowering under control through the full range.",
    2],
  ["barbell-curl", "mental_cue",
    "Elbows pinned, curl only.",
    3],
  ["barbell-curl", "common_error",
    "Swinging the torso to sling the bar upward: shifts load off the biceps onto the lower back and turns the set into momentum reps rather than controlled elbow flexion. Reduce the load until the elbows can stay fixed.",
    4],

  ["ez-bar-curl", "setup",
    "Grip the angled bends of the EZ-bar with palms rotated slightly inward from a full supinated barbell grip. Elbows tucked at the sides.",
    1],
  ["ez-bar-curl", "execution",
    "Curl through the same path as a barbell curl — the angled grip reduces wrist strain while keeping the same elbow-flexion demand on the biceps.",
    2],

  ["barbell-drag-curl", "setup",
    "Grip the bar as in a standard barbell curl, but plan to keep it in contact with the body throughout the lift.",
    1],
  ["barbell-drag-curl", "execution",
    "Drag the bar straight up the torso by driving the elbows back rather than forward, keeping the bar brushing against the body the entire rep. This shifts the shoulder behind the torso and increases peak biceps tension near lockout.",
    2],
  ["barbell-drag-curl", "common_error",
    "Letting the bar drift forward away from the body: turns the drag curl into a standard curl and removes the elbows-back positioning that defines the variation's peak-contraction emphasis.",
    3],

  ["reverse-barbell-curl", "setup",
    "Grip the bar with palms facing down (pronated), hands just outside the hips, elbows tucked at the sides.",
    1],
  ["reverse-barbell-curl", "execution",
    "Curl the bar up while keeping the wrists locked in a fixed neutral-to-flat position — the pronated grip shifts emphasis to the brachioradialis and wrist extensors rather than the biceps.",
    2],
  ["reverse-barbell-curl", "safety",
    "Use a lighter load than a standard curl. The pronated grip is inherently weaker and puts more direct stress on the wrist extensors and elbow — this is not a max-load exercise.",
    3],

  ["barbell-preacher-curl", "setup",
    "Chest and upper arms braced flat against the preacher pad, grip just outside shoulder width. Start with the arms almost fully extended but not locked out.",
    1],
  ["barbell-preacher-curl", "execution",
    "Curl the bar up while keeping the upper arms pressed into the pad throughout, controlling the descent all the way back to the stretched starting position without letting the bar drop.",
    2],
  ["barbell-preacher-curl", "common_error",
    "Bouncing out of the bottom stretched position: creates a sharp, uncontrolled load spike on the distal biceps tendon and elbow at the most vulnerable point in the range. Reverse direction under control, not with a bounce.",
    3],

  ["ez-bar-spider-curl", "setup",
    "Chest pressed against a steep incline or preacher pad, arms hanging straight down in front, palms forward.",
    1],
  ["ez-bar-spider-curl", "execution",
    "Curl with the upper arms fixed vertically and out in front of the torso — this angle removes the ability to use shoulder movement to assist and maximizes tension at both the stretched and contracted positions.",
    2],

  ["standing-dumbbell-curl", "setup",
    "Stand with a dumbbell in each hand, arms fully extended at the sides, palms facing forward, elbows close to the torso.",
    1],
  ["standing-dumbbell-curl", "execution",
    "Curl both dumbbells simultaneously, keeping the upper arms still and squeezing at the top before lowering under control.",
    2],

  ["alternating-dumbbell-curl", "setup",
    "Stand with a dumbbell in each hand at the sides, palms facing the body.",
    1],
  ["alternating-dumbbell-curl", "execution",
    "Curl one arm at a time, rotating the palm to face up (supinating) as the dumbbell rises. Lower fully before starting the next rep on the opposite side.",
    2],

  ["seated-dumbbell-curl", "setup",
    "Sit on a bench with back support, dumbbells at the sides, feet flat on the floor.",
    1],
  ["seated-dumbbell-curl", "execution",
    "Curl with the upper arms fixed at the sides, removing the ability to lean back for momentum that a standing position allows.",
    2],

  ["incline-dumbbell-curl", "setup",
    "Lie back on a bench set to a 45–60° incline, arms hanging straight down from the shoulders, palms facing forward.",
    1],
  ["incline-dumbbell-curl", "execution",
    "Curl the dumbbells up while keeping the upper arms pinned behind the torso line throughout — the shoulder-extended starting position places the biceps under load at their most stretched length.",
    2],
  ["incline-dumbbell-curl", "common_error",
    "Letting the elbows drift forward in front of the torso: removes the shoulder-extension stretch that is the entire purpose of the incline angle and turns the set into a standard dumbbell curl.",
    3],

  ["dumbbell-preacher-curl", "setup",
    "Chest and upper arms braced against the preacher pad, one dumbbell in each hand or one arm at a time.",
    1],
  ["dumbbell-preacher-curl", "execution",
    "Curl through the full range with the upper arms fixed on the pad, allowing each arm's natural wrist rotation as the dumbbell rises.",
    2],

  ["concentration-curl", "setup",
    "Sit on a bench, lean forward, and brace the back of the working upper arm against the inside of the same-side thigh.",
    1],
  ["concentration-curl", "execution",
    "Curl the dumbbell up in a strict arc without letting the elbow shift off the thigh, squeezing hard at the top of the range.",
    2],
  ["concentration-curl", "mental_cue",
    "Elbow locked on the thigh.",
    3],

  ["dumbbell-zottman-curl", "setup",
    "Stand holding dumbbells at the sides with a standard supinated curl grip.",
    1],
  ["dumbbell-zottman-curl", "execution",
    "Curl up as in a standard dumbbell curl, then rotate the wrists to a pronated (palms-down) grip at the top before lowering slowly in that pronated position. Rotate back to supinated only once the dumbbells reach the bottom.",
    2],
  ["dumbbell-zottman-curl", "common_error",
    "Rotating the wrists too early on the descent: shortens the pronated-grip eccentric phase that is the exercise's main purpose of loading the wrist extensors and brachioradialis.",
    3],

  ["hammer-curl", "setup",
    "Stand with dumbbells at the sides, palms facing the torso in a neutral grip throughout.",
    1],
  ["hammer-curl", "execution",
    "Curl with the wrists locked in the neutral position the entire rep — do not rotate toward a supinated grip, which would turn the movement into a standard curl.",
    2],

  ["cross-body-hammer-curl", "setup",
    "Stand with dumbbells at the sides in a neutral grip.",
    1],
  ["cross-body-hammer-curl", "execution",
    "Curl one dumbbell diagonally up toward the opposite shoulder, keeping the wrist neutral throughout, then lower and repeat on the other side.",
    2],

  ["cable-curl-straight-bar", "setup",
    "Stand facing a low cable pulley with a straight bar attachment, grip just outside shoulder width, elbows at the sides.",
    1],
  ["cable-curl-straight-bar", "execution",
    "Curl the bar up while keeping the elbows fixed, taking advantage of the cable's constant tension through the entire range including the stretched bottom position.",
    2],

  ["cable-rope-hammer-curl", "setup",
    "Stand facing a low cable pulley with a rope attachment, palms facing each other in a neutral grip.",
    1],
  ["cable-rope-hammer-curl", "execution",
    "Curl the rope up while keeping the wrists neutral and pulling the ends slightly apart at the top for a peak brachialis contraction.",
    2],

  ["single-arm-cable-curl", "setup",
    "Stand side-on to a low cable pulley with a single handle, working elbow at the side, opposite hand free.",
    1],
  ["single-arm-cable-curl", "execution",
    "Curl through the full range without letting the torso rotate toward the working arm — brace the core to keep the hips and shoulders square.",
    2],

  ["machine-bicep-curl", "setup",
    "Sit with the upper arms resting on the pad as positioned by the machine, grip the handles with a supinated grip.",
    1],
  ["machine-bicep-curl", "execution",
    "Curl through the guided arc, focusing on a full stretch at the bottom and a hard squeeze at the top since the machine removes any need for balance.",
    2],

  ["band-bicep-curl", "setup",
    "Stand on the middle of a resistance band with feet shoulder-width, gripping a handle in each hand at the sides.",
    1],
  ["band-bicep-curl", "execution",
    "Curl up against the band's resistance, which is lightest at the bottom stretch and increases through the range — expect the hardest part of the rep to be near the top.",
    2],

  ["cable-triceps-pushdown-straight-bar", "setup",
    "Stand facing a high cable pulley with a straight bar attachment, elbows pinned to the sides, forearms roughly parallel to the floor.",
    1],
  ["cable-triceps-pushdown-straight-bar", "execution",
    "Extend the elbows to press the bar down without letting the elbows drift forward or the torso lean over the bar to assist.",
    2],
  ["cable-triceps-pushdown-straight-bar", "common_error",
    "Leaning the torso forward and using body weight to press the bar down: shifts load off the triceps onto the shoulders and chest, reducing the isolation the exercise is meant to provide.",
    3],

  ["cable-rope-triceps-pushdown", "setup",
    "Stand facing a high cable pulley with a rope attachment, elbows pinned to the sides.",
    1],
  ["cable-rope-triceps-pushdown", "execution",
    "Press down and spread the rope ends apart at the bottom for an added peak contraction, keeping the elbows fixed throughout.",
    2],

  ["reverse-grip-cable-pushdown", "setup",
    "Stand facing a high cable pulley with a straight bar, grip supinated (palms up), elbows pinned to the sides.",
    1],
  ["reverse-grip-cable-pushdown", "execution",
    "Press down through the same elbow-extension path as a standard pushdown — the supinated grip shifts the wrist loading and slightly increases medial head emphasis.",
    2],

  ["single-arm-cable-pushdown", "setup",
    "Stand side-on to a high cable pulley with a single handle, elbow pinned to the side.",
    1],
  ["single-arm-cable-pushdown", "execution",
    "Press the handle down without rotating the torso, then control the return until the elbow reaches a full stretch.",
    2],

  ["band-triceps-pushdown", "setup",
    "Anchor a resistance band overhead or on a high fixed point, elbows pinned to the sides.",
    1],
  ["band-triceps-pushdown", "execution",
    "Press down through the elbow-extension path, controlling the return through the lightly-loaded stretched position.",
    2],

  ["overhead-cable-triceps-extension", "setup",
    "Face away from a low cable pulley with a rope attachment, arms overhead, elbows pointing forward and close to the head.",
    1],
  ["overhead-cable-triceps-extension", "execution",
    "Extend the elbows to press the rope forward and up without letting the elbows flare outward, feeling a strong stretch on the triceps long head at the bottom of each rep.",
    2],
  ["overhead-cable-triceps-extension", "safety",
    "Keep the elbows fixed in place throughout — letting them travel forward and back turns tension on and off the triceps and increases shoulder strain.",
    3],

  ["seated-overhead-dumbbell-triceps-extension-two-hand", "setup",
    "Sit upright holding one dumbbell with both hands overhead, elbows pointing forward and close to the head.",
    1],
  ["seated-overhead-dumbbell-triceps-extension-two-hand", "execution",
    "Lower the dumbbell behind the head by bending only at the elbows, then extend back to the overhead lockout without flaring the elbows out to the sides.",
    2],

  ["single-arm-overhead-dumbbell-triceps-extension", "setup",
    "Stand or sit holding a dumbbell overhead in one hand, elbow pointing forward and close to the head, opposite hand supporting the elbow if needed.",
    1],
  ["single-arm-overhead-dumbbell-triceps-extension", "execution",
    "Lower the dumbbell behind the head under control, keeping the upper arm vertical, then press back to full elbow extension.",
    2],
  ["single-arm-overhead-dumbbell-triceps-extension", "common_error",
    "Letting the elbow drift outward away from the head during the descent: shifts stress onto the shoulder joint and reduces the direct stretch loading on the triceps long head.",
    3],

  ["standing-overhead-dumbbell-triceps-extension", "setup",
    "Stand holding one dumbbell with both hands overhead, elbows pointing forward and close to the head, core braced.",
    1],
  ["standing-overhead-dumbbell-triceps-extension", "execution",
    "Lower the dumbbell behind the head under control and extend back to lockout, avoiding any lean of the torso to assist the lift.",
    2],

  ["single-arm-overhead-cable-triceps-extension", "setup",
    "Stand facing away from a low cable pulley with a single handle overhead, elbow pointing forward and close to the head.",
    1],
  ["single-arm-overhead-cable-triceps-extension", "execution",
    "Extend the elbow to press the handle up and slightly forward, keeping the torso square and resisting rotation toward the working arm.",
    2],

  ["barbell-skull-crusher", "setup",
    "Lie flat on a bench, bar held above the chest with a shoulder-width grip, upper arms vertical and fixed.",
    1],
  ["barbell-skull-crusher", "execution",
    "Lower the bar by bending only at the elbows until it reaches just above or behind the forehead, then extend back to the starting position without letting the upper arms travel backward.",
    2],
  ["barbell-skull-crusher", "safety",
    "Keep control of the bar path at all times — a missed rep in the lowered position travels directly toward the face. Use a spotter or reduce load when approaching failure.",
    3],
  ["barbell-skull-crusher", "common_error",
    "Letting the upper arms drift backward past vertical during the lowering phase: converts the movement into a partial pullover and removes tension from the intended elbow-extension pattern.",
    4],

  ["ez-bar-skull-crusher", "setup",
    "Lie flat on a bench holding an EZ-bar above the chest, upper arms vertical and fixed.",
    1],
  ["ez-bar-skull-crusher", "execution",
    "Lower the bar toward the forehead with the angled grip reducing wrist strain, then extend back to the start without letting the elbows flare.",
    2],

  ["dumbbell-skull-crusher", "setup",
    "Lie flat on a bench holding a dumbbell in each hand above the chest, upper arms vertical.",
    1],
  ["dumbbell-skull-crusher", "execution",
    "Lower the dumbbells toward the sides of the head by bending at the elbows, then extend back to the start, letting the natural wrist rotation reduce strain at the bottom.",
    2],

  ["jm-press", "setup",
    "Lie on a bench with a barbell at close-grip width above the chest, upper arms angled slightly toward the head.",
    1],
  ["jm-press", "execution",
    "Lower the bar toward the upper chest/chin in a hybrid path between a skull crusher and a close-grip press, then drive back to lockout using both elbow extension and a small pressing motion.",
    2],
  ["jm-press", "safety",
    "This is a high-injury-risk exercise for the elbow at meaningful loads. Do not attempt without prior competency in both close-grip bench press and skull crushers, and always train with a spotter.",
    3],

  ["cable-lying-triceps-extension", "setup",
    "Lie on a bench positioned so a low cable pulley with a rope attachment can be pulled from behind the head, arms starting bent overhead.",
    1],
  ["cable-lying-triceps-extension", "execution",
    "Extend the elbows to press the rope up and forward, keeping the upper arms fixed and feeling constant tension throughout — unlike a dumbbell version, the cable does not go slack at the top.",
    2],

  ["dumbbell-triceps-kickback", "setup",
    "Hinge forward at the hips with a flat back, upper arms held parallel to the torso and pinned at the sides, elbows bent to 90°.",
    1],
  ["dumbbell-triceps-kickback", "execution",
    "Extend the elbows to press the dumbbells straight back until the arms are fully straight, keeping the upper arms fixed against the torso throughout — only the forearm should move.",
    2],
  ["dumbbell-triceps-kickback", "common_error",
    "Swinging the upper arm forward and back to sling the dumbbell into extension: removes tension from the triceps at the hardest, most contracted position and turns the set into momentum reps.",
    3],

  ["cable-triceps-kickback", "setup",
    "Hinge forward with a flat back, working elbow pinned at the side and bent to roughly 90°, cable set to a low pulley behind the body.",
    1],
  ["cable-triceps-kickback", "execution",
    "Extend the elbow to press the handle back to full lockout, holding briefly at full contraction before returning under control.",
    2],

  ["cross-body-cable-triceps-extension", "setup",
    "Stand side-on to a high cable pulley with a single handle, working arm crossing in front of the body.",
    1],
  ["cross-body-cable-triceps-extension", "execution",
    "Extend the elbow to pull the handle down and across the body, keeping the upper arm relatively fixed and resisting torso rotation.",
    2],

  ["machine-triceps-extension", "setup",
    "Sit with the upper arms resting on the pad as positioned by the machine, grip the handles or pads as designed.",
    1],
  ["machine-triceps-extension", "execution",
    "Extend the elbows through the guided arc, pausing briefly at full extension before returning to a full stretch.",
    2],

  ["tate-press", "setup",
    "Lie flat on a bench holding a dumbbell in each hand above the chest, elbows flared out to the sides and palms facing the feet.",
    1],
  ["tate-press", "execution",
    "Lower the dumbbells by bending the elbows outward until they nearly touch the chest, then press back to lockout — the flared elbow position emphasizes the lateral head at a hard peak contraction.",
    2],
  ["tate-press", "common_error",
    "Letting the elbows drift inward toward a standard skull-crusher position: removes the lateral-head emphasis that distinguishes the Tate press and increases medial elbow strain from the twisted bar path.",
    3],

];

// ─── EXERCISE RELATIONS ────────────────────────────────────────
// [source_slug, target_slug, relation_type, notes]

const RELATIONS: Array<[string, string, ExerciseRelationType, string]> = [

  // Biceps family
  ["barbell-curl", "ez-bar-curl", "lower_joint_stress",
    "The EZ-bar's angled grip reduces the wrist supination/pronation torque of a straight barbell, lowering wrist joint stress while preserving the same elbow-flexion stimulus."],
  ["barbell-curl", "standing-dumbbell-curl", "regression",
    "Dumbbells allow a natural forearm rotation path and independent per-arm loading, a more forgiving entry point than the fixed straight-bar path."],
  ["standing-dumbbell-curl", "barbell-curl", "progression",
    "The barbell allows heavier total loading in fixed increments once dumbbell curl strength and wrist tolerance are established."],
  ["standing-dumbbell-curl", "hammer-curl", "same_pattern",
    "The neutral grip shifts emphasis from the biceps toward the brachialis and brachioradialis while preserving the same elbow-flexion pattern."],
  ["hammer-curl", "cross-body-hammer-curl", "same_pattern",
    "Crossing the dumbbell toward the opposite shoulder increases the range of motion at the shoulder without changing the primary elbow-flexion target."],
  ["barbell-curl", "barbell-preacher-curl", "same_pattern",
    "The preacher bench removes shoulder swing and momentum, isolating the elbow-flexion range more strictly than a standing curl."],
  ["barbell-preacher-curl", "dumbbell-preacher-curl", "regression",
    "Independent dumbbells reduce total load and let the weaker arm set the pace, useful when the barbell version overloads the shorter arm at end range."],
  ["dumbbell-preacher-curl", "barbell-preacher-curl", "progression",
    "The barbell allows greater total load once single-arm control on the preacher bench is established."],
  ["barbell-preacher-curl", "concentration-curl", "regression",
    "Concentration curl uses a lighter unilateral load with the elbow braced against the thigh for maximum stability, an easier entry point than the preacher bench's fixed arm angle."],
  ["concentration-curl", "barbell-preacher-curl", "progression",
    "The preacher bench allows bilateral loading and heavier total weight once strict unilateral control from the concentration curl is established."],
  ["concentration-curl", "single-arm-cable-curl", "same_pattern",
    "Cable resistance maintains constant tension through the full range rather than the free-weight strength curve of a dumbbell, while preserving the strict unilateral isolation."],
  ["barbell-curl", "reverse-barbell-curl", "substitute",
    "Reverse curl shifts primary emphasis to the brachioradialis and wrist extensors — a useful substitute for varying forearm stimulus or working around biceps tendon irritation."],
  ["cable-curl-straight-bar", "cable-rope-hammer-curl", "same_pattern",
    "The rope attachment allows a neutral grip through the full range, shifting emphasis toward the brachialis while preserving the cable's constant-tension profile."],
  ["barbell-curl", "machine-bicep-curl", "lower_joint_stress",
    "The guided machine arc removes the wrist and grip stabilization demand of a free barbell, appropriate for athletes managing wrist or elbow sensitivity."],
  ["standing-dumbbell-curl", "band-bicep-curl", "lower_joint_stress",
    "Band resistance is lightest at the stretched bottom position, reducing elbow and wrist joint stress at end range compared to a free weight that loads evenly through the range."],

  // Triceps family
  ["cable-triceps-pushdown-straight-bar", "cable-rope-triceps-pushdown", "same_pattern",
    "The rope attachment allows the hands to separate and rotate at lockout, increasing peak contraction at the shortened position."],
  ["cable-triceps-pushdown-straight-bar", "single-arm-cable-pushdown", "contralateral",
    "The single-arm version trains each side independently and adds a moderate anti-rotation core demand absent from the bilateral pushdown."],
  ["cable-triceps-pushdown-straight-bar", "band-triceps-pushdown", "lower_joint_stress",
    "Band resistance is lightest at the stretched position, reducing elbow joint stress at end range compared to a cable stack that loads evenly through the range."],
  ["barbell-skull-crusher", "ez-bar-skull-crusher", "lower_joint_stress",
    "The EZ-bar's angled grip reduces wrist and forearm strain at the vulnerable lengthened position near the forehead compared to a straight barbell."],
  ["ez-bar-skull-crusher", "dumbbell-skull-crusher", "regression",
    "Independent dumbbells allow a natural rotation path and reduced total load, a more forgiving entry point than a fixed EZ-bar path near the face."],
  ["dumbbell-skull-crusher", "ez-bar-skull-crusher", "progression",
    "The fixed EZ-bar path allows greater total load once dumbbell control through the lengthened position near the face is established."],
  ["barbell-skull-crusher", "jm-press", "progression",
    "The JM press adds a pressing component to the skull-crusher pattern, increasing both loading capacity and technical demand."],
  ["jm-press", "barbell-skull-crusher", "regression",
    "Removing the pressing component isolates the elbow-extension pattern, appropriate when JM press technique or elbow tolerance is still being established."],
  ["barbell-skull-crusher", "overhead-cable-triceps-extension", "lower_joint_stress",
    "The cable's constant, adjustable tension removes the free weight's peak loading at the most vulnerable lengthened elbow position near the forehead."],
  ["seated-overhead-dumbbell-triceps-extension-two-hand", "single-arm-overhead-dumbbell-triceps-extension", "contralateral",
    "The single-arm version trains each side independently and surfaces left-right strength or mobility asymmetries not visible in the two-hand version."],
  ["dumbbell-triceps-kickback", "cable-triceps-kickback", "same_pattern",
    "Cable resistance maintains tension through lockout, where a dumbbell kickback loses tension as the arm reaches vertical."],
  ["machine-triceps-extension", "cable-triceps-pushdown-straight-bar", "substitute",
    "The free cable path requires more stabilization than the guided machine arm but delivers a comparable elbow-extension training effect."],
  ["cable-triceps-pushdown-straight-bar", "overhead-cable-triceps-extension", "substitute",
    "Overhead extension emphasizes the long head at a lengthened shoulder position, complementing the shortened-position emphasis of a standard pushdown — useful for rotating stimulus across a triceps-focused block."],

];

// ─── MAIN ─────────────────────────────────────────────────────

async function main() {
  console.log("\nCatalyst OS — Exercise Library Seed 006: Arms");
  console.log("─────────────────────────────────────────────────────────\n");

  console.log(`Seeding equipment catalog…`);
  const equipmentMap = await seedEquipment(SHARED_EQUIPMENT);
  console.log(`  ✓ Equipment: ${equipmentMap.size} total items`);

  await seedExercises(
    EXERCISES,
    equipmentMap,
    MUSCLES,
    EXERCISE_EQUIPMENT,
    CUES,
    RELATIONS,
    "006 — Arms (40 exercises)",
  );

  console.log("─────────────────────────────────────────────────────────");
  console.log("Seed 006 complete.\n");
  await sql.end();
}

main().catch(async (err) => {
  console.error("\nSeed failed:", err instanceof Error ? err.message : err);
  await sql.end();
  process.exit(1);
});
