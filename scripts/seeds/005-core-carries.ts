#!/usr/bin/env npx tsx
// ─────────────────────────────────────────────────────────────
// Catalyst OS — Exercise Library Seed 005: Core & Carries
//
// Usage:
//   set -a && source .env.local && set +a && npx tsx scripts/seeds/005-core-carries.ts
//
// Covers:
//   Anti-rotation — pallof press, ab wheel, dead bug, bird dog
//   Rotation — cable woodchop, russian twist, med ball throw, landmine
//   Hip flexion — hanging raises, captain's chair, v-up, toes-to-bar
//   Isometric hold — plank, side plank, hollow hold, L-sit
//   Loaded carries — farmer's, suitcase, overhead, front rack, sandbag
//
// Count: 34 exercises
// Spec: docs/exercise-intelligence-spec.md
// ─────────────────────────────────────────────────────────────

import { SHARED_EQUIPMENT, db, sql, seedEquipment, seedExercises } from "./_shared";
import type { MuscleGroup, MuscleRole, EquipmentRequirement, ExerciseCueType, ExerciseRelationType } from "./_shared";

// ─── LOCAL EQUIPMENT ─────────────────────────────────────────
// Additions beyond SHARED_EQUIPMENT needed for this file.

const EQUIPMENT = [
  { slug: "stability-ball",  name: "Stability Ball",             category: "accessories" },
  { slug: "captains-chair",  name: "Captain's Chair",            category: "accessories" },
  { slug: "weight-plate",    name: "Weight Plate",                category: "free_weights" },
  { slug: "sandbag",         name: "Sandbag",                     category: "free_weights" },
] as const;

// ─── EXERCISES ───────────────────────────────────────────────

