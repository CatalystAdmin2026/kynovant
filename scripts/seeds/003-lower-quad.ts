#!/usr/bin/env npx tsx
// ─────────────────────────────────────────────────────────────
// Catalyst OS — Exercise Library Seed 003: Lower Body Quad-Dominant
//
// Usage:
//   set -a && source .env.local && set +a && npx tsx scripts/seeds/003-lower-quad.ts
//
// Covers:
//   Bilateral squat — barbell, smith/machine, dumbbell/kettlebell, bodyweight
//   Unilateral squat & lunge — split squat, lunge variations, step-up, pistol
//   Knee extension isolation — leg extension, sissy squat
//   Locomotion — sled push
//
// Count: 40 exercises
// Spec: docs/exercise-intelligence-spec.md
// ─────────────────────────────────────────────────────────────

import { SHARED_EQUIPMENT, sql, seedEquipment, seedExercises } from "./_shared";
import type { MuscleGroup, MuscleRole, EquipmentRequirement, ExerciseCueType, ExerciseRelationType } from "./_shared";

// ─── LOCAL EQUIPMENT ─────────────────────────────────────────
// Additions beyond SHARED_EQUIPMENT needed for this file.

const EQUIPMENT = [
  { slug: "squat-box",  name: "Squat Box",        category: "accessories" },
  { slug: "plyo-box",   name: "Plyo Box / Step Platform", category: "accessories" },
] as const;

// ─── EXERCISES ───────────────────────────────────────────────

