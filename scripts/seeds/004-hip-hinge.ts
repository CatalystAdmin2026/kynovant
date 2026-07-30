#!/usr/bin/env npx tsx
// ─────────────────────────────────────────────────────────────
// Catalyst OS — Exercise Library Seed 004: Hip Hinge
//
// Usage:
//   source .env.local && npx tsx scripts/seeds/004-hip-hinge.ts
//
// Covers:
//   Hip hinge — barbell, dumbbell, kettlebell, machine
//   Hip extension / glute bridge — barbell, bodyweight, machine
//   RDL family — barbell, dumbbell, kettlebell, single-leg
//   Deadlift family — barbell, trap bar, dumbbell, kettlebell, sumo
//   Unilateral hinge — single-leg RDL, single-leg deadlift variations
//
// Count: 41 exercises
// Spec: docs/exercise-intelligence-spec.md
// ─────────────────────────────────────────────────────────────

import { SHARED_EQUIPMENT, db, sql, seedEquipment, seedExercises } from "./_shared";
import type { MuscleGroup, MuscleRole, EquipmentRequirement, ExerciseCueType, ExerciseRelationType } from "./_shared";

// ─── LOCAL EQUIPMENT ─────────────────────────────────────────
// Additions beyond SHARED_EQUIPMENT needed for this file.

const EQUIPMENT = [
  { slug: "deficit-platform", name: "Deficit Platform / Plates", category: "accessories" },
] as const;

// ─── EXERCISES ───────────────────────────────────────────────