const EXERCISES = [

  // ── Anti-Rotation ──────────────────────────────────────────

  { slug: "pallof-press", name: "Pallof Press",
    alternateNames: ["Anti-Rotation Press"] as const,
    movementPattern: "anti_rotation" as const, classification: "isolation" as const,
    resistanceType: "cable" as const, difficulty: "beginner" as const,
    defaultBodyPosition: "standing" as const,
    fatigueCost: 3, technicalComplexity: 3, stabilityDemand: 4,
    jointStressShoulder: 2, jointStressSpine: 2,
    lengthenedBias: 1, shortenedBias: 3, stretchMediatedPotential: 1 },

  { slug: "band-pallof-press", name: "Band Pallof Press",
    alternateNames: ["Band Anti-Rotation Press"] as const,
    movementPattern: "anti_rotation" as const, classification: "isolation" as const,
    resistanceType: "band" as const, difficulty: "beginner" as const,
    defaultBodyPosition: "standing" as const,
    fatigueCost: 2, technicalComplexity: 2, stabilityDemand: 4,
    jointStressShoulder: 2, jointStressSpine: 2,
    lengthenedBias: 1, shortenedBias: 3, stretchMediatedPotential: 1 },

  { slug: "half-kneeling-pallof-press", name: "Half-Kneeling Pallof Press",
    alternateNames: ["Half-Kneeling Anti-Rotation Press"] as const,
    movementPattern: "anti_rotation" as const, classification: "isolation" as const,
    resistanceType: "cable" as const, difficulty: "intermediate" as const,
    defaultBodyPosition: "kneeling" as const,
    fatigueCost: 3, technicalComplexity: 4, stabilityDemand: 5,
    jointStressShoulder: 2, jointStressSpine: 2, jointStressHip: 2,
    lengthenedBias: 1, shortenedBias: 3, stretchMediatedPotential: 1 },

  { slug: "ab-wheel-rollout", name: "Ab Wheel Rollout",
    alternateNames: ["Ab Rollout", "Wheel Rollout"] as const,
    movementPattern: "anti_rotation" as const, classification: "isolation" as const,
    resistanceType: "bodyweight" as const, difficulty: "advanced" as const,
    defaultBodyPosition: "kneeling" as const,
    fatigueCost: 4, technicalComplexity: 6, stabilityDemand: 6,
    jointStressShoulder: 4, jointStressWrist: 3, jointStressSpine: 5,
    lengthenedBias: 6, shortenedBias: 3, stretchMediatedPotential: 5 },

  { slug: "stir-the-pot", name: "Stir the Pot",
    alternateNames: ["Stability Ball Stir"] as const,
    movementPattern: "anti_rotation" as const, classification: "isolation" as const,
    resistanceType: "bodyweight" as const, difficulty: "intermediate" as const,
    defaultBodyPosition: "quadruped" as const,
    fatigueCost: 3, technicalComplexity: 5, stabilityDemand: 8,
    jointStressShoulder: 3, jointStressWrist: 2, jointStressSpine: 3,
    lengthenedBias: 1, shortenedBias: 3, stretchMediatedPotential: 1 },

  { slug: "dead-bug", name: "Dead Bug",
    movementPattern: "anti_rotation" as const, classification: "isolation" as const,
    resistanceType: "bodyweight" as const, difficulty: "beginner" as const,
    defaultBodyPosition: "lying_supine" as const,
    fatigueCost: 2, technicalComplexity: 3, stabilityDemand: 4,
    jointStressSpine: 2,
    lengthenedBias: 1, shortenedBias: 3, stretchMediatedPotential: 1 },

  { slug: "bird-dog", name: "Bird Dog",
    alternateNames: ["Quadruped Opposite Arm/Leg Raise"] as const,
    movementPattern: "anti_rotation" as const, classification: "isolation" as const,
    resistanceType: "bodyweight" as const, difficulty: "beginner" as const,
    defaultBodyPosition: "quadruped" as const,
    fatigueCost: 2, technicalComplexity: 3, stabilityDemand: 5,
    jointStressSpine: 2,
    lengthenedBias: 1, shortenedBias: 3, stretchMediatedPotential: 1 },

  // ── Rotation ────────────────────────────────────────────────

  { slug: "cable-woodchop-high-to-low", name: "Cable Woodchop (High to Low)",
    alternateNames: ["High-to-Low Woodchop"] as const,
    movementPattern: "rotation" as const, classification: "isolation" as const,
    resistanceType: "cable" as const, difficulty: "beginner" as const,
    defaultBodyPosition: "standing" as const,
    fatigueCost: 3, technicalComplexity: 4, stabilityDemand: 4,
    jointStressShoulder: 2, jointStressSpine: 3,
    lengthenedBias: 2, shortenedBias: 6, stretchMediatedPotential: 2 },

  { slug: "cable-woodchop-low-to-high", name: "Cable Woodchop (Low to High)",
    alternateNames: ["Low-to-High Woodchop"] as const,
    movementPattern: "rotation" as const, classification: "isolation" as const,
    resistanceType: "cable" as const, difficulty: "beginner" as const,
    defaultBodyPosition: "standing" as const,
    fatigueCost: 3, technicalComplexity: 4, stabilityDemand: 4,
    jointStressShoulder: 2, jointStressSpine: 3,
    lengthenedBias: 2, shortenedBias: 6, stretchMediatedPotential: 2 },

  { slug: "russian-twist", name: "Russian Twist",
    alternateNames: ["Med Ball Twist"] as const,
    movementPattern: "rotation" as const, classification: "isolation" as const,
    resistanceType: "medicine_ball" as const, difficulty: "beginner" as const,
    defaultBodyPosition: "seated" as const,
    fatigueCost: 2, technicalComplexity: 2, stabilityDemand: 4,
    jointStressSpine: 3,
    lengthenedBias: 2, shortenedBias: 6, stretchMediatedPotential: 2 },

  { slug: "medicine-ball-rotational-throw", name: "Medicine Ball Rotational Throw",
    alternateNames: ["Rotational Med Ball Throw", "Side Throw"] as const,
    movementPattern: "rotation" as const, classification: "power" as const,
    resistanceType: "medicine_ball" as const, difficulty: "intermediate" as const,
    defaultBodyPosition: "standing" as const,
    fatigueCost: 5, technicalComplexity: 5, stabilityDemand: 6,
    jointStressShoulder: 3, jointStressSpine: 4,
    lengthenedBias: 2, shortenedBias: 6, stretchMediatedPotential: 2 },

  { slug: "landmine-rotation", name: "Landmine Rotation",
    alternateNames: ["Landmine 180", "Rainmaker"] as const,
    movementPattern: "rotation" as const, classification: "isolation" as const,
    resistanceType: "landmine" as const, difficulty: "intermediate" as const,
    defaultBodyPosition: "standing" as const,
    fatigueCost: 4, technicalComplexity: 5, stabilityDemand: 6,
    jointStressShoulder: 3, jointStressSpine: 4,
    lengthenedBias: 2, shortenedBias: 6, stretchMediatedPotential: 2 },

  { slug: "standing-cable-rotation", name: "Standing Cable Rotation",
    alternateNames: ["Standing Trunk Rotation"] as const,
    movementPattern: "rotation" as const, classification: "isolation" as const,
    resistanceType: "cable" as const, difficulty: "beginner" as const,
    defaultBodyPosition: "standing" as const,
    fatigueCost: 3, technicalComplexity: 4, stabilityDemand: 5,
    jointStressShoulder: 2, jointStressSpine: 3,
    lengthenedBias: 2, shortenedBias: 6, stretchMediatedPotential: 2 },

  // ── Hip Flexion ────────────────────────────────────────────

  { slug: "hanging-leg-raise", name: "Hanging Leg Raise",
    alternateNames: ["Hanging Straight Leg Raise", "HLR"] as const,
    movementPattern: "hip_flexion" as const, classification: "isolation" as const,
    resistanceType: "bodyweight" as const, difficulty: "advanced" as const,
    defaultBodyPosition: "hanging" as const,
    fatigueCost: 4, technicalComplexity: 6, stabilityDemand: 6,
    jointStressShoulder: 4, jointStressWrist: 2, jointStressSpine: 1, jointStressHip: 3,
    lengthenedBias: 2, shortenedBias: 8, stretchMediatedPotential: 2 },

  { slug: "hanging-knee-raise", name: "Hanging Knee Raise",
    alternateNames: ["Hanging Knee-Up"] as const,
    movementPattern: "hip_flexion" as const, classification: "isolation" as const,
    resistanceType: "bodyweight" as const, difficulty: "intermediate" as const,
    defaultBodyPosition: "hanging" as const,
    fatigueCost: 3, technicalComplexity: 4, stabilityDemand: 5,
    jointStressShoulder: 3, jointStressWrist: 2, jointStressHip: 3,
    lengthenedBias: 2, shortenedBias: 7, stretchMediatedPotential: 2 },

  { slug: "captains-chair-leg-raise", name: "Captain's Chair Leg Raise",
    alternateNames: ["Roman Chair Leg Raise"] as const,
    movementPattern: "hip_flexion" as const, classification: "isolation" as const,
    resistanceType: "bodyweight" as const, difficulty: "intermediate" as const,
    defaultBodyPosition: "standing" as const,
    fatigueCost: 3, technicalComplexity: 4, stabilityDemand: 4,
    jointStressShoulder: 2, jointStressHip: 3,
    lengthenedBias: 2, shortenedBias: 7, stretchMediatedPotential: 2 },

  { slug: "lying-leg-raise", name: "Lying Leg Raise",
    alternateNames: ["Floor Leg Raise"] as const,
    movementPattern: "hip_flexion" as const, classification: "isolation" as const,
    resistanceType: "bodyweight" as const, difficulty: "beginner" as const,
    defaultBodyPosition: "lying_supine" as const,
    fatigueCost: 2, technicalComplexity: 3, stabilityDemand: 3,
    jointStressSpine: 2, jointStressHip: 3,
    lengthenedBias: 2, shortenedBias: 7, stretchMediatedPotential: 2 },

  { slug: "v-up", name: "V-Up",
    alternateNames: ["Jackknife"] as const,
    movementPattern: "hip_flexion" as const, classification: "compound" as const,
    resistanceType: "bodyweight" as const, difficulty: "intermediate" as const,
    defaultBodyPosition: "lying_supine" as const,
    fatigueCost: 3, technicalComplexity: 5, stabilityDemand: 5,
    jointStressSpine: 2, jointStressHip: 4,
    lengthenedBias: 2, shortenedBias: 7, stretchMediatedPotential: 2 },

  { slug: "reverse-crunch", name: "Reverse Crunch",
    alternateNames: ["Reverse Sit-Up"] as const,
    movementPattern: "hip_flexion" as const, classification: "isolation" as const,
    resistanceType: "bodyweight" as const, difficulty: "beginner" as const,
    defaultBodyPosition: "lying_supine" as const,
    fatigueCost: 2, technicalComplexity: 3, stabilityDemand: 3,
    jointStressSpine: 2, jointStressHip: 3,
    lengthenedBias: 2, shortenedBias: 7, stretchMediatedPotential: 2 },

  { slug: "toes-to-bar", name: "Toes-to-Bar",
    alternateNames: ["T2B"] as const,
    movementPattern: "hip_flexion" as const, classification: "skill" as const,
    resistanceType: "bodyweight" as const, difficulty: "advanced" as const,
    defaultBodyPosition: "hanging" as const,
    fatigueCost: 5, technicalComplexity: 8, stabilityDemand: 7,
    jointStressShoulder: 4, jointStressWrist: 3, jointStressSpine: 2, jointStressHip: 4,
    lengthenedBias: 2, shortenedBias: 8, stretchMediatedPotential: 2 },

  { slug: "mountain-climber", name: "Mountain Climber",
    alternateNames: ["Running Plank"] as const,
    movementPattern: "hip_flexion" as const, classification: "compound" as const,
    resistanceType: "bodyweight" as const, difficulty: "beginner" as const,
    defaultBodyPosition: "lying_prone" as const,
    fatigueCost: 4, technicalComplexity: 3, stabilityDemand: 5,
    jointStressShoulder: 3, jointStressWrist: 2, jointStressHip: 2,
    lengthenedBias: 1, shortenedBias: 4, stretchMediatedPotential: 1 },

  // ── Isometric Hold ────────────────────────────────────────

  { slug: "plank", name: "Plank",
    alternateNames: ["Forearm Plank"] as const,
    movementPattern: "iso_hold" as const, classification: "isolation" as const,
    resistanceType: "bodyweight" as const, difficulty: "beginner" as const,
    isTimeBased: true, defaultBodyPosition: "lying_prone" as const,
    fatigueCost: 2, technicalComplexity: 2, stabilityDemand: 4,
    jointStressShoulder: 2, jointStressWrist: 2, jointStressSpine: 2,
    lengthenedBias: 0, shortenedBias: 5, stretchMediatedPotential: 0 },

  { slug: "side-plank", name: "Side Plank",
    alternateNames: ["Side Bridge"] as const,
    movementPattern: "iso_hold" as const, classification: "isolation" as const,
    resistanceType: "bodyweight" as const, difficulty: "beginner" as const,
    isTimeBased: true, unilateral: true,
    fatigueCost: 2, technicalComplexity: 3, stabilityDemand: 5,
    jointStressShoulder: 3, jointStressWrist: 2, jointStressSpine: 3,
    lengthenedBias: 0, shortenedBias: 5, stretchMediatedPotential: 0 },

  { slug: "hollow-hold", name: "Hollow Hold",
    alternateNames: ["Hollow Body Hold"] as const,
    movementPattern: "iso_hold" as const, classification: "isolation" as const,
    resistanceType: "bodyweight" as const, difficulty: "intermediate" as const,
    isTimeBased: true, defaultBodyPosition: "lying_supine" as const,
    fatigueCost: 3, technicalComplexity: 5, stabilityDemand: 5,
    jointStressSpine: 2, jointStressHip: 2,
    lengthenedBias: 1, shortenedBias: 6, stretchMediatedPotential: 1 },

  { slug: "weighted-plank", name: "Weighted Plank",
    alternateNames: ["Loaded Plank"] as const,
    movementPattern: "iso_hold" as const, classification: "isolation" as const,
    resistanceType: "plate_loaded" as const, difficulty: "intermediate" as const,
    isTimeBased: true, defaultBodyPosition: "lying_prone" as const,
    fatigueCost: 3, technicalComplexity: 3, stabilityDemand: 4,
    jointStressShoulder: 3, jointStressWrist: 2, jointStressSpine: 2,
    lengthenedBias: 0, shortenedBias: 5, stretchMediatedPotential: 0 },

  { slug: "rkc-plank", name: "RKC Plank",
    alternateNames: ["Russian Kettlebell Challenge Plank"] as const,
    movementPattern: "iso_hold" as const, classification: "isolation" as const,
    resistanceType: "bodyweight" as const, difficulty: "advanced" as const,
    isTimeBased: true, defaultBodyPosition: "lying_prone" as const,
    fatigueCost: 4, technicalComplexity: 5, stabilityDemand: 5,
    jointStressShoulder: 3, jointStressWrist: 3, jointStressSpine: 3,
    lengthenedBias: 0, shortenedBias: 6, stretchMediatedPotential: 0 },

  { slug: "l-sit", name: "L-Sit",
    alternateNames: ["L-Sit Hold"] as const,
    movementPattern: "iso_hold" as const, classification: "skill" as const,
    resistanceType: "bodyweight" as const, difficulty: "advanced" as const,
    isTimeBased: true, defaultBodyPosition: "seated" as const,
    fatigueCost: 4, technicalComplexity: 8, stabilityDemand: 6,
    jointStressShoulder: 4, jointStressWrist: 4, jointStressHip: 3,
    lengthenedBias: 2, shortenedBias: 7, stretchMediatedPotential: 2 },

  // ── Loaded Carries ────────────────────────────────────────

  { slug: "farmers-carry", name: "Farmer's Carry",
    alternateNames: ["Farmer's Walk"] as const,
    movementPattern: "carry" as const, classification: "compound" as const,
    resistanceType: "dumbbell" as const, difficulty: "beginner" as const,
    isDistanceBased: true, defaultBodyPosition: "standing" as const,
    fatigueCost: 5, technicalComplexity: 3, stabilityDemand: 5,
    jointStressShoulder: 3, jointStressWrist: 3, jointStressSpine: 3,
    lengthenedBias: 1, shortenedBias: 2, stretchMediatedPotential: 1 },

  { slug: "suitcase-carry", name: "Suitcase Carry",
    alternateNames: ["Offset Carry"] as const,
    movementPattern: "carry" as const, classification: "compound" as const,
    resistanceType: "dumbbell" as const, difficulty: "intermediate" as const,
    unilateral: true, isDistanceBased: true, defaultBodyPosition: "standing" as const,
    fatigueCost: 5, technicalComplexity: 4, stabilityDemand: 7,
    jointStressShoulder: 3, jointStressWrist: 3, jointStressSpine: 4,
    lengthenedBias: 1, shortenedBias: 2, stretchMediatedPotential: 1 },

  { slug: "overhead-carry", name: "Overhead Carry",
    alternateNames: ["Waiter's Carry"] as const,
    movementPattern: "carry" as const, classification: "compound" as const,
    resistanceType: "kettlebell" as const, difficulty: "advanced" as const,
    unilateral: true, isDistanceBased: true, defaultBodyPosition: "standing" as const,
    fatigueCost: 6, technicalComplexity: 7, stabilityDemand: 8,
    jointStressShoulder: 6, jointStressWrist: 3, jointStressSpine: 5,
    lengthenedBias: 1, shortenedBias: 2, stretchMediatedPotential: 1 },

  { slug: "front-rack-carry", name: "Front Rack Carry",
    alternateNames: ["Rack Carry"] as const,
    movementPattern: "carry" as const, classification: "compound" as const,
    resistanceType: "kettlebell" as const, difficulty: "intermediate" as const,
    isDistanceBased: true, defaultBodyPosition: "standing" as const,
    fatigueCost: 5, technicalComplexity: 5, stabilityDemand: 6,
    jointStressShoulder: 4, jointStressWrist: 3, jointStressSpine: 3,
    lengthenedBias: 1, shortenedBias: 2, stretchMediatedPotential: 1 },

  { slug: "trap-bar-carry", name: "Trap Bar Carry",
    alternateNames: ["Hex Bar Carry"] as const,
    movementPattern: "carry" as const, classification: "compound" as const,
    resistanceType: "trap_bar" as const, difficulty: "beginner" as const,
    isDistanceBased: true, defaultBodyPosition: "standing" as const,
    fatigueCost: 5, technicalComplexity: 3, stabilityDemand: 5,
    jointStressShoulder: 2, jointStressWrist: 3, jointStressSpine: 3,
    lengthenedBias: 1, shortenedBias: 2, stretchMediatedPotential: 1 },

  { slug: "sandbag-carry", name: "Sandbag Carry",
    movementPattern: "carry" as const, classification: "compound" as const,
    resistanceType: "sandbag" as const, difficulty: "intermediate" as const,
    isDistanceBased: true, defaultBodyPosition: "standing" as const,
    fatigueCost: 6, technicalComplexity: 4, stabilityDemand: 6,
    jointStressShoulder: 3, jointStressWrist: 2, jointStressSpine: 4,
    lengthenedBias: 1, shortenedBias: 2, stretchMediatedPotential: 1 },

  { slug: "single-arm-farmers-carry", name: "Single-Arm Farmer's Carry",
    alternateNames: ["One-Arm Farmer's Carry"] as const,
    movementPattern: "carry" as const, classification: "compound" as const,
    resistanceType: "dumbbell" as const, difficulty: "intermediate" as const,
    unilateral: true, isDistanceBased: true, defaultBodyPosition: "standing" as const,
    fatigueCost: 5, technicalComplexity: 4, stabilityDemand: 7,
    jointStressShoulder: 3, jointStressWrist: 3, jointStressSpine: 4,
    lengthenedBias: 1, shortenedBias: 2, stretchMediatedPotential: 1 },

] as const;