const EXERCISES = [

  // ── Bilateral Squat: Barbell ──────────────────────────────

  { slug: "back-squat", name: "Back Squat",
    movementPattern: "squat_bilateral" as const, classification: "compound" as const,
    resistanceType: "barbell" as const, difficulty: "intermediate" as const,
    defaultBodyPosition: "standing" as const,
    fatigueCost: 7, technicalComplexity: 5, stabilityDemand: 5,
    jointStressSpine: 7, jointStressHip: 7, jointStressKnee: 6, jointStressAnkle: 3,
    lengthenedBias: 5, shortenedBias: 3, stretchMediatedPotential: 5 },

  { slug: "low-bar-back-squat", name: "Low-Bar Back Squat",
    movementPattern: "squat_bilateral" as const, classification: "compound" as const,
    resistanceType: "barbell" as const, difficulty: "intermediate" as const,
    defaultBodyPosition: "standing" as const,
    fatigueCost: 7, technicalComplexity: 6, stabilityDemand: 5,
    jointStressSpine: 7, jointStressHip: 8, jointStressKnee: 5, jointStressAnkle: 2,
    lengthenedBias: 5, shortenedBias: 3, stretchMediatedPotential: 5 },

  { slug: "front-squat", name: "Front Squat",
    movementPattern: "squat_bilateral" as const, classification: "compound" as const,
    resistanceType: "barbell" as const, difficulty: "advanced" as const,
    defaultBodyPosition: "standing" as const,
    fatigueCost: 8, technicalComplexity: 6, stabilityDemand: 6,
    jointStressShoulder: 2, jointStressWrist: 4, jointStressSpine: 6, jointStressHip: 8, jointStressKnee: 7, jointStressAnkle: 4,
    lengthenedBias: 5, shortenedBias: 3, stretchMediatedPotential: 5 },

  { slug: "box-squat", name: "Box Squat",
    movementPattern: "squat_bilateral" as const, classification: "compound" as const,
    resistanceType: "barbell" as const, difficulty: "intermediate" as const,
    defaultBodyPosition: "standing" as const,
    fatigueCost: 7, technicalComplexity: 6, stabilityDemand: 5,
    jointStressSpine: 7, jointStressHip: 7, jointStressKnee: 5, jointStressAnkle: 3,
    lengthenedBias: 5, shortenedBias: 3, stretchMediatedPotential: 5 },

  { slug: "pause-squat", name: "Pause Squat",
    movementPattern: "squat_bilateral" as const, classification: "compound" as const,
    resistanceType: "barbell" as const, difficulty: "intermediate" as const,
    defaultBodyPosition: "standing" as const,
    fatigueCost: 7, technicalComplexity: 6, stabilityDemand: 5,
    jointStressSpine: 7, jointStressHip: 7, jointStressKnee: 6, jointStressAnkle: 3,
    lengthenedBias: 6, shortenedBias: 3, stretchMediatedPotential: 6 },

  { slug: "safety-bar-squat", name: "Safety Bar Squat",
    movementPattern: "squat_bilateral" as const, classification: "compound" as const,
    resistanceType: "barbell" as const, difficulty: "intermediate" as const,
    defaultBodyPosition: "standing" as const,
    fatigueCost: 7, technicalComplexity: 5, stabilityDemand: 5,
    jointStressShoulder: 3, jointStressWrist: 2, jointStressSpine: 6, jointStressHip: 7, jointStressKnee: 6, jointStressAnkle: 3,
    lengthenedBias: 5, shortenedBias: 3, stretchMediatedPotential: 5 },

  { slug: "zercher-squat", name: "Zercher Squat",
    movementPattern: "squat_bilateral" as const, classification: "compound" as const,
    resistanceType: "barbell" as const, difficulty: "advanced" as const,
    defaultBodyPosition: "standing" as const,
    fatigueCost: 7, technicalComplexity: 7, stabilityDemand: 6,
    jointStressElbow: 4, jointStressSpine: 7, jointStressHip: 7, jointStressKnee: 6, jointStressAnkle: 3,
    lengthenedBias: 5, shortenedBias: 3, stretchMediatedPotential: 5 },

  // ── Bilateral Squat: Smith Machine & Machine ─────────────

  { slug: "smith-machine-squat", name: "Smith Machine Squat",
    movementPattern: "squat_bilateral" as const, classification: "compound" as const,
    resistanceType: "smith_machine" as const, difficulty: "beginner" as const,
    defaultBodyPosition: "standing" as const,
    fatigueCost: 6, technicalComplexity: 3, stabilityDemand: 3,
    jointStressSpine: 5, jointStressHip: 6, jointStressKnee: 6, jointStressAnkle: 3,
    lengthenedBias: 5, shortenedBias: 3, stretchMediatedPotential: 5 },

  { slug: "hack-squat", name: "Hack Squat (Machine)",
    movementPattern: "squat_bilateral" as const, classification: "compound" as const,
    resistanceType: "machine" as const, difficulty: "beginner" as const,
    defaultBodyPosition: "standing" as const,
    fatigueCost: 5, technicalComplexity: 2, stabilityDemand: 1,
    jointStressSpine: 1, jointStressHip: 5, jointStressKnee: 7, jointStressAnkle: 2,
    lengthenedBias: 5, shortenedBias: 4, stretchMediatedPotential: 5 },

  { slug: "barbell-hack-squat", name: "Barbell Hack Squat",
    movementPattern: "squat_bilateral" as const, classification: "compound" as const,
    resistanceType: "barbell" as const, difficulty: "advanced" as const,
    defaultBodyPosition: "standing" as const,
    fatigueCost: 6, technicalComplexity: 7, stabilityDemand: 5,
    jointStressWrist: 3, jointStressSpine: 4, jointStressHip: 5, jointStressKnee: 7, jointStressAnkle: 3,
    lengthenedBias: 5, shortenedBias: 4, stretchMediatedPotential: 5 },

  { slug: "leg-press", name: "Leg Press",
    movementPattern: "squat_bilateral" as const, classification: "compound" as const,
    resistanceType: "machine" as const, difficulty: "beginner" as const,
    defaultBodyPosition: "seated" as const,
    fatigueCost: 5, technicalComplexity: 2, stabilityDemand: 1,
    jointStressSpine: 2, jointStressHip: 6, jointStressKnee: 7,
    lengthenedBias: 5, shortenedBias: 4, stretchMediatedPotential: 5 },

  { slug: "vertical-leg-press", name: "Vertical Leg Press",
    movementPattern: "squat_bilateral" as const, classification: "compound" as const,
    resistanceType: "machine" as const, difficulty: "beginner" as const,
    defaultBodyPosition: "seated" as const,
    fatigueCost: 5, technicalComplexity: 3, stabilityDemand: 2,
    jointStressSpine: 2, jointStressHip: 6, jointStressKnee: 7,
    lengthenedBias: 5, shortenedBias: 4, stretchMediatedPotential: 5 },

  { slug: "belt-squat", name: "Belt Squat",
    movementPattern: "squat_bilateral" as const, classification: "compound" as const,
    resistanceType: "machine" as const, difficulty: "intermediate" as const,
    defaultBodyPosition: "standing" as const,
    fatigueCost: 6, technicalComplexity: 4, stabilityDemand: 4,
    jointStressHip: 6, jointStressKnee: 6, jointStressAnkle: 3,
    lengthenedBias: 5, shortenedBias: 3, stretchMediatedPotential: 5 },

  // ── Bilateral Squat: Dumbbell & Kettlebell ───────────────

  { slug: "goblet-squat", name: "Goblet Squat",
    movementPattern: "squat_bilateral" as const, classification: "compound" as const,
    resistanceType: "dumbbell" as const, difficulty: "beginner" as const,
    defaultBodyPosition: "standing" as const,
    fatigueCost: 4, technicalComplexity: 3, stabilityDemand: 4,
    jointStressSpine: 1, jointStressHip: 6, jointStressKnee: 5, jointStressAnkle: 2,
    lengthenedBias: 6, shortenedBias: 4, stretchMediatedPotential: 6 },

  { slug: "dumbbell-squat", name: "Dumbbell Squat",
    movementPattern: "squat_bilateral" as const, classification: "compound" as const,
    resistanceType: "dumbbell" as const, difficulty: "beginner" as const,
    defaultBodyPosition: "standing" as const,
    fatigueCost: 4, technicalComplexity: 3, stabilityDemand: 4,
    jointStressSpine: 1, jointStressHip: 5, jointStressKnee: 5, jointStressAnkle: 2,
    lengthenedBias: 5, shortenedBias: 3, stretchMediatedPotential: 5 },

  { slug: "kettlebell-front-squat", name: "Kettlebell Front Squat",
    movementPattern: "squat_bilateral" as const, classification: "compound" as const,
    resistanceType: "kettlebell" as const, difficulty: "intermediate" as const,
    defaultBodyPosition: "standing" as const,
    fatigueCost: 5, technicalComplexity: 4, stabilityDemand: 5,
    jointStressWrist: 2, jointStressSpine: 2, jointStressHip: 6, jointStressKnee: 6, jointStressAnkle: 3,
    lengthenedBias: 5, shortenedBias: 3, stretchMediatedPotential: 5 },

  // ── Bilateral Squat: Bodyweight & Isometric ──────────────

  { slug: "bodyweight-squat", name: "Bodyweight Squat",
    movementPattern: "squat_bilateral" as const, classification: "compound" as const,
    resistanceType: "bodyweight" as const, difficulty: "beginner" as const,
    defaultBodyPosition: "standing" as const,
    fatigueCost: 3, technicalComplexity: 2, stabilityDemand: 3,
    jointStressSpine: 1, jointStressHip: 4, jointStressKnee: 4, jointStressAnkle: 2,
    lengthenedBias: 4, shortenedBias: 3, stretchMediatedPotential: 3 },

  { slug: "jump-squat", name: "Jump Squat",
    movementPattern: "squat_bilateral" as const, classification: "power" as const,
    resistanceType: "bodyweight" as const, difficulty: "intermediate" as const,
    defaultBodyPosition: "standing" as const,
    fatigueCost: 6, technicalComplexity: 4, stabilityDemand: 5,
    jointStressSpine: 2, jointStressHip: 5, jointStressKnee: 6, jointStressAnkle: 4,
    lengthenedBias: 3, shortenedBias: 5, stretchMediatedPotential: 3 },

  { slug: "wall-sit", name: "Wall Sit",
    movementPattern: "iso_hold" as const, classification: "compound" as const,
    resistanceType: "bodyweight" as const, difficulty: "beginner" as const,
    defaultBodyPosition: "standing" as const,
    fatigueCost: 3, technicalComplexity: 1, stabilityDemand: 2,
    jointStressSpine: 1, jointStressHip: 3, jointStressKnee: 5,
    lengthenedBias: 0, shortenedBias: 6, stretchMediatedPotential: 0 },

  { slug: "spanish-squat", name: "Spanish Squat",
    movementPattern: "iso_hold" as const, classification: "compound" as const,
    resistanceType: "band" as const, difficulty: "intermediate" as const,
    defaultBodyPosition: "standing" as const,
    fatigueCost: 4, technicalComplexity: 3, stabilityDemand: 3,
    jointStressHip: 2, jointStressKnee: 5,
    lengthenedBias: 2, shortenedBias: 6, stretchMediatedPotential: 2 },

  // ── Unilateral Squat & Lunge ──────────────────────────────

  { slug: "barbell-bulgarian-split-squat", name: "Barbell Bulgarian Split Squat",
    movementPattern: "squat_unilateral" as const, classification: "compound" as const,
    resistanceType: "barbell" as const, difficulty: "advanced" as const,
    unilateral: true, defaultBodyPosition: "split_stance" as const,
    fatigueCost: 7, technicalComplexity: 7, stabilityDemand: 8,
    jointStressSpine: 4, jointStressHip: 8, jointStressKnee: 8, jointStressAnkle: 3,
    lengthenedBias: 9, shortenedBias: 5, stretchMediatedPotential: 9 },

  { slug: "dumbbell-bulgarian-split-squat", name: "Dumbbell Bulgarian Split Squat",
    movementPattern: "squat_unilateral" as const, classification: "compound" as const,
    resistanceType: "dumbbell" as const, difficulty: "intermediate" as const,
    unilateral: true, defaultBodyPosition: "split_stance" as const,
    fatigueCost: 6, technicalComplexity: 7, stabilityDemand: 7,
    jointStressSpine: 2, jointStressHip: 8, jointStressKnee: 8, jointStressAnkle: 3,
    lengthenedBias: 9, shortenedBias: 5, stretchMediatedPotential: 9 },

  { slug: "atg-split-squat", name: "ATG Split Squat",
    movementPattern: "squat_unilateral" as const, classification: "compound" as const,
    resistanceType: "dumbbell" as const, difficulty: "intermediate" as const,
    unilateral: true, defaultBodyPosition: "split_stance" as const,
    fatigueCost: 6, technicalComplexity: 6, stabilityDemand: 7,
    jointStressSpine: 2, jointStressHip: 6, jointStressKnee: 8, jointStressAnkle: 6,
    lengthenedBias: 8, shortenedBias: 5, stretchMediatedPotential: 8 },

  { slug: "walking-lunge", name: "Walking Lunge",
    movementPattern: "lunge" as const, classification: "compound" as const,
    resistanceType: "dumbbell" as const, difficulty: "intermediate" as const,
    unilateral: true, alternating: true, defaultBodyPosition: "standing" as const,
    fatigueCost: 6, technicalComplexity: 5, stabilityDemand: 7,
    jointStressSpine: 3, jointStressHip: 6, jointStressKnee: 6, jointStressAnkle: 3,
    lengthenedBias: 6, shortenedBias: 4, stretchMediatedPotential: 6 },

  { slug: "barbell-walking-lunge", name: "Barbell Walking Lunge",
    movementPattern: "lunge" as const, classification: "compound" as const,
    resistanceType: "barbell" as const, difficulty: "advanced" as const,
    unilateral: true, alternating: true, defaultBodyPosition: "standing" as const,
    fatigueCost: 7, technicalComplexity: 6, stabilityDemand: 7,
    jointStressSpine: 5, jointStressHip: 7, jointStressKnee: 7, jointStressAnkle: 3,
    lengthenedBias: 6, shortenedBias: 4, stretchMediatedPotential: 6 },

  { slug: "reverse-lunge", name: "Reverse Lunge",
    movementPattern: "lunge" as const, classification: "compound" as const,
    resistanceType: "dumbbell" as const, difficulty: "beginner" as const,
    unilateral: true, defaultBodyPosition: "standing" as const,
    fatigueCost: 5, technicalComplexity: 4, stabilityDemand: 6,
    jointStressSpine: 2, jointStressHip: 6, jointStressKnee: 6, jointStressAnkle: 3,
    lengthenedBias: 6, shortenedBias: 4, stretchMediatedPotential: 6 },

  { slug: "forward-lunge", name: "Forward Lunge",
    movementPattern: "lunge" as const, classification: "compound" as const,
    resistanceType: "dumbbell" as const, difficulty: "beginner" as const,
    unilateral: true, defaultBodyPosition: "standing" as const,
    fatigueCost: 5, technicalComplexity: 4, stabilityDemand: 6,
    jointStressSpine: 2, jointStressHip: 6, jointStressKnee: 7, jointStressAnkle: 3,
    lengthenedBias: 6, shortenedBias: 4, stretchMediatedPotential: 6 },

  { slug: "lateral-lunge", name: "Lateral Lunge",
    movementPattern: "lunge" as const, classification: "compound" as const,
    resistanceType: "dumbbell" as const, difficulty: "intermediate" as const,
    unilateral: true, defaultBodyPosition: "standing" as const,
    fatigueCost: 5, technicalComplexity: 5, stabilityDemand: 7,
    jointStressSpine: 2, jointStressHip: 6, jointStressKnee: 6, jointStressAnkle: 4,
    lengthenedBias: 6, shortenedBias: 4, stretchMediatedPotential: 6 },

  { slug: "curtsy-lunge", name: "Curtsy Lunge",
    movementPattern: "lunge" as const, classification: "compound" as const,
    resistanceType: "dumbbell" as const, difficulty: "intermediate" as const,
    unilateral: true, defaultBodyPosition: "standing" as const,
    fatigueCost: 5, technicalComplexity: 6, stabilityDemand: 7,
    jointStressSpine: 2, jointStressHip: 6, jointStressKnee: 6, jointStressAnkle: 4,
    lengthenedBias: 6, shortenedBias: 4, stretchMediatedPotential: 6 },

  { slug: "cossack-squat", name: "Cossack Squat",
    movementPattern: "squat_unilateral" as const, classification: "compound" as const,
    resistanceType: "bodyweight" as const, difficulty: "intermediate" as const,
    unilateral: true, defaultBodyPosition: "standing" as const,
    fatigueCost: 5, technicalComplexity: 6, stabilityDemand: 8,
    jointStressHip: 6, jointStressKnee: 6, jointStressAnkle: 5,
    lengthenedBias: 7, shortenedBias: 4, stretchMediatedPotential: 7 },

  // ── Step-Ups & Single-Leg ─────────────────────────────────

  { slug: "dumbbell-step-up", name: "Dumbbell Step-Up",
    movementPattern: "squat_unilateral" as const, classification: "compound" as const,
    resistanceType: "dumbbell" as const, difficulty: "beginner" as const,
    unilateral: true, defaultBodyPosition: "standing" as const,
    fatigueCost: 5, technicalComplexity: 4, stabilityDemand: 6,
    jointStressSpine: 2, jointStressHip: 5, jointStressKnee: 6, jointStressAnkle: 3,
    lengthenedBias: 4, shortenedBias: 5, stretchMediatedPotential: 4 },

  { slug: "barbell-step-up", name: "Barbell Step-Up",
    movementPattern: "squat_unilateral" as const, classification: "compound" as const,
    resistanceType: "barbell" as const, difficulty: "intermediate" as const,
    unilateral: true, defaultBodyPosition: "standing" as const,
    fatigueCost: 6, technicalComplexity: 6, stabilityDemand: 7,
    jointStressSpine: 4, jointStressHip: 6, jointStressKnee: 6, jointStressAnkle: 3,
    lengthenedBias: 4, shortenedBias: 5, stretchMediatedPotential: 4 },

  { slug: "pistol-squat", name: "Pistol Squat",
    movementPattern: "squat_unilateral" as const, classification: "compound" as const,
    resistanceType: "bodyweight" as const, difficulty: "advanced" as const,
    unilateral: true, defaultBodyPosition: "standing" as const,
    fatigueCost: 6, technicalComplexity: 8, stabilityDemand: 8,
    jointStressSpine: 3, jointStressHip: 9, jointStressKnee: 8, jointStressAnkle: 5,
    lengthenedBias: 6, shortenedBias: 5, stretchMediatedPotential: 6 },

  { slug: "box-pistol-squat", name: "Box Pistol Squat",
    movementPattern: "squat_unilateral" as const, classification: "compound" as const,
    resistanceType: "bodyweight" as const, difficulty: "intermediate" as const,
    unilateral: true, defaultBodyPosition: "standing" as const,
    fatigueCost: 5, technicalComplexity: 6, stabilityDemand: 7,
    jointStressSpine: 2, jointStressHip: 7, jointStressKnee: 7, jointStressAnkle: 4,
    lengthenedBias: 5, shortenedBias: 5, stretchMediatedPotential: 5 },

  { slug: "single-leg-press", name: "Single-Leg Press",
    movementPattern: "squat_unilateral" as const, classification: "compound" as const,
    resistanceType: "machine" as const, difficulty: "intermediate" as const,
    unilateral: true, defaultBodyPosition: "seated" as const,
    fatigueCost: 5, technicalComplexity: 3, stabilityDemand: 7,
    jointStressSpine: 1, jointStressHip: 6, jointStressKnee: 7,
    lengthenedBias: 5, shortenedBias: 4, stretchMediatedPotential: 5 },

  // ── Knee Extension: Isolation ─────────────────────────────

  { slug: "leg-extension", name: "Leg Extension",
    movementPattern: "knee_extension" as const, classification: "isolation" as const,
    resistanceType: "machine" as const, difficulty: "beginner" as const,
    defaultBodyPosition: "seated" as const,
    fatigueCost: 2, technicalComplexity: 1, stabilityDemand: 1,
    jointStressKnee: 4,
    lengthenedBias: 0, shortenedBias: 9, stretchMediatedPotential: 2 },

  { slug: "single-leg-extension", name: "Single-Leg Extension",
    movementPattern: "knee_extension" as const, classification: "isolation" as const,
    resistanceType: "machine" as const, difficulty: "beginner" as const,
    unilateral: true, defaultBodyPosition: "seated" as const,
    fatigueCost: 2, technicalComplexity: 2, stabilityDemand: 2,
    jointStressKnee: 4,
    lengthenedBias: 0, shortenedBias: 9, stretchMediatedPotential: 2 },

  { slug: "sissy-squat", name: "Sissy Squat",
    movementPattern: "knee_extension" as const, classification: "isolation" as const,
    resistanceType: "bodyweight" as const, difficulty: "advanced" as const,
    defaultBodyPosition: "standing" as const,
    fatigueCost: 4, technicalComplexity: 8, stabilityDemand: 6,
    jointStressKnee: 9,
    lengthenedBias: 10, shortenedBias: 4, stretchMediatedPotential: 10 },

  // ── Locomotion ─────────────────────────────────────────────

  { slug: "sled-push", name: "Sled Push",
    movementPattern: "gait" as const, classification: "compound" as const,
    resistanceType: "plate_loaded" as const, difficulty: "intermediate" as const,
    defaultBodyPosition: "standing" as const,
    fatigueCost: 6, technicalComplexity: 3, stabilityDemand: 5,
    jointStressHip: 4, jointStressKnee: 4, jointStressAnkle: 5,
    lengthenedBias: 2, shortenedBias: 4, stretchMediatedPotential: 2 },

  { slug: "heel-elevated-goblet-squat", name: "Heel-Elevated Goblet Squat",
    movementPattern: "squat_bilateral" as const, classification: "compound" as const,
    resistanceType: "dumbbell" as const, difficulty: "beginner" as const,
    defaultBodyPosition: "standing" as const,
    fatigueCost: 4, technicalComplexity: 3, stabilityDemand: 4,
    jointStressSpine: 1, jointStressHip: 5, jointStressKnee: 6, jointStressAnkle: 1,
    lengthenedBias: 6, shortenedBias: 4, stretchMediatedPotential: 6 },

] as const;