const EXERCISES = [

  // ── Deadlift Family: Barbell ──────────────────────────────

  { slug: "conventional-deadlift", name: "Conventional Deadlift",
    movementPattern: "hip_hinge" as const, classification: "compound" as const,
    resistanceType: "barbell" as const, difficulty: "advanced" as const,
    fatigueCost: 8, technicalComplexity: 6, stabilityDemand: 5,
    jointStressWrist: 3, jointStressSpine: 8, jointStressHip: 7, jointStressKnee: 3,
    lengthenedBias: 6, stretchMediatedPotential: 5 },

  { slug: "sumo-deadlift", name: "Sumo Deadlift",
    movementPattern: "hip_hinge" as const, classification: "compound" as const,
    resistanceType: "barbell" as const, difficulty: "advanced" as const,
    fatigueCost: 8, technicalComplexity: 7, stabilityDemand: 5,
    jointStressWrist: 3, jointStressSpine: 6, jointStressHip: 7, jointStressKnee: 4,
    lengthenedBias: 5, stretchMediatedPotential: 4 },

  { slug: "deficit-deadlift", name: "Deficit Deadlift",
    movementPattern: "hip_hinge" as const, classification: "compound" as const,
    resistanceType: "barbell" as const, difficulty: "advanced" as const,
    fatigueCost: 9, technicalComplexity: 8, stabilityDemand: 6,
    jointStressWrist: 3, jointStressSpine: 9, jointStressHip: 8, jointStressKnee: 4,
    lengthenedBias: 8, stretchMediatedPotential: 7 },

  { slug: "block-pull", name: "Block Pull (Rack Pull)",
    movementPattern: "hip_hinge" as const, classification: "compound" as const,
    resistanceType: "barbell" as const, difficulty: "intermediate" as const,
    fatigueCost: 7, technicalComplexity: 4, stabilityDemand: 4,
    jointStressWrist: 3, jointStressSpine: 6, jointStressHip: 5, jointStressKnee: 2,
    lengthenedBias: 2, shortenedBias: 5, stretchMediatedPotential: 1 },

  { slug: "snatch-grip-deadlift", name: "Snatch-Grip Deadlift",
    movementPattern: "hip_hinge" as const, classification: "compound" as const,
    resistanceType: "barbell" as const, difficulty: "specialist" as const,
    fatigueCost: 9, technicalComplexity: 8, stabilityDemand: 6,
    jointStressWrist: 4, jointStressSpine: 9, jointStressHip: 8, jointStressKnee: 4,
    lengthenedBias: 7, stretchMediatedPotential: 6 },

  { slug: "banded-deadlift", name: "Banded Deadlift",
    movementPattern: "hip_hinge" as const, classification: "compound" as const,
    resistanceType: "barbell" as const, difficulty: "advanced" as const,
    fatigueCost: 8, technicalComplexity: 7, stabilityDemand: 5,
    jointStressWrist: 3, jointStressSpine: 7, jointStressHip: 7, jointStressKnee: 3,
    lengthenedBias: 5, shortenedBias: 7, stretchMediatedPotential: 4 },

  // ── Deadlift Family: Trap Bar & Dumbbell ─────────────────

  { slug: "trap-bar-deadlift", name: "Trap Bar Deadlift",
    movementPattern: "hip_hinge" as const, classification: "compound" as const,
    resistanceType: "trap_bar" as const, difficulty: "intermediate" as const,
    fatigueCost: 7, technicalComplexity: 4, stabilityDemand: 5,
    jointStressWrist: 2, jointStressSpine: 5, jointStressHip: 6, jointStressKnee: 4,
    lengthenedBias: 5, stretchMediatedPotential: 4 },

  { slug: "trap-bar-deadlift-high-handle", name: "Trap Bar Deadlift (High Handle)",
    movementPattern: "hip_hinge" as const, classification: "compound" as const,
    resistanceType: "trap_bar" as const, difficulty: "beginner" as const,
    fatigueCost: 6, technicalComplexity: 3, stabilityDemand: 4,
    jointStressWrist: 2, jointStressSpine: 4, jointStressHip: 5, jointStressKnee: 3,
    lengthenedBias: 4, stretchMediatedPotential: 3 },

  { slug: "dumbbell-deadlift", name: "Dumbbell Deadlift",
    movementPattern: "hip_hinge" as const, classification: "compound" as const,
    resistanceType: "dumbbell" as const, difficulty: "beginner" as const,
    fatigueCost: 6, technicalComplexity: 4, stabilityDemand: 5,
    jointStressWrist: 2, jointStressSpine: 4, jointStressHip: 5, jointStressKnee: 3,
    lengthenedBias: 6, stretchMediatedPotential: 5 },

  // ── RDL Family: Barbell, Dumbbell, Kettlebell ────────────

  { slug: "barbell-romanian-deadlift", name: "Barbell Romanian Deadlift",
    movementPattern: "hip_hinge" as const, classification: "compound" as const,
    resistanceType: "barbell" as const, difficulty: "intermediate" as const,
    fatigueCost: 7, technicalComplexity: 6, stabilityDemand: 5,
    jointStressWrist: 2, jointStressSpine: 5, jointStressHip: 5, jointStressKnee: 0,
    lengthenedBias: 7, stretchMediatedPotential: 7 },

  { slug: "dumbbell-romanian-deadlift", name: "Dumbbell Romanian Deadlift",
    movementPattern: "hip_hinge" as const, classification: "compound" as const,
    resistanceType: "dumbbell" as const, difficulty: "beginner" as const,
    fatigueCost: 5, technicalComplexity: 4, stabilityDemand: 4,
    jointStressWrist: 1, jointStressSpine: 4, jointStressHip: 5, jointStressKnee: 0,
    lengthenedBias: 7, stretchMediatedPotential: 7 },

  { slug: "kettlebell-romanian-deadlift", name: "Kettlebell Romanian Deadlift",
    movementPattern: "hip_hinge" as const, classification: "compound" as const,
    resistanceType: "kettlebell" as const, difficulty: "beginner" as const,
    fatigueCost: 4, technicalComplexity: 4, stabilityDemand: 4,
    jointStressWrist: 1, jointStressSpine: 3, jointStressHip: 4, jointStressKnee: 0,
    lengthenedBias: 7, stretchMediatedPotential: 7 },

  { slug: "deficit-romanian-deadlift", name: "Deficit Romanian Deadlift",
    movementPattern: "hip_hinge" as const, classification: "compound" as const,
    resistanceType: "barbell" as const, difficulty: "advanced" as const,
    fatigueCost: 8, technicalComplexity: 7, stabilityDemand: 6,
    jointStressWrist: 2, jointStressSpine: 6, jointStressHip: 6, jointStressKnee: 0,
    lengthenedBias: 10, stretchMediatedPotential: 9 },

  { slug: "stiff-leg-deadlift", name: "Stiff-Leg Deadlift",
    movementPattern: "hip_hinge" as const, classification: "compound" as const,
    resistanceType: "barbell" as const, difficulty: "intermediate" as const,
    fatigueCost: 7, technicalComplexity: 6, stabilityDemand: 4,
    jointStressWrist: 2, jointStressSpine: 6, jointStressHip: 4, jointStressKnee: 3,
    lengthenedBias: 8, stretchMediatedPotential: 8 },

  { slug: "good-morning", name: "Good Morning",
    movementPattern: "hip_hinge" as const, classification: "compound" as const,
    resistanceType: "barbell" as const, difficulty: "advanced" as const,
    fatigueCost: 6, technicalComplexity: 7, stabilityDemand: 5,
    jointStressSpine: 6, jointStressHip: 4, jointStressKnee: 0,
    lengthenedBias: 7, stretchMediatedPotential: 7 },

  { slug: "seated-good-morning", name: "Seated Good Morning",
    movementPattern: "hip_hinge" as const, classification: "compound" as const,
    resistanceType: "barbell" as const, difficulty: "advanced" as const,
    defaultBodyPosition: "seated" as const,
    fatigueCost: 5, technicalComplexity: 7, stabilityDemand: 4,
    jointStressSpine: 6, jointStressHip: 2,
    lengthenedBias: 7, stretchMediatedPotential: 7 },

  // ── Unilateral Hinge ──────────────────────────────────────

  { slug: "single-leg-romanian-deadlift", name: "Single-Leg Romanian Deadlift",
    movementPattern: "hip_hinge" as const, classification: "compound" as const,
    resistanceType: "dumbbell" as const, difficulty: "advanced" as const,
    unilateral: true, defaultBodyPosition: "standing" as const,
    fatigueCost: 5, technicalComplexity: 7, stabilityDemand: 8,
    jointStressSpine: 3, jointStressHip: 4, jointStressKnee: 1, jointStressAnkle: 3,
    lengthenedBias: 8, stretchMediatedPotential: 8 },

  { slug: "kettlebell-single-leg-deadlift", name: "Kettlebell Single-Leg Deadlift",
    movementPattern: "hip_hinge" as const, classification: "compound" as const,
    resistanceType: "kettlebell" as const, difficulty: "intermediate" as const,
    unilateral: true, defaultBodyPosition: "standing" as const,
    fatigueCost: 4, technicalComplexity: 6, stabilityDemand: 8,
    jointStressSpine: 2, jointStressHip: 3, jointStressKnee: 1, jointStressAnkle: 3,
    lengthenedBias: 7, stretchMediatedPotential: 7 },

  { slug: "barbell-single-leg-romanian-deadlift", name: "Barbell Single-Leg Romanian Deadlift",
    movementPattern: "hip_hinge" as const, classification: "compound" as const,
    resistanceType: "barbell" as const, difficulty: "specialist" as const,
    unilateral: true, defaultBodyPosition: "standing" as const,
    fatigueCost: 6, technicalComplexity: 8, stabilityDemand: 9,
    jointStressWrist: 2, jointStressSpine: 4, jointStressHip: 4, jointStressKnee: 1, jointStressAnkle: 3,
    lengthenedBias: 8, stretchMediatedPotential: 8 },

  { slug: "single-leg-cable-deadlift", name: "Single-Leg Cable Deadlift",
    movementPattern: "hip_hinge" as const, classification: "compound" as const,
    resistanceType: "cable" as const, difficulty: "intermediate" as const,
    unilateral: true, defaultBodyPosition: "standing" as const,
    fatigueCost: 4, technicalComplexity: 5, stabilityDemand: 8,
    jointStressSpine: 2, jointStressHip: 3, jointStressKnee: 1, jointStressAnkle: 3,
    lengthenedBias: 7, shortenedBias: 6, stretchMediatedPotential: 6 },

  { slug: "b-stance-romanian-deadlift", name: "B-Stance Romanian Deadlift",
    movementPattern: "hip_hinge" as const, classification: "compound" as const,
    resistanceType: "dumbbell" as const, difficulty: "intermediate" as const,
    unilateral: true, defaultBodyPosition: "split_stance" as const,
    fatigueCost: 5, technicalComplexity: 5, stabilityDemand: 6,
    jointStressSpine: 3, jointStressHip: 4, jointStressKnee: 1,
    lengthenedBias: 8, stretchMediatedPotential: 8 },

  // ── Kettlebell Hinge (ballistic & grind) ──────────────────

  { slug: "kettlebell-swing", name: "Kettlebell Swing",
    movementPattern: "hip_hinge" as const, classification: "power" as const,
    resistanceType: "kettlebell" as const, difficulty: "intermediate" as const,
    fatigueCost: 6, technicalComplexity: 6, stabilityDemand: 5,
    jointStressSpine: 4, jointStressHip: 5, jointStressKnee: 1,
    lengthenedBias: 5, shortenedBias: 6, stretchMediatedPotential: 4 },

  { slug: "single-arm-kettlebell-swing", name: "Single-Arm Kettlebell Swing",
    movementPattern: "hip_hinge" as const, classification: "power" as const,
    resistanceType: "kettlebell" as const, difficulty: "advanced" as const,
    unilateral: true, alternating: true,
    fatigueCost: 6, technicalComplexity: 7, stabilityDemand: 7,
    jointStressWrist: 2, jointStressSpine: 5, jointStressHip: 5, jointStressKnee: 1,
    lengthenedBias: 5, shortenedBias: 6, stretchMediatedPotential: 4 },

  { slug: "kettlebell-deadlift", name: "Kettlebell Deadlift",
    movementPattern: "hip_hinge" as const, classification: "compound" as const,
    resistanceType: "kettlebell" as const, difficulty: "beginner" as const,
    fatigueCost: 4, technicalComplexity: 3, stabilityDemand: 4,
    jointStressSpine: 3, jointStressHip: 4, jointStressKnee: 2,
    lengthenedBias: 5, stretchMediatedPotential: 4 },

  { slug: "kettlebell-sumo-deadlift", name: "Kettlebell Sumo Deadlift (Goblet Stance)",
    movementPattern: "hip_hinge" as const, classification: "compound" as const,
    resistanceType: "kettlebell" as const, difficulty: "beginner" as const,
    fatigueCost: 4, technicalComplexity: 3, stabilityDemand: 4,
    jointStressSpine: 2, jointStressHip: 4, jointStressKnee: 3,
    lengthenedBias: 5, stretchMediatedPotential: 4 },

  { slug: "double-kettlebell-deadlift", name: "Double Kettlebell Deadlift",
    movementPattern: "hip_hinge" as const, classification: "compound" as const,
    resistanceType: "kettlebell" as const, difficulty: "intermediate" as const,
    fatigueCost: 5, technicalComplexity: 4, stabilityDemand: 4,
    jointStressSpine: 4, jointStressHip: 5, jointStressKnee: 2,
    lengthenedBias: 5, stretchMediatedPotential: 4 },

  // ── Hip Extension / Glute Bridge ─────────────────────────

  { slug: "barbell-hip-thrust", name: "Barbell Hip Thrust",
    movementPattern: "hip_extension" as const, classification: "compound" as const,
    resistanceType: "barbell" as const, difficulty: "intermediate" as const,
    defaultBodyPosition: "hinge_position" as const,
    fatigueCost: 5, technicalComplexity: 5, stabilityDemand: 3,
    jointStressSpine: 3, jointStressHip: 5, jointStressKnee: 2,
    lengthenedBias: 4, shortenedBias: 8, stretchMediatedPotential: 4 },

  { slug: "glute-bridge", name: "Glute Bridge",
    movementPattern: "hip_extension" as const, classification: "compound" as const,
    resistanceType: "bodyweight" as const, difficulty: "beginner" as const,
    defaultBodyPosition: "lying_supine" as const,
    fatigueCost: 2, technicalComplexity: 1, stabilityDemand: 1,
    jointStressSpine: 1, jointStressHip: 3, jointStressKnee: 2,
    lengthenedBias: 2, shortenedBias: 8, stretchMediatedPotential: 2 },

  { slug: "barbell-glute-bridge", name: "Barbell Glute Bridge",
    movementPattern: "hip_extension" as const, classification: "compound" as const,
    resistanceType: "barbell" as const, difficulty: "beginner" as const,
    defaultBodyPosition: "lying_supine" as const,
    fatigueCost: 4, technicalComplexity: 3, stabilityDemand: 2,
    jointStressSpine: 2, jointStressHip: 4, jointStressKnee: 2,
    lengthenedBias: 3, shortenedBias: 8, stretchMediatedPotential: 3 },

  { slug: "single-leg-glute-bridge", name: "Single-Leg Glute Bridge",
    movementPattern: "hip_extension" as const, classification: "compound" as const,
    resistanceType: "bodyweight" as const, difficulty: "beginner" as const,
    unilateral: true, defaultBodyPosition: "lying_supine" as const,
    fatigueCost: 2, technicalComplexity: 3, stabilityDemand: 5,
    jointStressSpine: 1, jointStressHip: 4, jointStressKnee: 2,
    lengthenedBias: 2, shortenedBias: 8, stretchMediatedPotential: 2 },

  { slug: "single-leg-hip-thrust", name: "Single-Leg Hip Thrust",
    movementPattern: "hip_extension" as const, classification: "compound" as const,
    resistanceType: "dumbbell" as const, difficulty: "intermediate" as const,
    unilateral: true, defaultBodyPosition: "hinge_position" as const,
    fatigueCost: 4, technicalComplexity: 5, stabilityDemand: 6,
    jointStressSpine: 2, jointStressHip: 5, jointStressKnee: 2,
    lengthenedBias: 3, shortenedBias: 8, stretchMediatedPotential: 3 },

  { slug: "hip-thrust-machine-exercise", name: "Machine Hip Thrust",
    movementPattern: "hip_extension" as const, classification: "compound" as const,
    resistanceType: "machine" as const, difficulty: "beginner" as const,
    defaultBodyPosition: "hinge_position" as const,
    fatigueCost: 4, technicalComplexity: 2, stabilityDemand: 1,
    jointStressSpine: 1, jointStressHip: 5, jointStressKnee: 2,
    lengthenedBias: 4, shortenedBias: 8, stretchMediatedPotential: 4 },

  { slug: "cable-pull-through", name: "Cable Pull-Through",
    movementPattern: "hip_hinge" as const, classification: "compound" as const,
    resistanceType: "cable" as const, difficulty: "beginner" as const,
    defaultBodyPosition: "standing" as const,
    fatigueCost: 3, technicalComplexity: 3, stabilityDemand: 3,
    jointStressSpine: 2, jointStressHip: 4, jointStressKnee: 0,
    lengthenedBias: 6, shortenedBias: 6, stretchMediatedPotential: 5 },

  { slug: "45-degree-back-extension", name: "45° Back Extension",
    movementPattern: "hip_hinge" as const, classification: "compound" as const,
    resistanceType: "bodyweight" as const, difficulty: "beginner" as const,
    fatigueCost: 3, technicalComplexity: 2, stabilityDemand: 2,
    jointStressSpine: 3, jointStressHip: 4, jointStressKnee: 0,
    lengthenedBias: 7, stretchMediatedPotential: 6 },

  { slug: "weighted-back-extension", name: "Weighted 45° Back Extension",
    movementPattern: "hip_hinge" as const, classification: "compound" as const,
    resistanceType: "plate_loaded" as const, difficulty: "intermediate" as const,
    fatigueCost: 4, technicalComplexity: 3, stabilityDemand: 2,
    jointStressSpine: 4, jointStressHip: 5, jointStressKnee: 0,
    lengthenedBias: 7, stretchMediatedPotential: 7 },

  { slug: "reverse-hyperextension", name: "Reverse Hyperextension",
    movementPattern: "hip_extension" as const, classification: "compound" as const,
    resistanceType: "plate_loaded" as const, difficulty: "beginner" as const,
    defaultBodyPosition: "lying_prone" as const,
    fatigueCost: 3, technicalComplexity: 2, stabilityDemand: 2,
    jointStressSpine: 2, jointStressHip: 4, jointStressKnee: 0,
    lengthenedBias: 5, shortenedBias: 7, stretchMediatedPotential: 5 },

  { slug: "glute-ham-raise", name: "Glute-Ham Raise",
    movementPattern: "hip_extension" as const, classification: "compound" as const,
    resistanceType: "bodyweight" as const, difficulty: "advanced" as const,
    fatigueCost: 6, technicalComplexity: 7, stabilityDemand: 4,
    jointStressSpine: 2, jointStressHip: 4, jointStressKnee: 5,
    lengthenedBias: 7, stretchMediatedPotential: 7 },

  // ── Machine Hinge ──────────────────────────────────────────

  { slug: "machine-back-extension-exercise", name: "Machine Back Extension",
    movementPattern: "hip_hinge" as const, classification: "compound" as const,
    resistanceType: "machine" as const, difficulty: "beginner" as const,
    defaultBodyPosition: "seated" as const,
    fatigueCost: 3, technicalComplexity: 1, stabilityDemand: 1,
    jointStressSpine: 3, jointStressHip: 3, jointStressKnee: 0,
    lengthenedBias: 5, shortenedBias: 6, stretchMediatedPotential: 4 },

  { slug: "machine-hip-hinge", name: "Machine Hip Hinge",
    movementPattern: "hip_hinge" as const, classification: "compound" as const,
    resistanceType: "machine" as const, difficulty: "beginner" as const,
    defaultBodyPosition: "standing" as const,
    fatigueCost: 3, technicalComplexity: 2, stabilityDemand: 1,
    jointStressSpine: 2, jointStressHip: 4, jointStressKnee: 0,
    lengthenedBias: 6, shortenedBias: 6, stretchMediatedPotential: 5 },

  { slug: "smith-machine-romanian-deadlift", name: "Smith Machine Romanian Deadlift",
    movementPattern: "hip_hinge" as const, classification: "compound" as const,
    resistanceType: "smith_machine" as const, difficulty: "beginner" as const,
    fatigueCost: 5, technicalComplexity: 3, stabilityDemand: 2,
    jointStressWrist: 1, jointStressSpine: 4, jointStressHip: 5, jointStressKnee: 0,
    lengthenedBias: 7, stretchMediatedPotential: 6 },

  { slug: "belt-squat-good-morning", name: "Belt Squat Good Morning",
    movementPattern: "hip_hinge" as const, classification: "compound" as const,
    resistanceType: "plate_loaded" as const, difficulty: "intermediate" as const,
    fatigueCost: 4, technicalComplexity: 4, stabilityDemand: 3,
    jointStressSpine: 2, jointStressHip: 4, jointStressKnee: 0,
    lengthenedBias: 6, stretchMediatedPotential: 6 },

] as const;