// ─── MUSCLES ─────────────────────────────────────────────────
// [slug, muscle_group, role]

const MUSCLES: Array<[string, MuscleGroup, MuscleRole]> = [

  // Anti-rotation
  ["pallof-press",                 "obliques",       "primary"],
  ["pallof-press",                 "transverse_abdominis", "secondary"],
  ["pallof-press",                 "rectus_abdominis", "stabilizer"],

  ["band-pallof-press",            "obliques",       "primary"],
  ["band-pallof-press",            "transverse_abdominis", "secondary"],
  ["band-pallof-press",            "rectus_abdominis", "stabilizer"],

  ["half-kneeling-pallof-press",   "obliques",       "primary"],
  ["half-kneeling-pallof-press",   "transverse_abdominis", "secondary"],
  ["half-kneeling-pallof-press",   "rectus_abdominis", "stabilizer"],

  ["ab-wheel-rollout",             "rectus_abdominis", "primary"],
  ["ab-wheel-rollout",             "obliques",       "secondary"],
  ["ab-wheel-rollout",             "transverse_abdominis", "stabilizer"],
  ["ab-wheel-rollout",             "lats",           "stabilizer"],

  ["stir-the-pot",                 "transverse_abdominis", "primary"],
  ["stir-the-pot",                 "obliques",       "secondary"],
  ["stir-the-pot",                 "rectus_abdominis", "stabilizer"],

  ["dead-bug",                     "transverse_abdominis", "primary"],
  ["dead-bug",                     "rectus_abdominis", "secondary"],
  ["dead-bug",                     "hip_flexors",    "stabilizer"],

  ["bird-dog",                     "multifidus",     "primary"],
  ["bird-dog",                     "spinal_erectors","secondary"],
  ["bird-dog",                     "glutes",         "stabilizer"],

  // Rotation
  ["cable-woodchop-high-to-low",   "obliques",       "primary"],
  ["cable-woodchop-high-to-low",   "rectus_abdominis", "secondary"],
  ["cable-woodchop-high-to-low",   "transverse_abdominis", "stabilizer"],

  ["cable-woodchop-low-to-high",   "obliques",       "primary"],
  ["cable-woodchop-low-to-high",   "rectus_abdominis", "secondary"],
  ["cable-woodchop-low-to-high",   "transverse_abdominis", "stabilizer"],

  ["russian-twist",                "obliques",       "primary"],
  ["russian-twist",                "rectus_abdominis", "secondary"],

  ["medicine-ball-rotational-throw","obliques",      "primary"],
  ["medicine-ball-rotational-throw","rectus_abdominis", "secondary"],
  ["medicine-ball-rotational-throw","spinal_erectors", "stabilizer"],

  ["landmine-rotation",            "obliques",       "primary"],
  ["landmine-rotation",            "rectus_abdominis", "secondary"],
  ["landmine-rotation",            "spinal_erectors", "stabilizer"],

  ["standing-cable-rotation",      "obliques",       "primary"],
  ["standing-cable-rotation",      "rectus_abdominis", "secondary"],
  ["standing-cable-rotation",      "transverse_abdominis", "stabilizer"],

  // Hip flexion
  ["hanging-leg-raise",            "hip_flexors",    "primary"],
  ["hanging-leg-raise",            "rectus_abdominis", "secondary"],
  ["hanging-leg-raise",            "obliques",       "stabilizer"],

  ["hanging-knee-raise",           "hip_flexors",    "primary"],
  ["hanging-knee-raise",           "rectus_abdominis", "secondary"],
  ["hanging-knee-raise",           "obliques",       "stabilizer"],

  ["captains-chair-leg-raise",     "hip_flexors",    "primary"],
  ["captains-chair-leg-raise",     "rectus_abdominis", "secondary"],
  ["captains-chair-leg-raise",     "obliques",       "stabilizer"],

  ["lying-leg-raise",              "hip_flexors",    "primary"],
  ["lying-leg-raise",              "rectus_abdominis", "secondary"],

  ["v-up",                         "rectus_abdominis", "primary"],
  ["v-up",                         "hip_flexors",    "secondary"],

  ["reverse-crunch",               "hip_flexors",    "primary"],
  ["reverse-crunch",               "rectus_abdominis", "secondary"],

  ["toes-to-bar",                  "hip_flexors",    "primary"],
  ["toes-to-bar",                  "rectus_abdominis", "secondary"],
  ["toes-to-bar",                  "lats",           "stabilizer"],
  ["toes-to-bar",                  "forearms",       "stabilizer"],

  ["mountain-climber",             "hip_flexors",    "primary"],
  ["mountain-climber",             "rectus_abdominis", "secondary"],
  ["mountain-climber",             "transverse_abdominis", "stabilizer"],

  // Isometric hold
  ["plank",                        "rectus_abdominis", "primary"],
  ["plank",                        "transverse_abdominis", "secondary"],
  ["plank",                        "glutes",         "stabilizer"],

  ["side-plank",                   "obliques",       "primary"],
  ["side-plank",                   "transverse_abdominis", "secondary"],
  ["side-plank",                   "abductors",      "stabilizer"],

  ["hollow-hold",                  "rectus_abdominis", "primary"],
  ["hollow-hold",                  "hip_flexors",    "secondary"],
  ["hollow-hold",                  "transverse_abdominis", "stabilizer"],

  ["weighted-plank",               "rectus_abdominis", "primary"],
  ["weighted-plank",               "transverse_abdominis", "secondary"],
  ["weighted-plank",               "glutes",         "stabilizer"],

  ["rkc-plank",                    "rectus_abdominis", "primary"],
  ["rkc-plank",                    "glutes",         "secondary"],
  ["rkc-plank",                    "transverse_abdominis", "stabilizer"],

  ["l-sit",                        "hip_flexors",    "primary"],
  ["l-sit",                        "rectus_abdominis", "secondary"],
  ["l-sit",                        "triceps",        "stabilizer"],
  ["l-sit",                        "forearms",       "stabilizer"],

  // Loaded carries
  ["farmers-carry",                "trapezius",      "primary"],
  ["farmers-carry",                "forearms",       "secondary"],
  ["farmers-carry",                "transverse_abdominis", "stabilizer"],

  ["suitcase-carry",               "obliques",       "primary"],
  ["suitcase-carry",               "trapezius",      "secondary"],
  ["suitcase-carry",               "forearms",       "secondary"],
  ["suitcase-carry",               "transverse_abdominis", "stabilizer"],

  ["overhead-carry",               "trapezius",      "primary"],
  ["overhead-carry",               "lateral_deltoid","secondary"],
  ["overhead-carry",               "front_deltoid",  "secondary"],
  ["overhead-carry",               "transverse_abdominis", "stabilizer"],

  ["front-rack-carry",             "front_deltoid",  "primary"],
  ["front-rack-carry",             "trapezius",      "secondary"],
  ["front-rack-carry",             "transverse_abdominis", "stabilizer"],

  ["trap-bar-carry",               "trapezius",      "primary"],
  ["trap-bar-carry",               "forearms",       "secondary"],
  ["trap-bar-carry",               "transverse_abdominis", "stabilizer"],

  ["sandbag-carry",                "trapezius",      "primary"],
  ["sandbag-carry",                "forearms",       "secondary"],
  ["sandbag-carry",                "obliques",       "stabilizer"],
  ["sandbag-carry",                "transverse_abdominis", "stabilizer"],

  ["single-arm-farmers-carry",     "obliques",       "primary"],
  ["single-arm-farmers-carry",     "trapezius",      "secondary"],
  ["single-arm-farmers-carry",     "forearms",       "secondary"],
  ["single-arm-farmers-carry",     "transverse_abdominis", "stabilizer"],
];