// ─── MUSCLES ─────────────────────────────────────────────────
// [slug, muscle_group, role]

const MUSCLES: Array<[string, MuscleGroup, MuscleRole]> = [

  // Barbell bilateral squats
  ["back-squat",                   "quadriceps",     "primary"],
  ["back-squat",                   "glutes",         "secondary"],
  ["back-squat",                   "adductors",      "secondary"],
  ["back-squat",                   "spinal_erectors","stabilizer"],
  ["back-squat",                   "hamstrings",     "stabilizer"],

  ["low-bar-back-squat",           "quadriceps",     "primary"],
  ["low-bar-back-squat",           "glutes",         "secondary"],
  ["low-bar-back-squat",           "adductors",      "secondary"],
  ["low-bar-back-squat",           "spinal_erectors","stabilizer"],
  ["low-bar-back-squat",           "hamstrings",     "stabilizer"],

  ["front-squat",                  "quadriceps",     "primary"],
  ["front-squat",                  "glutes",         "secondary"],
  ["front-squat",                  "adductors",      "secondary"],
  ["front-squat",                  "spinal_erectors","stabilizer"],

  ["box-squat",                    "quadriceps",     "primary"],
  ["box-squat",                    "glutes",         "secondary"],
  ["box-squat",                    "adductors",      "secondary"],
  ["box-squat",                    "spinal_erectors","stabilizer"],
  ["box-squat",                    "hamstrings",     "stabilizer"],

  ["pause-squat",                  "quadriceps",     "primary"],
  ["pause-squat",                  "glutes",         "secondary"],
  ["pause-squat",                  "adductors",      "secondary"],
  ["pause-squat",                  "spinal_erectors","stabilizer"],
  ["pause-squat",                  "hamstrings",     "stabilizer"],

  ["safety-bar-squat",             "quadriceps",     "primary"],
  ["safety-bar-squat",             "glutes",         "secondary"],
  ["safety-bar-squat",             "adductors",      "secondary"],
  ["safety-bar-squat",             "spinal_erectors","stabilizer"],

  ["zercher-squat",                "quadriceps",     "primary"],
  ["zercher-squat",                "glutes",         "secondary"],
  ["zercher-squat",                "adductors",      "secondary"],
  ["zercher-squat",                "spinal_erectors","stabilizer"],
  ["zercher-squat",                "rectus_abdominis","stabilizer"],

  // Machine & smith bilateral squats
  ["smith-machine-squat",          "quadriceps",     "primary"],
  ["smith-machine-squat",          "glutes",         "secondary"],
  ["smith-machine-squat",          "adductors",      "secondary"],

  ["hack-squat",                   "quadriceps",     "primary"],
  ["hack-squat",                   "glutes",         "secondary"],
  ["hack-squat",                   "adductors",      "secondary"],
  ["hack-squat",                   "hamstrings",     "stabilizer"],

  ["barbell-hack-squat",           "quadriceps",     "primary"],
  ["barbell-hack-squat",           "glutes",         "secondary"],
  ["barbell-hack-squat",           "hamstrings",     "secondary"],

  ["leg-press",                    "quadriceps",     "primary"],
  ["leg-press",                    "glutes",         "secondary"],
  ["leg-press",                    "adductors",      "secondary"],
  ["leg-press",                    "hamstrings",     "stabilizer"],

  ["vertical-leg-press",           "quadriceps",     "primary"],
  ["vertical-leg-press",           "glutes",         "secondary"],
  ["vertical-leg-press",           "adductors",      "secondary"],
  ["vertical-leg-press",           "hamstrings",     "stabilizer"],

  ["belt-squat",                   "quadriceps",     "primary"],
  ["belt-squat",                   "glutes",         "secondary"],
  ["belt-squat",                   "adductors",      "secondary"],

  // Dumbbell & kettlebell bilateral squats
  ["goblet-squat",                 "quadriceps",     "primary"],
  ["goblet-squat",                 "glutes",         "secondary"],
  ["goblet-squat",                 "adductors",      "secondary"],
  ["goblet-squat",                 "transverse_abdominis", "stabilizer"],

  ["dumbbell-squat",               "quadriceps",     "primary"],
  ["dumbbell-squat",               "glutes",         "secondary"],
  ["dumbbell-squat",               "adductors",      "secondary"],

  ["kettlebell-front-squat",       "quadriceps",     "primary"],
  ["kettlebell-front-squat",       "glutes",         "secondary"],
  ["kettlebell-front-squat",       "adductors",      "secondary"],
  ["kettlebell-front-squat",       "transverse_abdominis", "stabilizer"],

  // Bodyweight & isometric
  ["bodyweight-squat",             "quadriceps",     "primary"],
  ["bodyweight-squat",             "glutes",         "secondary"],

  ["jump-squat",                   "quadriceps",     "primary"],
  ["jump-squat",                   "glutes",         "secondary"],
  ["jump-squat",                   "calves",         "secondary"],
  ["jump-squat",                   "hamstrings",     "stabilizer"],

  ["wall-sit",                     "quadriceps",     "primary"],
  ["wall-sit",                     "glutes",         "secondary"],

  ["spanish-squat",                "quadriceps",     "primary"],
  ["spanish-squat",                "glutes",         "secondary"],

  // Unilateral squat & lunge
  ["barbell-bulgarian-split-squat","quadriceps",     "primary"],
  ["barbell-bulgarian-split-squat","glutes",         "secondary"],
  ["barbell-bulgarian-split-squat","hamstrings",     "secondary"],
  ["barbell-bulgarian-split-squat","adductors",      "stabilizer"],
  ["barbell-bulgarian-split-squat","obliques",       "stabilizer"],

  ["dumbbell-bulgarian-split-squat","quadriceps",    "primary"],
  ["dumbbell-bulgarian-split-squat","glutes",        "secondary"],
  ["dumbbell-bulgarian-split-squat","hamstrings",    "secondary"],
  ["dumbbell-bulgarian-split-squat","adductors",     "stabilizer"],
  ["dumbbell-bulgarian-split-squat","obliques",      "stabilizer"],

  ["atg-split-squat",              "quadriceps",     "primary"],
  ["atg-split-squat",              "glutes",         "secondary"],
  ["atg-split-squat",              "adductors",      "stabilizer"],
  ["atg-split-squat",              "tibialis",       "stabilizer"],

  ["walking-lunge",                "quadriceps",     "primary"],
  ["walking-lunge",                "glutes",         "secondary"],
  ["walking-lunge",                "hamstrings",     "secondary"],
  ["walking-lunge",                "abductors",      "stabilizer"],
  ["walking-lunge",                "obliques",       "stabilizer"],

  ["barbell-walking-lunge",        "quadriceps",     "primary"],
  ["barbell-walking-lunge",        "glutes",         "secondary"],
  ["barbell-walking-lunge",        "hamstrings",     "secondary"],
  ["barbell-walking-lunge",        "abductors",      "stabilizer"],
  ["barbell-walking-lunge",        "obliques",       "stabilizer"],

  ["reverse-lunge",                "quadriceps",     "primary"],
  ["reverse-lunge",                "glutes",         "secondary"],
  ["reverse-lunge",                "hamstrings",     "secondary"],
  ["reverse-lunge",                "abductors",      "stabilizer"],

  ["forward-lunge",                "quadriceps",     "primary"],
  ["forward-lunge",                "glutes",         "secondary"],
  ["forward-lunge",                "hamstrings",     "secondary"],
  ["forward-lunge",                "abductors",      "stabilizer"],

  ["lateral-lunge",                "quadriceps",     "primary"],
  ["lateral-lunge",                "adductors",      "secondary"],
  ["lateral-lunge",                "glutes",         "secondary"],
  ["lateral-lunge",                "abductors",      "stabilizer"],

  ["curtsy-lunge",                 "quadriceps",     "primary"],
  ["curtsy-lunge",                 "glutes",         "secondary"],
  ["curtsy-lunge",                 "adductors",      "secondary"],
  ["curtsy-lunge",                 "abductors",      "stabilizer"],

  ["cossack-squat",                "quadriceps",     "primary"],
  ["cossack-squat",                "adductors",      "secondary"],
  ["cossack-squat",                "glutes",         "secondary"],
  ["cossack-squat",                "tibialis",       "stabilizer"],

  // Step-ups & single-leg
  ["dumbbell-step-up",             "quadriceps",     "primary"],
  ["dumbbell-step-up",             "glutes",         "secondary"],
  ["dumbbell-step-up",             "hamstrings",     "secondary"],
  ["dumbbell-step-up",             "abductors",      "stabilizer"],

  ["barbell-step-up",              "quadriceps",     "primary"],
  ["barbell-step-up",              "glutes",         "secondary"],
  ["barbell-step-up",              "hamstrings",     "secondary"],
  ["barbell-step-up",              "abductors",      "stabilizer"],

  ["pistol-squat",                 "quadriceps",     "primary"],
  ["pistol-squat",                 "glutes",         "secondary"],
  ["pistol-squat",                 "hamstrings",     "secondary"],
  ["pistol-squat",                 "abductors",      "stabilizer"],
  ["pistol-squat",                 "tibialis",       "stabilizer"],

  ["box-pistol-squat",             "quadriceps",     "primary"],
  ["box-pistol-squat",             "glutes",         "secondary"],
  ["box-pistol-squat",             "abductors",      "stabilizer"],
  ["box-pistol-squat",             "tibialis",       "stabilizer"],

  ["single-leg-press",             "quadriceps",     "primary"],
  ["single-leg-press",             "glutes",         "secondary"],
  ["single-leg-press",             "adductors",      "secondary"],
  ["single-leg-press",             "hamstrings",     "stabilizer"],

  // Knee extension isolation
  ["leg-extension",                "quadriceps",     "primary"],
  ["single-leg-extension",         "quadriceps",     "primary"],
  ["sissy-squat",                  "quadriceps",     "primary"],
  ["sissy-squat",                  "rectus_abdominis","stabilizer"],

  // Locomotion
  ["sled-push",                    "quadriceps",     "primary"],
  ["sled-push",                    "glutes",         "secondary"],
  ["sled-push",                    "calves",         "secondary"],
  ["sled-push",                    "transverse_abdominis", "stabilizer"],

  ["heel-elevated-goblet-squat",   "quadriceps",     "primary"],
  ["heel-elevated-goblet-squat",   "glutes",         "secondary"],
  ["heel-elevated-goblet-squat",   "adductors",      "secondary"],
];