// ─── MUSCLES ─────────────────────────────────────────────────
// [slug, muscle_group, role]

const MUSCLES: Array<[string, MuscleGroup, MuscleRole]> = [

  // Deadlift family: barbell
  ["conventional-deadlift",        "hamstrings",       "primary"],
  ["conventional-deadlift",        "glutes",           "secondary"],
  ["conventional-deadlift",        "spinal_erectors",  "secondary"],
  ["conventional-deadlift",        "adductors",        "stabilizer"],
  ["conventional-deadlift",        "forearms",         "stabilizer"],

  ["sumo-deadlift",                "glutes",           "primary"],
  ["sumo-deadlift",                "adductors",        "secondary"],
  ["sumo-deadlift",                "hamstrings",       "secondary"],
  ["sumo-deadlift",                "quadriceps",       "stabilizer"],
  ["sumo-deadlift",                "spinal_erectors",  "stabilizer"],

  ["deficit-deadlift",             "hamstrings",       "primary"],
  ["deficit-deadlift",             "glutes",           "secondary"],
  ["deficit-deadlift",             "spinal_erectors",  "secondary"],
  ["deficit-deadlift",             "quadriceps",       "stabilizer"],

  ["block-pull",                   "spinal_erectors",  "primary"],
  ["block-pull",                   "hamstrings",       "secondary"],
  ["block-pull",                   "glutes",           "secondary"],
  ["block-pull",                   "trapezius",        "stabilizer"],

  ["snatch-grip-deadlift",         "hamstrings",       "primary"],
  ["snatch-grip-deadlift",         "spinal_erectors",  "secondary"],
  ["snatch-grip-deadlift",         "glutes",           "secondary"],
  ["snatch-grip-deadlift",         "upper_back",       "stabilizer"],
  ["snatch-grip-deadlift",         "trapezius",        "stabilizer"],

  ["banded-deadlift",              "hamstrings",       "primary"],
  ["banded-deadlift",              "glutes",           "secondary"],
  ["banded-deadlift",              "spinal_erectors",  "secondary"],

  // Deadlift family: trap bar & dumbbell
  ["trap-bar-deadlift",            "quadriceps",       "primary"],
  ["trap-bar-deadlift",            "glutes",           "secondary"],
  ["trap-bar-deadlift",            "hamstrings",       "secondary"],
  ["trap-bar-deadlift",            "spinal_erectors",  "stabilizer"],

  ["trap-bar-deadlift-high-handle","quadriceps",       "primary"],
  ["trap-bar-deadlift-high-handle","glutes",           "secondary"],
  ["trap-bar-deadlift-high-handle","hamstrings",       "secondary"],

  ["dumbbell-deadlift",            "hamstrings",       "primary"],
  ["dumbbell-deadlift",            "glutes",           "secondary"],
  ["dumbbell-deadlift",            "quadriceps",       "stabilizer"],
  ["dumbbell-deadlift",            "spinal_erectors",  "stabilizer"],

  // RDL family
  ["barbell-romanian-deadlift",    "hamstrings",       "primary"],
  ["barbell-romanian-deadlift",    "glutes",           "secondary"],
  ["barbell-romanian-deadlift",    "spinal_erectors",  "secondary"],
  ["barbell-romanian-deadlift",    "adductors",        "stabilizer"],

  ["dumbbell-romanian-deadlift",   "hamstrings",       "primary"],
  ["dumbbell-romanian-deadlift",   "glutes",           "secondary"],
  ["dumbbell-romanian-deadlift",   "spinal_erectors",  "stabilizer"],

  ["kettlebell-romanian-deadlift", "hamstrings",       "primary"],
  ["kettlebell-romanian-deadlift", "glutes",           "secondary"],
  ["kettlebell-romanian-deadlift", "spinal_erectors",  "stabilizer"],

  ["deficit-romanian-deadlift",    "hamstrings",       "primary"],
  ["deficit-romanian-deadlift",    "glutes",           "secondary"],
  ["deficit-romanian-deadlift",    "spinal_erectors",  "secondary"],

  ["stiff-leg-deadlift",           "hamstrings",       "primary"],
  ["stiff-leg-deadlift",           "glutes",           "secondary"],
  ["stiff-leg-deadlift",           "spinal_erectors",  "secondary"],

  ["good-morning",                 "hamstrings",       "primary"],
  ["good-morning",                 "spinal_erectors",  "secondary"],
  ["good-morning",                 "glutes",           "secondary"],

  ["seated-good-morning",          "hamstrings",       "primary"],
  ["seated-good-morning",          "spinal_erectors",  "secondary"],
  ["seated-good-morning",          "glutes",           "secondary"],

  // Unilateral hinge
  ["single-leg-romanian-deadlift", "hamstrings",       "primary"],
  ["single-leg-romanian-deadlift", "glutes",           "secondary"],
  ["single-leg-romanian-deadlift", "abductors",        "stabilizer"],
  ["single-leg-romanian-deadlift", "spinal_erectors",  "stabilizer"],

  ["kettlebell-single-leg-deadlift","hamstrings",      "primary"],
  ["kettlebell-single-leg-deadlift","glutes",          "secondary"],
  ["kettlebell-single-leg-deadlift","abductors",       "stabilizer"],

  ["barbell-single-leg-romanian-deadlift","hamstrings","primary"],
  ["barbell-single-leg-romanian-deadlift","glutes",    "secondary"],
  ["barbell-single-leg-romanian-deadlift","abductors", "stabilizer"],
  ["barbell-single-leg-romanian-deadlift","spinal_erectors","stabilizer"],

  ["single-leg-cable-deadlift",    "hamstrings",       "primary"],
  ["single-leg-cable-deadlift",    "glutes",           "secondary"],
  ["single-leg-cable-deadlift",    "abductors",        "stabilizer"],

  ["b-stance-romanian-deadlift",   "hamstrings",       "primary"],
  ["b-stance-romanian-deadlift",   "glutes",           "secondary"],
  ["b-stance-romanian-deadlift",   "abductors",        "stabilizer"],

  // Kettlebell hinge
  ["kettlebell-swing",             "glutes",           "primary"],
  ["kettlebell-swing",             "hamstrings",       "secondary"],
  ["kettlebell-swing",             "spinal_erectors",  "stabilizer"],

  ["single-arm-kettlebell-swing",  "glutes",           "primary"],
  ["single-arm-kettlebell-swing",  "hamstrings",       "secondary"],
  ["single-arm-kettlebell-swing",  "obliques",         "stabilizer"],
  ["single-arm-kettlebell-swing",  "spinal_erectors",  "stabilizer"],

  ["kettlebell-deadlift",          "hamstrings",       "primary"],
  ["kettlebell-deadlift",          "glutes",           "secondary"],

  ["kettlebell-sumo-deadlift",     "glutes",           "primary"],
  ["kettlebell-sumo-deadlift",     "adductors",        "secondary"],
  ["kettlebell-sumo-deadlift",     "hamstrings",       "secondary"],

  ["double-kettlebell-deadlift",   "hamstrings",       "primary"],
  ["double-kettlebell-deadlift",   "glutes",           "secondary"],
  ["double-kettlebell-deadlift",   "spinal_erectors",  "stabilizer"],

  // Hip extension / glute bridge
  ["barbell-hip-thrust",           "glutes",           "primary"],
  ["barbell-hip-thrust",           "hamstrings",       "secondary"],
  ["barbell-hip-thrust",           "quadriceps",       "stabilizer"],

  ["glute-bridge",                 "glutes",           "primary"],
  ["glute-bridge",                 "hamstrings",       "secondary"],

  ["barbell-glute-bridge",         "glutes",           "primary"],
  ["barbell-glute-bridge",         "hamstrings",       "secondary"],
  ["barbell-glute-bridge",         "quadriceps",       "stabilizer"],

  ["single-leg-glute-bridge",      "glutes",           "primary"],
  ["single-leg-glute-bridge",      "hamstrings",       "secondary"],
  ["single-leg-glute-bridge",      "abductors",        "stabilizer"],

  ["single-leg-hip-thrust",        "glutes",           "primary"],
  ["single-leg-hip-thrust",        "hamstrings",       "secondary"],
  ["single-leg-hip-thrust",        "abductors",        "stabilizer"],

  ["hip-thrust-machine-exercise",  "glutes",           "primary"],
  ["hip-thrust-machine-exercise",  "hamstrings",       "secondary"],

  ["cable-pull-through",           "glutes",           "primary"],
  ["cable-pull-through",           "hamstrings",       "secondary"],
  ["cable-pull-through",           "spinal_erectors",  "stabilizer"],

  ["45-degree-back-extension",     "hamstrings",       "primary"],
  ["45-degree-back-extension",     "glutes",           "secondary"],
  ["45-degree-back-extension",     "spinal_erectors",  "secondary"],

  ["weighted-back-extension",      "hamstrings",       "primary"],
  ["weighted-back-extension",      "glutes",           "secondary"],
  ["weighted-back-extension",      "spinal_erectors",  "secondary"],

  ["reverse-hyperextension",       "glutes",           "primary"],
  ["reverse-hyperextension",       "hamstrings",       "secondary"],
  ["reverse-hyperextension",       "spinal_erectors",  "stabilizer"],

  ["glute-ham-raise",              "hamstrings",       "primary"],
  ["glute-ham-raise",              "glutes",           "secondary"],
  ["glute-ham-raise",              "calves",           "stabilizer"],

  // Machine hinge
  ["machine-back-extension-exercise","hamstrings",     "primary"],
  ["machine-back-extension-exercise","glutes",         "secondary"],
  ["machine-back-extension-exercise","spinal_erectors","secondary"],

  ["machine-hip-hinge",            "hamstrings",       "primary"],
  ["machine-hip-hinge",            "glutes",           "secondary"],

  ["smith-machine-romanian-deadlift","hamstrings",     "primary"],
  ["smith-machine-romanian-deadlift","glutes",         "secondary"],
  ["smith-machine-romanian-deadlift","spinal_erectors","stabilizer"],

  ["belt-squat-good-morning",      "hamstrings",       "primary"],
  ["belt-squat-good-morning",      "glutes",           "secondary"],
];