// ─── EQUIPMENT LINKS ─────────────────────────────────────────
// [exercise_slug, equipment_slug, requirement_type]

const EXERCISE_EQUIPMENT: Array<[string, string, EquipmentRequirement]> = [
  ["pallof-press",                  "cable-station",     "required"],
  ["band-pallof-press",             "resistance-band",   "required"],
  ["half-kneeling-pallof-press",    "cable-station",     "required"],
  ["ab-wheel-rollout",              "ab-wheel",          "required"],
  ["stir-the-pot",                  "stability-ball",    "required"],
  ["cable-woodchop-high-to-low",    "cable-station",     "required"],
  ["cable-woodchop-low-to-high",    "cable-station",     "required"],
  ["russian-twist",                 "medicine-ball",     "optional"],
  ["medicine-ball-rotational-throw","medicine-ball",     "required"],
  ["landmine-rotation",             "barbell",           "required"],
  ["landmine-rotation",             "landmine-attachment","required"],
  ["standing-cable-rotation",       "cable-station",     "required"],
  ["hanging-leg-raise",             "pull-up-bar",       "required"],
  ["hanging-knee-raise",            "pull-up-bar",       "required"],
  ["captains-chair-leg-raise",      "captains-chair",    "required"],
  ["toes-to-bar",                   "pull-up-bar",       "required"],
  ["weighted-plank",                "weight-plate",      "required"],
  ["l-sit",                         "dip-station",       "optional"],
  ["farmers-carry",                 "dumbbells",         "required"],
  ["suitcase-carry",                "dumbbells",         "required"],
  ["overhead-carry",                "kettlebells",       "required"],
  ["front-rack-carry",              "kettlebells",       "required"],
  ["trap-bar-carry",                "trap-bar",          "required"],
  ["sandbag-carry",                 "sandbag",           "required"],
  ["single-arm-farmers-carry",      "dumbbells",         "required"],
];