// ─── EQUIPMENT LINKS ─────────────────────────────────────────
// [exercise_slug, equipment_slug, requirement_type]

const EXERCISE_EQUIPMENT: Array<[string, string, EquipmentRequirement]> = [
  ["back-squat",                    "barbell",           "required"],
  ["back-squat",                    "power-rack",        "required"],
  ["low-bar-back-squat",            "barbell",           "required"],
  ["low-bar-back-squat",            "power-rack",        "required"],
  ["front-squat",                   "barbell",           "required"],
  ["front-squat",                   "power-rack",        "required"],
  ["box-squat",                     "barbell",           "required"],
  ["box-squat",                     "power-rack",        "required"],
  ["box-squat",                     "squat-box",         "required"],
  ["pause-squat",                   "barbell",           "required"],
  ["pause-squat",                   "power-rack",        "required"],
  ["safety-bar-squat",              "safety-squat-bar",  "required"],
  ["safety-bar-squat",              "power-rack",        "required"],
  ["zercher-squat",                 "barbell",           "required"],
  ["zercher-squat",                 "power-rack",        "optional"],
  ["smith-machine-squat",           "smith-machine",     "required"],
  ["hack-squat",                    "hack-squat-machine","required"],
  ["barbell-hack-squat",            "barbell",           "required"],
  ["leg-press",                     "leg-press-machine", "required"],
  ["vertical-leg-press",            "leg-press-machine", "required"],
  ["belt-squat",                    "belt-squat-machine","required"],
  ["goblet-squat",                  "dumbbells",         "required"],
  ["dumbbell-squat",                "dumbbells",         "required"],
  ["kettlebell-front-squat",        "kettlebells",       "required"],
  ["spanish-squat",                 "resistance-band",   "required"],
  ["spanish-squat",                 "power-rack",        "required"],
  ["barbell-bulgarian-split-squat", "barbell",           "required"],
  ["barbell-bulgarian-split-squat", "flat-bench",        "required"],
  ["dumbbell-bulgarian-split-squat","dumbbells",         "required"],
  ["dumbbell-bulgarian-split-squat","flat-bench",        "required"],
  ["atg-split-squat",               "dumbbells",         "required"],
  ["atg-split-squat",               "flat-bench",        "required"],
  ["walking-lunge",                 "dumbbells",         "required"],
  ["barbell-walking-lunge",         "barbell",           "required"],
  ["reverse-lunge",                 "dumbbells",         "required"],
  ["forward-lunge",                 "dumbbells",         "required"],
  ["lateral-lunge",                 "dumbbells",         "required"],
  ["curtsy-lunge",                  "dumbbells",         "required"],
  ["dumbbell-step-up",              "dumbbells",         "required"],
  ["dumbbell-step-up",              "plyo-box",          "required"],
  ["barbell-step-up",               "barbell",           "required"],
  ["barbell-step-up",               "plyo-box",          "required"],
  ["box-pistol-squat",              "squat-box",         "required"],
  ["single-leg-press",              "leg-press-machine", "required"],
  ["leg-extension",                 "leg-extension-machine","required"],
  ["single-leg-extension",          "leg-extension-machine","required"],
  ["sled-push",                     "sled",              "required"],
  ["heel-elevated-goblet-squat",    "dumbbells",         "required"],
];