// ─── EQUIPMENT LINKS ─────────────────────────────────────────
// [exercise_slug, equipment_slug, requirement_type]

const EXERCISE_EQUIPMENT: Array<[string, string, EquipmentRequirement]> = [
  ["conventional-deadlift",             "barbell",              "required"],
  ["sumo-deadlift",                     "barbell",              "required"],
  ["deficit-deadlift",                  "barbell",              "required"],
  ["deficit-deadlift",                  "deficit-platform",     "required"],
  ["block-pull",                        "barbell",              "required"],
  ["block-pull",                        "power-rack",           "required"],
  ["snatch-grip-deadlift",              "barbell",              "required"],
  ["banded-deadlift",                   "barbell",              "required"],
  ["banded-deadlift",                   "resistance-band",      "required"],
  ["trap-bar-deadlift",                 "trap-bar",             "required"],
  ["trap-bar-deadlift-high-handle",     "trap-bar",             "required"],
  ["dumbbell-deadlift",                 "dumbbells",            "required"],
  ["barbell-romanian-deadlift",         "barbell",              "required"],
  ["dumbbell-romanian-deadlift",        "dumbbells",            "required"],
  ["kettlebell-romanian-deadlift",      "kettlebells",          "required"],
  ["deficit-romanian-deadlift",         "barbell",              "required"],
  ["deficit-romanian-deadlift",         "deficit-platform",     "required"],
  ["stiff-leg-deadlift",                "barbell",              "required"],
  ["good-morning",                      "barbell",              "required"],
  ["good-morning",                      "power-rack",           "required"],
  ["seated-good-morning",               "barbell",              "required"],
  ["seated-good-morning",               "flat-bench",           "required"],
  ["single-leg-romanian-deadlift",      "dumbbells",            "required"],
  ["kettlebell-single-leg-deadlift",    "kettlebells",          "required"],
  ["barbell-single-leg-romanian-deadlift","barbell",            "required"],
  ["single-leg-cable-deadlift",         "cable-station",        "required"],
  ["b-stance-romanian-deadlift",        "dumbbells",            "required"],
  ["kettlebell-swing",                  "kettlebells",          "required"],
  ["single-arm-kettlebell-swing",       "kettlebells",          "required"],
  ["kettlebell-deadlift",               "kettlebells",          "required"],
  ["kettlebell-sumo-deadlift",          "kettlebells",          "required"],
  ["double-kettlebell-deadlift",        "kettlebells",          "required"],
  ["barbell-hip-thrust",                "barbell",              "required"],
  ["barbell-hip-thrust",                "flat-bench",           "required"],
  ["barbell-glute-bridge",              "barbell",              "required"],
  ["single-leg-hip-thrust",             "dumbbells",            "required"],
  ["single-leg-hip-thrust",             "flat-bench",           "required"],
  ["hip-thrust-machine-exercise",       "hip-thrust-machine",   "required"],
  ["cable-pull-through",                "cable-station",        "required"],
  ["45-degree-back-extension",          "machine-back-extension","required"],
  ["weighted-back-extension",           "machine-back-extension","required"],
  ["reverse-hyperextension",            "reverse-hyper-machine","required"],
  ["glute-ham-raise",                   "glute-ham-developer",  "required"],
  ["machine-back-extension-exercise",   "machine-back-extension","required"],
  ["machine-hip-hinge",                 "cable-station",        "required"],
  ["smith-machine-romanian-deadlift",   "smith-machine",        "required"],
  ["belt-squat-good-morning",           "belt-squat-machine",   "required"],
];