// ─── COACHING CUES ───────────────────────────────────────────
// [slug, cue_type, content, order_index]

const CUES: Array<[string, ExerciseCueType, string, number]> = [

  ["pallof-press", "setup",
    "Stand perpendicular to a cable set at chest height, feet shoulder-width. Hold the handle at your sternum with both hands.",
    1],
  ["pallof-press", "execution",
    "Press the handle straight out from your chest without letting your torso rotate toward the machine. Hold briefly at full extension, then return under control.",
    2],
  ["pallof-press", "mental_cue",
    "Resist the twist.",
    3],

  ["ab-wheel-rollout", "setup",
    "Kneel on a pad, hands gripping the wheel directly under the shoulders.",
    1],
  ["ab-wheel-rollout", "execution",
    "Roll forward by extending at the hips and shoulders while keeping the lower back braced flat — never let the hips sag toward the floor. Roll out only as far as control allows, then pull back using the abs, not the hip flexors.",
    2],
  ["ab-wheel-rollout", "common_error",
    "Lower back sagging into extension at full rollout: places significant shear stress on the lumbar spine. Shorten the range of motion until the brace can be maintained throughout.",
    3],

  ["dead-bug", "setup",
    "Lie on your back with arms extended toward the ceiling and knees bent to 90° directly over the hips.",
    1],
  ["dead-bug", "execution",
    "Slowly extend one arm overhead and the opposite leg toward the floor while keeping the lower back pressed flat against the ground. Return and alternate sides.",
    2],
  ["dead-bug", "common_error",
    "Lower back arching off the floor as the limbs extend: signals the core has lost the brace. Stop the range of motion at the point where the back stays flat.",
    3],

  ["bird-dog", "setup",
    "Start on hands and knees, spine in a neutral position, hands under shoulders and knees under hips.",
    1],
  ["bird-dog", "execution",
    "Extend one arm forward and the opposite leg back simultaneously, keeping the hips and shoulders square to the floor throughout. Hold briefly, then return with control.",
    2],

  ["cable-woodchop-high-to-low", "setup",
    "Set the pulley above shoulder height. Stand perpendicular to the machine with feet shoulder-width, arms extended toward the anchor.",
    1],
  ["cable-woodchop-high-to-low", "execution",
    "Rotate the torso and pull the handle down and across the body to the opposite hip, pivoting the back foot. Power comes from trunk rotation, not just the arms.",
    2],

  ["russian-twist", "setup",
    "Sit with knees bent, torso leaned back to roughly 45°, feet either anchored or lifted for added difficulty.",
    1],
  ["russian-twist", "execution",
    "Rotate the torso to touch the medicine ball to the floor on each side, keeping the chest up and the rotation coming from the trunk rather than the arms swinging.",
    2],

  ["medicine-ball-rotational-throw", "setup",
    "Stand side-on to a wall, feet shoulder-width, holding the ball at hip height on the side away from the wall.",
    1],
  ["medicine-ball-rotational-throw", "execution",
    "Rotate explosively through the hips and trunk, releasing the ball into the wall at hip-to-chest height. This trains rotational power rather than a sustained hold.",
    2],

  ["hanging-leg-raise", "setup",
    "Hang from a pull-up bar with a full grip, shoulders active (not passively hanging) and legs extended straight down.",
    1],
  ["hanging-leg-raise", "execution",
    "Raise the legs to at least parallel with the floor using a posterior pelvic tilt, not just hip flexion. Lower under control without swinging.",
    2],
  ["hanging-leg-raise", "common_error",
    "Using momentum to swing the legs up: removes tension from the abdominals and shifts stress onto the shoulders and lower back. Slow the tempo and eliminate the swing.",
    3],

  ["v-up", "setup",
    "Lie flat on your back with arms extended overhead and legs straight.",
    1],
  ["v-up", "execution",
    "Simultaneously raise the torso and legs, reaching hands toward toes at the top to form a V shape. Lower under control back to the start.",
    2],

  ["toes-to-bar", "setup",
    "Hang from a pull-up bar with an active shoulder position, slight hollow body tension through the torso.",
    1],
  ["toes-to-bar", "execution",
    "Initiate with a slight hip drive (kip) or, for a strict version, pure hip and abdominal flexion, bringing the toes to touch the bar. Control the descent back to a full hang.",
    2],
  ["toes-to-bar", "safety",
    "Build sufficient strict hanging leg raise strength before attempting kipping toes-to-bar — the dynamic swing places significant demand on the shoulders under fatigue.",
    3],

  ["mountain-climber", "setup",
    "Start in a push-up plank position, hands under shoulders, body in a straight line.",
    1],
  ["mountain-climber", "execution",
    "Drive one knee toward the chest, then quickly switch legs while keeping the hips level and the plank position intact throughout.",
    2],

  ["plank", "setup",
    "Forearms on the floor under the shoulders, body in a straight line from head to heels, feet hip-width apart.",
    1],
  ["plank", "execution",
    "Brace the abs and glutes hard and hold the position without letting the hips sag or pike up. Breathe steadily throughout the hold.",
    2],
  ["plank", "common_error",
    "Hips sagging toward the floor as fatigue sets in: shifts the load into lumbar extension instead of core bracing. End the set once form breaks rather than chasing time.",
    3],

  ["side-plank", "setup",
    "Lie on one side, propped on a single forearm directly under the shoulder, feet stacked or staggered for balance.",
    1],
  ["side-plank", "execution",
    "Lift the hips until the body forms a straight line from ankles to shoulders. Hold without letting the hips drop or rotate forward.",
    2],

  ["hollow-hold", "setup",
    "Lie on your back, then press the lower back flat into the floor while lifting shoulders and legs a few inches off the ground.",
    1],
  ["hollow-hold", "execution",
    "Hold the position with arms extended overhead and legs straight, keeping the lower back in contact with the floor throughout. Lower the arms or legs to regress if the back begins to arch.",
    2],

  ["rkc-plank", "setup",
    "Set up in a standard forearm plank position.",
    1],
  ["rkc-plank", "execution",
    "Maximally contract the glutes, quads, and abs simultaneously — actively 'pull' the elbows toward the toes without moving — for a short, maximal-tension hold rather than a long, relaxed one.",
    2],

  ["l-sit", "setup",
    "Support yourself on parallettes, parallel bars, or the floor with arms locked out, shoulders depressed away from the ears.",
    1],
  ["l-sit", "execution",
    "Lift the legs to a position parallel with the floor, keeping the knees locked and toes pointed. Hold for time, keeping the shoulders actively pressed down throughout.",
    2],

  ["farmers-carry", "setup",
    "Hold a heavy dumbbell in each hand at your sides, shoulders pulled back and down, ribcage stacked over the pelvis.",
    1],
  ["farmers-carry", "execution",
    "Walk for the prescribed distance or time with short, controlled steps, keeping the torso upright and avoiding any side-to-side lean.",
    2],

  ["suitcase-carry", "setup",
    "Hold a single dumbbell at your side, opposite hand free or resting on the hip.",
    1],
  ["suitcase-carry", "execution",
    "Walk while actively resisting the pull of the load toward the loaded side — the working muscles are the obliques on the unloaded side fighting lateral flexion, not just the gripping hand.",
    2],

  ["overhead-carry", "setup",
    "Press a kettlebell to a locked-out overhead position, bicep near the ear, wrist stacked directly over the elbow and shoulder.",
    1],
  ["overhead-carry", "execution",
    "Walk while keeping the arm locked out and the ribcage down — avoid letting the lower back arch to compensate for shoulder or lat tightness.",
    2],
  ["overhead-carry", "safety",
    "Confirm adequate shoulder mobility and overhead stability with lighter loads before progressing weight — a loss of overhead position under load is a common cause of shoulder strain.",
    3],
];