// ─── COACHING CUES ───────────────────────────────────────────
// [slug, cue_type, content, order_index]

export const CUES: Array<[string, ExerciseCueType, string, number]> = [

  ["back-squat", "setup",
    "Bar rests on the upper traps, just below the base of the neck. Grip just outside shoulder-width. Unrack, take two steps back, and set feet to hip- or shoulder-width.",
    1],
  ["back-squat", "execution",
    "Break at the hips and knees together. Descend to at least parallel, keeping the chest up and knees tracking over the toes. Drive up through the whole foot.",
    2],
  ["back-squat", "breathing",
    "Brace with a big belly breath before unracking. Hold the brace through the full rep, exhale at the top, and reset before the next.",
    3],
  ["back-squat", "common_error",
    "Knees caving inward (valgus collapse) on the ascent: increases shear force on the knee ligaments. Cue 'knees out' and check hip and ankle mobility if it persists.",
    4],

  ["front-squat", "setup",
    "Bar rests across the front deltoids, elbows driven high so the upper arm is close to parallel with the floor. Fingertip or crossed-arm grip.",
    1],
  ["front-squat", "execution",
    "Descend with a more upright torso than a back squat — the front-loaded bar forces this posture. Keep elbows up throughout; if they drop, the bar will roll off the shoulders.",
    2],
  ["front-squat", "common_error",
    "Elbows dropping during the descent: shifts the bar forward and often causes a forward torso collapse. Practice front rack mobility drills if elbow height can't be maintained.",
    3],

  ["box-squat", "setup",
    "Set a box or bench to just below parallel height. Descend as in a standard back squat, aiming to sit fully onto the box.",
    1],
  ["box-squat", "execution",
    "Sit back onto the box under control, relax the hips for a brief moment without collapsing the torso, then drive back up. No bouncing off the box.",
    2],

  ["safety-bar-squat", "setup",
    "The safety bar's cambered design shifts the load slightly forward and lets you hold the handles or cross your arms — no overhead shoulder mobility required.",
    1],
  ["safety-bar-squat", "execution",
    "Expect a more forward-leaning torso than a standard back squat due to the altered bar path. Brace hard through the midsection to control the forward pull.",
    2],

  ["zercher-squat", "setup",
    "Cradle the bar in the crooks of your elbows, held tight against the torso. Pad the bar if needed — this position is uncomfortable before it's heavy.",
    1],
  ["zercher-squat", "execution",
    "Keep the torso upright and braced hard; the front-loaded position demands significant anterior core strength to resist forward lean.",
    2],

  ["hack-squat", "setup",
    "Set shoulder pads snug against the shoulders, feet placed slightly forward of the platform edge for a knee-dominant path.",
    1],
  ["hack-squat", "execution",
    "Lower under control to at least parallel, driving through the whole foot on the way up. The fixed path removes balance demand, letting you focus entirely on depth and tempo.",
    2],

  ["leg-press", "setup",
    "Place feet shoulder-width on the platform, slightly higher for more glute involvement or slightly lower for more quad emphasis.",
    1],
  ["leg-press", "execution",
    "Lower until the knees reach roughly 90° or your lower back begins to round off the pad — never let the lower back lift off the pad to gain extra depth.",
    2],
  ["leg-press", "common_error",
    "Locking the knees out hard at the top: unnecessary joint stress with no added training benefit. Stop just short of full lockout and reverse.",
    3],

  ["barbell-hack-squat", "setup",
    "Place the barbell behind the legs against the calves with feet about hip-width. Hinge down to grip the bar, brace, and keep the chest as tall as mobility allows.",
    1],
  ["barbell-hack-squat", "execution",
    "Drive through the whole foot and let the knees travel forward as the bar slides close behind the legs. Lower under control until the plates or mobility set the range.",
    2],
  ["barbell-hack-squat", "common_error",
    "Letting the bar drift backward pulls the shoulders down and rounds the spine. Keep the bar close to the legs and reduce load if posture changes.",
    3],
  ["barbell-hack-squat", "safety",
    "Use bumper plates or blocks to set a manageable start height; this advanced variation stresses knees, grip, and spinal position when loaded too aggressively.",
    4],

  ["belt-squat", "setup",
    "Attach the belt around the hips, stand on the platform with the load hanging below. No bar on the back or shoulders.",
    1],
  ["belt-squat", "execution",
    "Squat as you would with a back squat, but with zero axial spinal loading — useful for high-volume leg work when the spine needs a break from barbell loading.",
    2],

  ["goblet-squat", "setup",
    "Hold a dumbbell vertically at chest height, elbows pointing down and in toward the body.",
    1],
  ["goblet-squat", "execution",
    "Squat between the knees, using the elbows brushing the inner thighs at the bottom as a depth cue. Keep the chest up and torso as vertical as possible.",
    2],

  ["wall-sit", "setup",
    "Slide down a wall until thighs are parallel to the floor, knees tracking directly over the ankles, back flat against the wall.",
    1],
  ["wall-sit", "execution",
    "Hold the position for time. There is no eccentric or concentric phase — the quads work isometrically the entire set. Breathe steadily; don't hold your breath.",
    2],

  ["spanish-squat", "setup",
    "Loop a heavy band around a rack at knee height and behind both knees. Stand facing away from the anchor with the band pulling you back into a squat.",
    1],
  ["spanish-squat", "execution",
    "Sit back against the band tension at a comfortable knee angle and hold. This position loads the quadriceps heavily while minimizing shear at the knee — commonly used in patellar tendon rehab.",
    2],
  ["spanish-squat", "safety",
    "A common tool for managing patellar tendinopathy under coach or clinician guidance — confirm appropriate load and hold duration for the individual's rehab stage.",
    3],

  ["barbell-bulgarian-split-squat", "setup",
    "Rest the top of one foot on a bench behind you, front foot far enough forward that the front knee stays roughly over the ankle at the bottom.",
    1],
  ["barbell-bulgarian-split-squat", "execution",
    "Lower straight down until the rear knee nearly touches the floor. Drive up through the front heel. Expect significant lengthened-position quad demand at the bottom.",
    2],
  ["barbell-bulgarian-split-squat", "common_error",
    "Front foot placed too close to the bench: forces the front knee far past the toes and shifts load away from the target musculature onto the knee joint. Lengthen the stance.",
    3],

  ["atg-split-squat", "setup",
    "Similar setup to a Bulgarian split squat, but prioritize maximum ankle dorsiflexion and knee travel over the toes within a pain-free range.",
    1],
  ["atg-split-squat", "execution",
    "Descend as deep as mobility allows, aiming to load the quad through its full available range. Progress depth gradually — this is a mobility-building tool, not just a strength exercise.",
    2],

  ["walking-lunge", "setup",
    "Hold dumbbells at your sides. Take a step long enough that the front knee doesn't travel far past the toes at the bottom.",
    1],
  ["walking-lunge", "execution",
    "Lower the rear knee toward the floor, then drive through the front foot to step into the next lunge. Keep the torso upright throughout.",
    2],

  ["barbell-walking-lunge", "setup",
    "Set the bar on the upper back as for a squat, brace, and choose a clear lane before stepping. Start with a shorter route than dumbbell walking lunges.",
    1],
  ["barbell-walking-lunge", "execution",
    "Step forward into each lunge with control, lower the rear knee toward the floor, then drive through the front foot to bring the rear leg through into the next rep.",
    2],
  ["barbell-walking-lunge", "common_error",
    "Rushing the step or crossing the feet narrows the base and causes side-to-side wobble under the bar. Step deliberately and keep feet on parallel tracks.",
    3],
  ["barbell-walking-lunge", "safety",
    "Avoid near-failure sets and use spotter arms or an open lane; missed balance with a barbell is harder to recover than with dumbbells.",
    4],

  ["cossack-squat", "setup",
    "Take a wide stance, feet turned slightly out. Shift your weight to one side while keeping the opposite leg straight.",
    1],
  ["cossack-squat", "execution",
    "Sink into the bent leg while the straight leg's heel stays on the floor if mobility allows. Push through the bent leg to return to center before shifting to the other side.",
    2],

  ["pistol-squat", "setup",
    "Stand on one leg with the other extended forward. Arms can extend forward for counterbalance.",
    1],
  ["pistol-squat", "execution",
    "Lower under control to a full squat on the standing leg while keeping the extended leg off the floor. This requires substantial ankle mobility, balance, and single-leg strength.",
    2],
  ["pistol-squat", "safety",
    "Build toward this with box pistol squats and single-leg press strength work first — the demand on the knee and hip at full depth is severe without adequate preparation.",
    3],

  ["leg-extension", "setup",
    "Set the pad against the shins just above the ankle. Adjust the seat back so the knee joint aligns with the machine's pivot point.",
    1],
  ["leg-extension", "execution",
    "Extend to full knee extension, pausing briefly at the top for peak contraction. Control the return — don't let the weight stack drop.",
    2],

  ["sissy-squat", "setup",
    "Stand with feet hip-width, holding a fixed support for balance. Rise onto the balls of the feet.",
    1],
  ["sissy-squat", "execution",
    "Lean back and bend the knees, keeping hips extended, so the body descends in a straight line from knees to shoulders. This drives the quads through an extreme stretched loading position.",
    2],
  ["sissy-squat", "common_error",
    "Bending at the hips instead of staying in a straight line: turns the movement into a partial squat and removes the deep quad stretch that makes this exercise valuable.",
    3],

  ["sled-push", "setup",
    "Load the sled appropriately for the intended stimulus — lighter loads for speed work, heavier loads for a strength-endurance stimulus. Set hands on the high or low handles.",
    1],
  ["sled-push", "execution",
    "Drive through the balls of the feet with short, powerful steps, maintaining a forward lean from the ankles. This is a low-eccentric-stress way to accumulate high-quality quad and conditioning volume.",
    2],
];