// ─── COACHING CUES ───────────────────────────────────────────
// [slug, cue_type, content, order_index]

const CUES: Array<[string, ExerciseCueType, string, number]> = [

  ["conventional-deadlift", "setup",
    "Bar over mid-foot, shins nearly touching the bar. Grip just outside the knees, hips set higher than the shoulders won't drop but lower than a squat.",
    1],
  ["conventional-deadlift", "execution",
    "Drive the floor away through the legs while keeping the bar in contact with the shins and thighs the entire pull. Finish by driving the hips through, not by leaning back.",
    2],
  ["conventional-deadlift", "breathing",
    "Take a full breath into the belly and brace hard before unracking tension off the floor. Hold the brace through the entire rep.",
    3],
  ["conventional-deadlift", "common_error",
    "Rounding the lower back off the floor: increases disc shear force significantly and is the most common cause of deadlift-related low back strain. Reset the brace and hip height before pulling.",
    4],

  ["sumo-deadlift", "setup",
    "Wide stance with toes turned out roughly 30–45°. Grip inside the knees, shins vertical, hips lower and more forward than a conventional pull.",
    1],
  ["sumo-deadlift", "execution",
    "Drive the knees out in line with the toes as you pull, keeping the torso more upright than a conventional deadlift. The shorter pulling distance rewards a vertical bar path.",
    2],

  ["trap-bar-deadlift", "setup",
    "Step inside the frame, mid-foot centered between the handles. Hip hinge to grip the handles with a squat-like shin angle.",
    1],
  ["trap-bar-deadlift", "execution",
    "Drive through the floor with a more upright torso than a barbell deadlift — the centered load reduces spinal shear and allows more quad contribution.",
    2],

  ["barbell-romanian-deadlift", "setup",
    "Start from the top with the bar at hip height, soft knee bend that stays fixed throughout the set.",
    1],
  ["barbell-romanian-deadlift", "execution",
    "Push the hips straight back while keeping the bar dragging against the thighs. Stop the descent once you feel a firm hamstring stretch — typically mid-shin — then drive the hips forward to stand.",
    2],
  ["barbell-romanian-deadlift", "mental_cue",
    "Hips back, bar on the legs.",
    3],
  ["barbell-romanian-deadlift", "common_error",
    "Bending the knees further during the descent: turns the RDL into a squat pattern and removes tension from the hamstrings at the stretched position. Keep the knee angle locked after the first inch.",
    4],

  ["dumbbell-romanian-deadlift", "setup",
    "Hold dumbbells in front of the thighs with a soft, fixed knee bend and neutral spine.",
    1],
  ["dumbbell-romanian-deadlift", "execution",
    "Hinge the hips back, letting the dumbbells travel down the front of the legs. Reverse the motion once a firm hamstring stretch is reached.",
    2],

  ["kettlebell-romanian-deadlift", "setup",
    "Hold a kettlebell (or two) at arm's length in front of the thighs, soft fixed knee bend.",
    1],
  ["kettlebell-romanian-deadlift", "execution",
    "Hinge the hips back while keeping the kettlebell close to the legs throughout the descent and ascent.",
    2],

  ["single-leg-romanian-deadlift", "setup",
    "Stand on one leg with a soft bend in the standing knee, dumbbell in the opposite hand or both hands.",
    1],
  ["single-leg-romanian-deadlift", "execution",
    "Hinge forward while the free leg extends straight back for counterbalance, keeping the hips square to the floor throughout. Reverse once the torso and free leg are roughly parallel to the ground.",
    2],
  ["single-leg-romanian-deadlift", "common_error",
    "Hips rotating open on the standing leg side: reduces glute and hamstring tension and increases lateral spine loading. Keep both hip points facing the floor throughout the rep.",
    3],

  ["kettlebell-swing", "setup",
    "Stand with feet slightly wider than shoulder-width, kettlebell on the floor a foot or so in front. Hike the kettlebell back between the legs to start.",
    1],
  ["kettlebell-swing", "execution",
    "Snap the hips forward explosively to project the kettlebell to roughly chest height, letting the arms act as a rope rather than lifting with the shoulders. Let the hip snap decelerate the bell on the way down into the next hike.",
    2],
  ["kettlebell-swing", "safety",
    "Never let the lower back round to catch the kettlebell at the bottom of the hike — hip hinge depth should be limited by hamstring flexibility, not lumbar flexion.",
    3],

  ["barbell-hip-thrust", "setup",
    "Upper back braced against a bench, barbell padded and positioned across the hip crease. Feet planted roughly shin-vertical at the top position.",
    1],
  ["barbell-hip-thrust", "execution",
    "Drive through the heels to extend the hips fully, squeezing the glutes hard at lockout without hyperextending the lower back. Lower under control without resting the bar on the floor between reps.",
    2],
  ["barbell-hip-thrust", "common_error",
    "Hyperextending the lower back at the top instead of stopping at full hip extension: shifts load off the glutes onto the lumbar spine. Stop the movement when the torso and thighs form a straight line.",
    3],

  ["glute-bridge", "setup",
    "Lie supine with knees bent, feet flat roughly hip-width apart, close enough to touch fingertips to heels.",
    1],
  ["glute-bridge", "execution",
    "Drive through the heels to lift the hips until the body forms a straight line from shoulders to knees, squeezing the glutes at the top.",
    2],

  ["single-leg-hip-thrust", "setup",
    "Set up as a standard hip thrust, then extend one leg straight out in front at the same height as the bent knee.",
    1],
  ["single-leg-hip-thrust", "execution",
    "Drive through the planted heel only, keeping the hips level and avoiding rotation toward the working side.",
    2],

  ["cable-pull-through", "setup",
    "Face away from a low cable pulley with a rope attachment between the legs, feet shoulder-width, soft knee bend.",
    1],
  ["cable-pull-through", "execution",
    "Hinge forward until a firm hamstring stretch is felt, then drive the hips forward to standing, finishing with a glute squeeze rather than pulling with the arms.",
    2],

  ["45-degree-back-extension", "setup",
    "Hips supported on the pad with the upper thighs braced against the front support, ankles secured. Cross the arms over the chest or hold a plate.",
    1],
  ["45-degree-back-extension", "execution",
    "Lower under control by hinging at the hips until a firm hamstring stretch is reached, then extend back to a straight line without hyperextending at the top.",
    2],

  ["glute-ham-raise", "setup",
    "Ankles secured against the foot plate, knees on the pad. Start in the upright position with a rigid torso.",
    1],
  ["glute-ham-raise", "execution",
    "Lower the torso forward under control by extending at the knee while resisting with the hamstrings, then pull back to the start using a combination of hip and knee extension.",
    2],
  ["glute-ham-raise", "common_error",
    "Initiating the descent from the hips instead of the knees: turns the exercise into a back extension and removes the hamstring-specific eccentric demand that defines the movement.",
    3],
];