// ─── EXERCISE RELATIONS ────────────────────────────────────────
// [source_slug, target_slug, relation_type, notes]

const RELATIONS: Array<[string, string, ExerciseRelationType, string]> = [

  // Anti-rotation family
  ["pallof-press", "band-pallof-press", "regression",
    "Band version requires no cable station and is easier to scale in small increments — a practical regression for home or limited-equipment settings."],
  ["band-pallof-press", "pallof-press", "progression",
    "Cable version allows heavier, more precise loading once band tension is no longer sufficiently challenging."],
  ["pallof-press", "half-kneeling-pallof-press", "progression",
    "Half-kneeling stance removes the wider standing base of support, adding a hip-stability demand on top of the anti-rotation press."],
  ["half-kneeling-pallof-press", "pallof-press", "regression",
    "Standing stance provides a wider, more stable base — the regression path when the half-kneeling position can't yet be controlled under load."],
  ["dead-bug", "ab-wheel-rollout", "progression",
    "Ab wheel rollout is a substantial progression in anti-extension demand once dead bug can be performed with a fully controlled brace."],
  ["ab-wheel-rollout", "dead-bug", "regression",
    "Dead bug removes load and the anti-extension challenge of the rollout, serving as the entry point for building the same bracing pattern."],
  ["ab-wheel-rollout", "stir-the-pot", "same_pattern",
    "Both train the anterior core to resist extension under an unstable or extending load; stir the pot adds a rotational stability demand on the stability ball."],

  // Rotation family
  ["cable-woodchop-high-to-low", "cable-woodchop-low-to-high", "same_pattern",
    "Reversing the pulley height changes the rotational plane emphasis from a downward chopping pattern to an upward lifting pattern."],
  ["russian-twist", "medicine-ball-rotational-throw", "progression",
    "The rotational throw converts the same trunk-rotation pattern into an explosive power movement once the controlled twist is mastered."],
  ["medicine-ball-rotational-throw", "russian-twist", "regression",
    "Russian twist removes the explosive, ballistic component, serving as the strength-building regression before reintroducing power work."],
  ["landmine-rotation", "standing-cable-rotation", "same_pattern",
    "Both train controlled trunk rotation against resistance; the cable provides constant tension while the landmine's arc changes the resistance curve."],

  // Hip flexion family
  ["hanging-leg-raise", "hanging-knee-raise", "regression",
    "Bending the knees shortens the lever arm significantly, reducing the demand on the hip flexors and abdominals for athletes not yet ready for a straight-leg raise."],
  ["hanging-knee-raise", "hanging-leg-raise", "progression",
    "Straight-leg raise is a progression once knee raises can be performed for high-quality reps without swinging."],
  ["hanging-knee-raise", "lying-leg-raise", "lower_joint_stress",
    "Lying leg raise removes the grip and shoulder-loading demand of a hanging position, isolating the hip flexors and abdominals with the spine supported."],
  ["hanging-leg-raise", "toes-to-bar", "progression",
    "Toes-to-bar adds significant range of motion and a technical kipping or strict-strength component beyond a standard hanging leg raise."],
  ["toes-to-bar", "hanging-leg-raise", "regression",
    "Hanging leg raise removes the full range of motion and technical demand of touching the bar, serving as the standard regression while building strength."],
  ["v-up", "reverse-crunch", "regression",
    "Reverse crunch isolates hip flexion with the upper body supported on the floor, removing the simultaneous upper-body lever of a V-up."],
  ["reverse-crunch", "v-up", "progression",
    "V-up is a progression once reverse crunches can be performed with full control — it adds a simultaneous upper-body lever to the same hip-flexion pattern."],

  // Isometric hold family
  ["plank", "side-plank", "same_pattern",
    "Same anti-extension bracing skill applied in the frontal plane, shifting emphasis to the obliques and hip abductors."],
  ["plank", "rkc-plank", "progression",
    "RKC plank applies maximal whole-body tension to the same position, producing significantly more stimulus per second than a standard relaxed plank hold."],
  ["rkc-plank", "plank", "regression",
    "Standard plank removes the maximal-tension requirement, appropriate when building toward the ability to sustain a high-tension hold."],
  ["plank", "weighted-plank", "progression",
    "Adding external load via a plate on the back increases the anti-extension demand once bodyweight holds can be sustained well past a target duration."],
  ["weighted-plank", "plank", "regression",
    "Removing external load is the standard regression once volume or fatigue management calls for a lighter core session."],
  ["hollow-hold", "l-sit", "progression",
    "L-sit adds a significant hip-flexor and shoulder-depression demand on top of the same lower-back-flat bracing position trained by the hollow hold."],
  ["l-sit", "hollow-hold", "regression",
    "Hollow hold removes the arm-support and hip-flexion demand of an L-sit, isolating the anterior core bracing pattern that underpins it."],

  // Loaded carry family
  ["farmers-carry", "suitcase-carry", "contralateral",
    "Loading a single side converts the carry from a purely anterior-loaded hold into an anti-lateral-flexion challenge for the unloaded side's obliques."],
  ["farmers-carry", "single-arm-farmers-carry", "contralateral",
    "Single-arm loading trains each side independently and surfaces left-right grip and core-stability asymmetries the bilateral carry does not."],
  ["farmers-carry", "trap-bar-carry", "same_pattern",
    "Centered trap bar loading trains the same bilateral loaded-carry pattern with a more balanced load path than two independent dumbbells."],
  ["overhead-carry", "front-rack-carry", "lower_joint_stress",
    "Front rack position removes the extreme shoulder end-range demand of an overhead carry while preserving significant anti-lateral-flexion core loading."],
  ["front-rack-carry", "farmers-carry", "regression",
    "Farmer's carry removes the shoulder-rack demand entirely, serving as the foundational loaded-carry regression before progressing to a rack or overhead position."],
];

// ─── MAIN ─────────────────────────────────────────────────────

async function main() {
  console.log("\nCatalyst OS — Exercise Library Seed 005: Core & Carries");
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
    "005 — Core & Carries (34 exercises)",
  );

  console.log("─────────────────────────────────────────────────────────");
  console.log("Seed 005 complete.\n");
  await sql.end();
}

main().catch(async (err) => {
  console.error("\nSeed failed:", err instanceof Error ? err.message : err);
  await sql.end();
  process.exit(1);
});