// ─── EXERCISE RELATIONS ────────────────────────────────────────
// [source_slug, target_slug, relation_type, notes]

const RELATIONS: Array<[string, string, ExerciseRelationType, string]> = [

  // Back squat family — substitutes
  ["back-squat", "front-squat", "same_pattern",
    "Front-loaded position forces a more upright torso, shifting emphasis further onto the quadriceps and reducing shear at the hip relative to a back squat."],
  ["back-squat", "safety-bar-squat", "lower_joint_stress",
    "Cambered bar removes the overhead shoulder mobility requirement of a standard back squat — appropriate for athletes with limited shoulder external rotation."],
  ["back-squat", "goblet-squat", "lower_joint_stress",
    "Front-loaded dumbbell removes axial spinal loading almost entirely — a reliable regression for coaching squat mechanics or managing spinal load tolerance."],
  ["back-squat", "leg-press", "lower_joint_stress",
    "Fully supported machine path removes all balance and spinal stabilization demand, isolating the quads and glutes without axial loading."],
  ["back-squat", "smith-machine-squat", "lower_joint_stress",
    "Fixed vertical bar path removes the balance demand of a free barbell, letting an athlete train close to failure with reduced technical risk."],
  ["back-squat", "box-squat", "same_pattern",
    "Dead-stop variation at a fixed depth removes the stretch reflex and reinforces consistent depth — commonly used to build starting strength out of the bottom."],
  ["back-squat", "hack-squat", "lower_joint_stress",
    "Machine-guided path with back support removes spinal loading almost entirely while preserving a similar knee-dominant demand."],
  ["back-squat", "belt-squat", "lower_joint_stress",
    "Hip-belt loading eliminates spinal compression entirely — a common tool for high squat volume without accumulating axial fatigue."],

  // Front squat / Zercher
  ["front-squat", "zercher-squat", "same_pattern",
    "Both are anteriorly-loaded squat variations that force an upright torso; Zercher's elbow-crook hold is more accessible for athletes without front-rack wrist mobility."],

  // Bodyweight progression chain
  ["bodyweight-squat", "goblet-squat", "progression",
    "Goblet squat is a progression of the bodyweight squat — once bodyweight depth and control are mastered, add external load held at the chest."],
  ["goblet-squat", "bodyweight-squat", "regression",
    "Bodyweight squat is the regression path when external load needs to be removed to focus purely on depth, tempo, or mobility."],
  ["goblet-squat", "back-squat", "progression",
    "Back squat is a progression of the goblet squat pattern — once loading capacity exceeds what can be held at the chest, transition to a barbell."],

  // Pistol squat chain
  ["pistol-squat", "box-pistol-squat", "regression",
    "Box pistol squat provides a controlled depth and a resting point at the bottom — the standard regression path while building single-leg strength and balance toward a full pistol."],
  ["box-pistol-squat", "pistol-squat", "progression",
    "Pistol squat is a progression of the box pistol squat — remove the box once full depth can be controlled without a pause."],
  ["pistol-squat", "single-leg-press", "lower_joint_stress",
    "Machine-supported single-leg press trains the same unilateral quad demand without the balance and ankle mobility requirements of a free-standing pistol squat."],

  // Bulgarian split squat family
  ["barbell-bulgarian-split-squat", "dumbbell-bulgarian-split-squat", "regression",
    "Dumbbell version removes the bar-balance and setup complexity of a barbell rear-foot-elevated split squat while preserving the same lengthened-position loading."],
  ["dumbbell-bulgarian-split-squat", "barbell-bulgarian-split-squat", "progression",
    "Barbell version is a progression once dumbbell loading capacity is limited by grip or the ability to get heavy dumbbells into position."],
  ["dumbbell-bulgarian-split-squat", "atg-split-squat", "same_pattern",
    "Both are rear-foot-elevated unilateral squats; ATG split squat prioritizes maximum knee and ankle range of motion over external load."],

  // Lunge family
  ["walking-lunge", "reverse-lunge", "lower_joint_stress",
    "Stepping backward rather than forward reduces anterior knee shear at foot strike, making the reverse lunge a knee-friendly regression for athletes managing knee sensitivity."],
  ["walking-lunge", "forward-lunge", "same_pattern",
    "Stationary forward-stepping variation of the same pattern without the continuous locomotion demand of walking lunges."],
  ["lateral-lunge", "curtsy-lunge", "same_pattern",
    "Both load the frontal and transverse planes; curtsy lunge crosses the working leg behind the body for greater adductor and glute medius involvement."],

  // Step-up family
  ["dumbbell-step-up", "barbell-step-up", "progression",
    "Barbell step-up is a progression of the dumbbell version — once dumbbell loading is limited by grip, a barbell allows heavier loading without a grip bottleneck."],
  ["barbell-step-up", "dumbbell-step-up", "regression",
    "Dumbbell step-up is the regression path — easier to set up, and the independent arm loading provides a natural check on left-right compensation."],

  // Isolation
  ["sissy-squat", "leg-extension", "same_pattern",
    "Both isolate the quadriceps through knee extension; sissy squat delivers its stimulus at the lengthened position while leg extension delivers it at the shortened, peak-contraction position."],
  ["leg-extension", "single-leg-extension", "contralateral",
    "Single-leg version trains each quadriceps independently, useful for identifying and correcting side-to-side strength asymmetries."],

  // Conditioning substitute
  ["sled-push", "leg-press", "lower_joint_stress",
    "Both provide high quad volume with minimal eccentric loading and no axial spinal compression — sled push adds a metabolic conditioning component leg press does not."],
];

// ─── MAIN ─────────────────────────────────────────────────────

async function main() {
  console.log("\nCatalyst OS — Exercise Library Seed 003: Lower Body Quad-Dominant");
  console.log("─────────────────────────────────────────────────────────\n");

  console.log(`Seeding equipment catalog…`);
  const equipmentMap = await seedEquipment([...SHARED_EQUIPMENT, ...EQUIPMENT]);
  console.log(`  ✓ Equipment: ${equipmentMap.size} total items`);

  await seedExercises(
    EXERCISES,
    equipmentMap,
    MUSCLES,
    EXERCISE_EQUIPMENT,
    CUES,
    RELATIONS,
    "003 — Lower Body Quad-Dominant (40 exercises)",
  );

  console.log("─────────────────────────────────────────────────────────");
  console.log("Seed 003 complete.\n");
  await sql.end();
}

main().catch(async (err) => {
  console.error("\nSeed failed:", err instanceof Error ? err.message : err);
  await sql.end();
  process.exit(1);
});