// ─── EXERCISE RELATIONS ────────────────────────────────────────
// [source_slug, target_slug, relation_type, notes]

const RELATIONS: Array<[string, string, ExerciseRelationType, string]> = [

  // Romanian deadlift family
  ["barbell-romanian-deadlift", "cable-pull-through", "lower_joint_stress",
    "Cable pull-through removes axial spinal loading from the barbell while preserving the hip-hinge hamstring stretch — appropriate for athletes managing low back sensitivity."],
  ["barbell-romanian-deadlift", "45-degree-back-extension", "lower_joint_stress",
    "The 45° back extension removes grip and axial loading demands while preserving the same hip-hinge hamstring stretch pattern."],
  ["barbell-romanian-deadlift", "dumbbell-romanian-deadlift", "regression",
    "Dumbbell RDL allows finer load increments and removes the barbell's fixed bar path — a standard regression for athletes new to the hinge pattern."],
  ["dumbbell-romanian-deadlift", "barbell-romanian-deadlift", "progression",
    "Barbell RDL is a progression once dumbbell load becomes limited by grip or dumbbell size availability."],
  ["barbell-romanian-deadlift", "kettlebell-romanian-deadlift", "regression",
    "Kettlebell RDL offers a lower, more forgiving starting position and simpler setup for beginners learning the hinge pattern."],
  ["barbell-romanian-deadlift", "deficit-romanian-deadlift", "progression",
    "Standing on a deficit platform increases the range of motion and the stretch placed on the hamstrings at the bottom position."],
  ["deficit-romanian-deadlift", "barbell-romanian-deadlift", "regression",
    "Removing the deficit reduces the bottom-range demand for athletes not yet ready for the extended stretch position."],
  ["barbell-romanian-deadlift", "single-leg-romanian-deadlift", "contralateral",
    "Single-leg RDL trains each side independently and adds a significant balance and hip-stability demand absent from the bilateral pattern."],
  ["single-leg-romanian-deadlift", "b-stance-romanian-deadlift", "regression",
    "The rear-foot-elevated B-stance reduces balance demand while preserving most of the unilateral loading emphasis, useful for athletes not yet stable in a true single-leg stance."],
  ["b-stance-romanian-deadlift", "single-leg-romanian-deadlift", "progression",
    "True single-leg RDL is a progression once the B-stance variation is mastered and balance demand can be increased."],

  // Deadlift family
  ["conventional-deadlift", "trap-bar-deadlift", "lower_joint_stress",
    "The centered load path of the trap bar reduces spinal shear relative to a conventional barbell pull, while shifting some emphasis toward the quadriceps."],
  ["conventional-deadlift", "block-pull", "regression",
    "Pulling from blocks or pins shortens the range of motion, reducing technical demand and cumulative fatigue for the same top-end load."],
  ["block-pull", "conventional-deadlift", "progression",
    "Full-range conventional deadlift is a progression once partial-range pulling strength and positioning are established."],
  ["conventional-deadlift", "deficit-deadlift", "progression",
    "Pulling from a deficit increases the range of motion and bottom-position demand beyond a standard conventional deadlift."],
  ["deficit-deadlift", "conventional-deadlift", "regression",
    "Removing the deficit reduces the bottom-range demand for athletes not yet ready for the extended pull distance."],
  ["conventional-deadlift", "sumo-deadlift", "same_pattern",
    "Wider stance and more upright torso shift emphasis toward the glutes and adductors and shorten the pulling distance."],
  ["conventional-deadlift", "dumbbell-deadlift", "regression",
    "Dumbbell deadlift removes the technical demand of a barbell setup and grip width, suitable as an entry point to the hinge-pull pattern."],

  // Hip thrust / glute bridge family
  ["barbell-hip-thrust", "glute-bridge", "regression",
    "Bodyweight glute bridge removes external load entirely, serving as the foundational regression for athletes learning to isolate hip extension without lumbar compensation."],
  ["glute-bridge", "barbell-hip-thrust", "progression",
    "Barbell hip thrust is a progression once bodyweight hip extension can be performed with a full, controlled squeeze at lockout."],
  ["barbell-hip-thrust", "hip-thrust-machine-exercise", "lower_joint_stress",
    "The guided machine path removes the barbell setup and rolling-bar discomfort while preserving the same hip-extension loading pattern."],
  ["barbell-hip-thrust", "single-leg-hip-thrust", "contralateral",
    "Single-leg hip thrust trains each side independently and addresses left-right glute strength asymmetries not visible in the bilateral pattern."],
  ["glute-bridge", "single-leg-glute-bridge", "contralateral",
    "Single-leg glute bridge increases the per-side demand without requiring external load."],

  // Good morning / back extension family
  ["good-morning", "45-degree-back-extension", "lower_joint_stress",
    "The supported back extension removes standing balance and axial bar loading while preserving the same hip-hinge hamstring and spinal-erector stimulus."],
  ["good-morning", "seated-good-morning", "same_pattern",
    "The seated variation removes the hamstring's contribution to the hip hinge, isolating the lower back and gluteal extension more directly."],
  ["45-degree-back-extension", "weighted-back-extension", "progression",
    "Adding external load via plate or barbell is a progression once bodyweight back extensions can be performed for high reps with full control."],
  ["weighted-back-extension", "45-degree-back-extension", "regression",
    "Removing external load is the standard regression once volume or fatigue management calls for reduced spinal loading."],
  ["45-degree-back-extension", "glute-ham-raise", "progression",
    "The glute-ham raise adds a knee-flexion component driven by the hamstrings, representing a significant technical and strength progression beyond a standard back extension."],

  // Kettlebell hinge family
  ["kettlebell-swing", "single-arm-kettlebell-swing", "progression",
    "The single-arm variation adds a significant anti-rotation core demand and grip challenge beyond the two-handed swing."],
  ["single-arm-kettlebell-swing", "kettlebell-swing", "regression",
    "The two-handed swing removes the rotational stabilization demand, appropriate when re-grooving the basic hip-snap pattern."],
  ["kettlebell-swing", "kettlebell-deadlift", "regression",
    "The kettlebell deadlift removes the ballistic hip-snap component entirely, serving as the strength-building regression before reintroducing the swing's power demand."],
];

// ─── MAIN ─────────────────────────────────────────────────────

async function main() {
  console.log("\nCatalyst OS — Exercise Library Seed 004: Hip Hinge");
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
    "004 — Hip Hinge (41 exercises)",
  );

  console.log("─────────────────────────────────────────────────────────");
  console.log("Seed 004 complete.\n");
  await sql.end();
}

main().catch(async (err) => {
  console.error("\nSeed failed:", err instanceof Error ? err.message : err);
  await sql.end();
  process.exit(1);
});
