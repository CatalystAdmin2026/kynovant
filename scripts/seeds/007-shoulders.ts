#!/usr/bin/env npx tsx
// ─────────────────────────────────────────────────────────────
// Catalyst OS — Exercise Library Seed 007: Shoulders
//
// Usage:
//   set -a && source .env.local && set +a && npx tsx scripts/seeds/007-shoulders.ts
//
// Covers:
//   Shoulder abduction — lateral deltoid isolation: dumbbell, cable,
//     machine, band, and scapular-plane/constant-tension variants
//   Shoulder adduction — cable and band cross-body adduction
//   External / internal rotation — rotator cuff isolation: band,
//     cable, and dumbbell, at both elbow-at-side and 90/90 positions
//
// Note: the muscleGroupEnum has no dedicated rotator-cuff entries
// (infraspinatus/teres minor/subscapularis). Per spec, external
// rotation is mapped to its closest synergist, rear_deltoid; internal
// rotation to front_deltoid. No new muscle group values are invented.
//
// Count: 32 exercises
// Spec: docs/exercise-intelligence-spec.md
// ─────────────────────────────────────────────────────────────

import { SHARED_EQUIPMENT, db, sql, seedEquipment, seedExercises } from "./_shared";
import type { MuscleGroup, MuscleRole, EquipmentRequirement, ExerciseCueType, ExerciseRelationType } from "./_shared";

// ─── LOCAL EQUIPMENT ─────────────────────────────────────────
// Additions beyond SHARED_EQUIPMENT needed for this file.

const EQUIPMENT = [
  { slug: "weight-plate", name: "Weight Plate", category: "free_weights" },
] as const;

// ─── EXERCISES ───────────────────────────────────────────────

const EXERCISES = [

  // ── Lateral Deltoid: Dumbbell ──────────────────────────────

  { slug: "standing-dumbbell-lateral-raise", name: "Standing Dumbbell Lateral Raise",
    movementPattern: "shoulder_abduction" as const, classification: "isolation" as const,
    resistanceType: "dumbbell" as const, difficulty: "beginner" as const,
    defaultBodyPosition: "standing" as const,
    fatigueCost: 2, technicalComplexity: 2, stabilityDemand: 3,
    jointStressShoulder: 4,
    lengthenedBias: 1, shortenedBias: 8, stretchMediatedPotential: 1 },

  { slug: "seated-dumbbell-lateral-raise", name: "Seated Dumbbell Lateral Raise",
    movementPattern: "shoulder_abduction" as const, classification: "isolation" as const,
    resistanceType: "dumbbell" as const, difficulty: "beginner" as const,
    defaultBodyPosition: "seated" as const,
    fatigueCost: 2, technicalComplexity: 2, stabilityDemand: 2,
    jointStressShoulder: 4,
    lengthenedBias: 1, shortenedBias: 8, stretchMediatedPotential: 1 },

  { slug: "single-arm-dumbbell-lateral-raise", name: "Single-Arm Dumbbell Lateral Raise",
    movementPattern: "shoulder_abduction" as const, classification: "isolation" as const,
    resistanceType: "dumbbell" as const, difficulty: "intermediate" as const,
    unilateral: true, defaultBodyPosition: "standing" as const,
    fatigueCost: 1, technicalComplexity: 3, stabilityDemand: 3,
    jointStressShoulder: 4,
    lengthenedBias: 1, shortenedBias: 8, stretchMediatedPotential: 1 },

  { slug: "dumbbell-lu-raise", name: "Dumbbell Lu Raise",
    movementPattern: "shoulder_abduction" as const, classification: "isolation" as const,
    resistanceType: "dumbbell" as const, difficulty: "intermediate" as const,
    defaultBodyPosition: "standing" as const,
    fatigueCost: 3, technicalComplexity: 4, stabilityDemand: 3,
    jointStressShoulder: 3,
    lengthenedBias: 2, shortenedBias: 7, stretchMediatedPotential: 2 },

  { slug: "side-lying-dumbbell-lateral-raise", name: "Side-Lying Dumbbell Lateral Raise",
    movementPattern: "shoulder_abduction" as const, classification: "isolation" as const,
    resistanceType: "dumbbell" as const, difficulty: "intermediate" as const,
    unilateral: true,
    fatigueCost: 1, technicalComplexity: 4, stabilityDemand: 4,
    jointStressShoulder: 4,
    lengthenedBias: 7, shortenedBias: 6, stretchMediatedPotential: 7 },

  { slug: "incline-bench-lateral-raise", name: "Incline Bench Lateral Raise",
    movementPattern: "shoulder_abduction" as const, classification: "isolation" as const,
    resistanceType: "dumbbell" as const, difficulty: "intermediate" as const,
    defaultBodyPosition: "incline" as const,
    fatigueCost: 2, technicalComplexity: 3, stabilityDemand: 2,
    jointStressShoulder: 4,
    lengthenedBias: 5, shortenedBias: 7, stretchMediatedPotential: 5 },

  { slug: "partial-lateral-raise-top-half", name: "Partial Lateral Raise (Top-Half)",
    movementPattern: "shoulder_abduction" as const, classification: "isolation" as const,
    resistanceType: "dumbbell" as const, difficulty: "beginner" as const,
    defaultBodyPosition: "standing" as const,
    fatigueCost: 2, technicalComplexity: 2, stabilityDemand: 3,
    jointStressShoulder: 3,
    lengthenedBias: 0, shortenedBias: 9, stretchMediatedPotential: 0 },

  { slug: "dumbbell-scaption-raise", name: "Dumbbell Scaption Raise",
    movementPattern: "shoulder_abduction" as const, classification: "isolation" as const,
    resistanceType: "dumbbell" as const, difficulty: "beginner" as const,
    defaultBodyPosition: "standing" as const,
    fatigueCost: 2, technicalComplexity: 3, stabilityDemand: 3,
    jointStressShoulder: 3,
    lengthenedBias: 1, shortenedBias: 8, stretchMediatedPotential: 1 },

  { slug: "dumbbell-y-raise", name: "Prone Incline Dumbbell Y-Raise",
    movementPattern: "shoulder_abduction" as const, classification: "isolation" as const,
    resistanceType: "dumbbell" as const, difficulty: "intermediate" as const,
    defaultBodyPosition: "incline" as const,
    fatigueCost: 3, technicalComplexity: 4, stabilityDemand: 2,
    jointStressShoulder: 3,
    lengthenedBias: 4, shortenedBias: 6, stretchMediatedPotential: 4 },

  { slug: "plate-lateral-raise", name: "Plate Lateral Raise",
    movementPattern: "shoulder_abduction" as const, classification: "isolation" as const,
    resistanceType: "plate_loaded" as const, difficulty: "intermediate" as const,
    defaultBodyPosition: "standing" as const,
    fatigueCost: 2, technicalComplexity: 3, stabilityDemand: 3,
    jointStressShoulder: 4, jointStressWrist: 3,
    lengthenedBias: 1, shortenedBias: 8, stretchMediatedPotential: 1 },

  // ── Lateral Deltoid: Cable ──────────────────────────────────

  { slug: "cable-lateral-raise", name: "Cable Lateral Raise",
    movementPattern: "shoulder_abduction" as const, classification: "isolation" as const,
    resistanceType: "cable" as const, difficulty: "intermediate" as const,
    unilateral: true, defaultBodyPosition: "standing" as const,
    fatigueCost: 1, technicalComplexity: 3, stabilityDemand: 4,
    jointStressShoulder: 4,
    lengthenedBias: 4, shortenedBias: 7, stretchMediatedPotential: 4 },

  { slug: "leaning-cable-lateral-raise", name: "Leaning Cable Lateral Raise",
    movementPattern: "shoulder_abduction" as const, classification: "isolation" as const,
    resistanceType: "cable" as const, difficulty: "intermediate" as const,
    unilateral: true, defaultBodyPosition: "standing" as const,
    fatigueCost: 1, technicalComplexity: 4, stabilityDemand: 5,
    jointStressShoulder: 5,
    lengthenedBias: 7, shortenedBias: 6, stretchMediatedPotential: 7 },

  { slug: "behind-the-back-cable-lateral-raise", name: "Behind-the-Back Cable Lateral Raise",
    movementPattern: "shoulder_abduction" as const, classification: "isolation" as const,
    resistanceType: "cable" as const, difficulty: "intermediate" as const,
    unilateral: true, defaultBodyPosition: "standing" as const,
    fatigueCost: 1, technicalComplexity: 4, stabilityDemand: 5,
    jointStressShoulder: 5,
    lengthenedBias: 8, shortenedBias: 5, stretchMediatedPotential: 8 },

  { slug: "cross-body-cable-lateral-raise", name: "Cross-Body Cable Lateral Raise",
    movementPattern: "shoulder_abduction" as const, classification: "isolation" as const,
    resistanceType: "cable" as const, difficulty: "intermediate" as const,
    unilateral: true, defaultBodyPosition: "standing" as const,
    fatigueCost: 1, technicalComplexity: 4, stabilityDemand: 5,
    jointStressShoulder: 5,
    lengthenedBias: 6, shortenedBias: 6, stretchMediatedPotential: 6 },

  { slug: "seated-cable-lateral-raise", name: "Seated Cable Lateral Raise",
    movementPattern: "shoulder_abduction" as const, classification: "isolation" as const,
    resistanceType: "cable" as const, difficulty: "intermediate" as const,
    unilateral: true, defaultBodyPosition: "seated" as const,
    fatigueCost: 1, technicalComplexity: 3, stabilityDemand: 3,
    jointStressShoulder: 4,
    lengthenedBias: 4, shortenedBias: 7, stretchMediatedPotential: 4 },

  { slug: "cable-lu-raise", name: "Cable Lu Raise",
    movementPattern: "shoulder_abduction" as const, classification: "isolation" as const,
    resistanceType: "cable" as const, difficulty: "intermediate" as const,
    defaultBodyPosition: "standing" as const,
    fatigueCost: 3, technicalComplexity: 4, stabilityDemand: 4,
    jointStressShoulder: 3,
    lengthenedBias: 4, shortenedBias: 6, stretchMediatedPotential: 4 },

  { slug: "cable-y-raise", name: "Cable Y-Raise",
    movementPattern: "shoulder_abduction" as const, classification: "isolation" as const,
    resistanceType: "cable" as const, difficulty: "intermediate" as const,
    defaultBodyPosition: "standing" as const,
    fatigueCost: 3, technicalComplexity: 4, stabilityDemand: 4,
    jointStressShoulder: 4,
    lengthenedBias: 3, shortenedBias: 7, stretchMediatedPotential: 3 },

  // ── Lateral Deltoid: Machine, Band ──────────────────────────

  { slug: "machine-lateral-raise", name: "Machine Lateral Raise",
    movementPattern: "shoulder_abduction" as const, classification: "isolation" as const,
    resistanceType: "machine" as const, difficulty: "beginner" as const,
    defaultBodyPosition: "seated" as const,
    fatigueCost: 1, technicalComplexity: 1, stabilityDemand: 1,
    jointStressShoulder: 3,
    lengthenedBias: 3, shortenedBias: 7, stretchMediatedPotential: 3 },

  { slug: "band-lateral-raise", name: "Band Lateral Raise",
    movementPattern: "shoulder_abduction" as const, classification: "isolation" as const,
    resistanceType: "band" as const, difficulty: "beginner" as const,
    defaultBodyPosition: "standing" as const,
    fatigueCost: 2, technicalComplexity: 2, stabilityDemand: 3,
    jointStressShoulder: 3,
    lengthenedBias: 3, shortenedBias: 7, stretchMediatedPotential: 3 },

  // ── Shoulder Adduction ───────────────────────────────────────

  { slug: "single-arm-cable-shoulder-adduction", name: "Single-Arm Cable Shoulder Adduction",
    movementPattern: "shoulder_adduction" as const, classification: "isolation" as const,
    resistanceType: "cable" as const, difficulty: "intermediate" as const,
    unilateral: true, defaultBodyPosition: "standing" as const,
    fatigueCost: 1, technicalComplexity: 3, stabilityDemand: 4,
    jointStressShoulder: 4,
    lengthenedBias: 6, shortenedBias: 6, stretchMediatedPotential: 6 },

  { slug: "band-shoulder-adduction", name: "Band Shoulder Adduction",
    movementPattern: "shoulder_adduction" as const, classification: "isolation" as const,
    resistanceType: "band" as const, difficulty: "beginner" as const,
    unilateral: true, defaultBodyPosition: "standing" as const,
    fatigueCost: 1, technicalComplexity: 2, stabilityDemand: 3,
    jointStressShoulder: 3,
    lengthenedBias: 5, shortenedBias: 6, stretchMediatedPotential: 5 },

  // ── External Rotation ─────────────────────────────────────

  { slug: "band-external-rotation", name: "Band External Rotation (Elbow at Side)",
    movementPattern: "external_rotation" as const, classification: "isolation" as const,
    resistanceType: "band" as const, difficulty: "beginner" as const,
    unilateral: true, defaultBodyPosition: "standing" as const,
    fatigueCost: 1, technicalComplexity: 2, stabilityDemand: 3,
    jointStressShoulder: 2, jointStressElbow: 1, jointStressWrist: 1,
    lengthenedBias: 3, shortenedBias: 6, stretchMediatedPotential: 3 },

  { slug: "cable-external-rotation", name: "Cable External Rotation (Elbow at Side)",
    movementPattern: "external_rotation" as const, classification: "isolation" as const,
    resistanceType: "cable" as const, difficulty: "beginner" as const,
    unilateral: true, defaultBodyPosition: "standing" as const,
    fatigueCost: 1, technicalComplexity: 2, stabilityDemand: 3,
    jointStressShoulder: 2, jointStressElbow: 1, jointStressWrist: 1,
    lengthenedBias: 4, shortenedBias: 6, stretchMediatedPotential: 4 },

  { slug: "side-lying-dumbbell-external-rotation", name: "Side-Lying Dumbbell External Rotation",
    movementPattern: "external_rotation" as const, classification: "isolation" as const,
    resistanceType: "dumbbell" as const, difficulty: "beginner" as const,
    unilateral: true,
    fatigueCost: 1, technicalComplexity: 2, stabilityDemand: 2,
    jointStressShoulder: 2, jointStressElbow: 1, jointStressWrist: 1,
    lengthenedBias: 4, shortenedBias: 6, stretchMediatedPotential: 4 },

  { slug: "band-external-rotation-90-90", name: "Band External Rotation (90/90 Position)",
    movementPattern: "external_rotation" as const, classification: "isolation" as const,
    resistanceType: "band" as const, difficulty: "intermediate" as const,
    unilateral: true, defaultBodyPosition: "standing" as const,
    fatigueCost: 1, technicalComplexity: 4, stabilityDemand: 5,
    jointStressShoulder: 4, jointStressElbow: 1, jointStressWrist: 1,
    lengthenedBias: 4, shortenedBias: 6, stretchMediatedPotential: 4 },

  { slug: "cable-external-rotation-90-90", name: "Cable External Rotation (90/90 Position)",
    movementPattern: "external_rotation" as const, classification: "isolation" as const,
    resistanceType: "cable" as const, difficulty: "intermediate" as const,
    unilateral: true, defaultBodyPosition: "standing" as const,
    fatigueCost: 1, technicalComplexity: 4, stabilityDemand: 5,
    jointStressShoulder: 4, jointStressElbow: 1, jointStressWrist: 1,
    lengthenedBias: 5, shortenedBias: 6, stretchMediatedPotential: 5 },

  { slug: "prone-incline-dumbbell-external-rotation", name: "Prone Incline Dumbbell External Rotation",
    movementPattern: "external_rotation" as const, classification: "isolation" as const,
    resistanceType: "dumbbell" as const, difficulty: "intermediate" as const,
    unilateral: true, defaultBodyPosition: "incline" as const,
    fatigueCost: 1, technicalComplexity: 3, stabilityDemand: 2,
    jointStressShoulder: 3, jointStressElbow: 1, jointStressWrist: 1,
    lengthenedBias: 4, shortenedBias: 6, stretchMediatedPotential: 4 },

  // ── Internal Rotation ─────────────────────────────────────

  { slug: "band-internal-rotation", name: "Band Internal Rotation (Elbow at Side)",
    movementPattern: "internal_rotation" as const, classification: "isolation" as const,
    resistanceType: "band" as const, difficulty: "beginner" as const,
    unilateral: true, defaultBodyPosition: "standing" as const,
    fatigueCost: 1, technicalComplexity: 2, stabilityDemand: 3,
    jointStressShoulder: 2, jointStressElbow: 1, jointStressWrist: 1,
    lengthenedBias: 3, shortenedBias: 6, stretchMediatedPotential: 3 },

  { slug: "cable-internal-rotation", name: "Cable Internal Rotation (Elbow at Side)",
    movementPattern: "internal_rotation" as const, classification: "isolation" as const,
    resistanceType: "cable" as const, difficulty: "beginner" as const,
    unilateral: true, defaultBodyPosition: "standing" as const,
    fatigueCost: 1, technicalComplexity: 2, stabilityDemand: 3,
    jointStressShoulder: 2, jointStressElbow: 1, jointStressWrist: 1,
    lengthenedBias: 4, shortenedBias: 6, stretchMediatedPotential: 4 },

  { slug: "side-lying-dumbbell-internal-rotation", name: "Side-Lying Dumbbell Internal Rotation",
    movementPattern: "internal_rotation" as const, classification: "isolation" as const,
    resistanceType: "dumbbell" as const, difficulty: "beginner" as const,
    unilateral: true,
    fatigueCost: 1, technicalComplexity: 2, stabilityDemand: 2,
    jointStressShoulder: 2, jointStressElbow: 1, jointStressWrist: 1,
    lengthenedBias: 4, shortenedBias: 6, stretchMediatedPotential: 4 },

  { slug: "band-internal-rotation-90-90", name: "Band Internal Rotation (90/90 Position)",
    movementPattern: "internal_rotation" as const, classification: "isolation" as const,
    resistanceType: "band" as const, difficulty: "intermediate" as const,
    unilateral: true, defaultBodyPosition: "standing" as const,
    fatigueCost: 1, technicalComplexity: 4, stabilityDemand: 5,
    jointStressShoulder: 4, jointStressElbow: 1, jointStressWrist: 1,
    lengthenedBias: 4, shortenedBias: 6, stretchMediatedPotential: 4 },

  { slug: "cable-internal-rotation-90-90", name: "Cable Internal Rotation (90/90 Position)",
    movementPattern: "internal_rotation" as const, classification: "isolation" as const,
    resistanceType: "cable" as const, difficulty: "intermediate" as const,
    unilateral: true, defaultBodyPosition: "standing" as const,
    fatigueCost: 1, technicalComplexity: 4, stabilityDemand: 5,
    jointStressShoulder: 4, jointStressElbow: 1, jointStressWrist: 1,
    lengthenedBias: 5, shortenedBias: 6, stretchMediatedPotential: 5 },

] as const;

// ─── MUSCLES ─────────────────────────────────────────────────
// [slug, muscle_group, role]

const MUSCLES: Array<[string, MuscleGroup, MuscleRole]> = [

  // Lateral deltoid: dumbbell
  ["standing-dumbbell-lateral-raise", "lateral_deltoid", "primary"],
  ["standing-dumbbell-lateral-raise", "front_deltoid",   "secondary"],
  ["standing-dumbbell-lateral-raise", "trapezius",       "stabilizer"],

  ["seated-dumbbell-lateral-raise",   "lateral_deltoid", "primary"],
  ["seated-dumbbell-lateral-raise",   "front_deltoid",   "secondary"],
  ["seated-dumbbell-lateral-raise",   "trapezius",       "stabilizer"],

  ["single-arm-dumbbell-lateral-raise", "lateral_deltoid", "primary"],
  ["single-arm-dumbbell-lateral-raise", "front_deltoid",   "secondary"],
  ["single-arm-dumbbell-lateral-raise", "trapezius",       "stabilizer"],

  ["dumbbell-lu-raise",               "lateral_deltoid", "primary"],
  ["dumbbell-lu-raise",               "front_deltoid",   "secondary"],
  ["dumbbell-lu-raise",               "trapezius",       "secondary"],

  ["side-lying-dumbbell-lateral-raise", "lateral_deltoid", "primary"],
  ["side-lying-dumbbell-lateral-raise", "front_deltoid",   "secondary"],
  ["side-lying-dumbbell-lateral-raise", "obliques",        "stabilizer"],

  ["incline-bench-lateral-raise",     "lateral_deltoid", "primary"],
  ["incline-bench-lateral-raise",     "front_deltoid",   "secondary"],
  ["incline-bench-lateral-raise",     "trapezius",       "stabilizer"],

  ["partial-lateral-raise-top-half",  "lateral_deltoid", "primary"],
  ["partial-lateral-raise-top-half",  "front_deltoid",   "secondary"],

  ["dumbbell-scaption-raise",         "lateral_deltoid", "primary"],
  ["dumbbell-scaption-raise",         "front_deltoid",   "secondary"],
  ["dumbbell-scaption-raise",         "trapezius",       "stabilizer"],

  ["dumbbell-y-raise",                "lateral_deltoid", "primary"],
  ["dumbbell-y-raise",                "trapezius",       "secondary"],
  ["dumbbell-y-raise",                "front_deltoid",   "secondary"],

  ["plate-lateral-raise",             "lateral_deltoid", "primary"],
  ["plate-lateral-raise",             "front_deltoid",   "secondary"],
  ["plate-lateral-raise",             "forearms",        "stabilizer"],
  ["plate-lateral-raise",             "trapezius",       "stabilizer"],

  // Lateral deltoid: cable
  ["cable-lateral-raise",             "lateral_deltoid", "primary"],
  ["cable-lateral-raise",             "front_deltoid",   "secondary"],
  ["cable-lateral-raise",             "trapezius",       "stabilizer"],

  ["leaning-cable-lateral-raise",     "lateral_deltoid", "primary"],
  ["leaning-cable-lateral-raise",     "front_deltoid",   "secondary"],
  ["leaning-cable-lateral-raise",     "obliques",        "stabilizer"],

  ["behind-the-back-cable-lateral-raise", "lateral_deltoid", "primary"],
  ["behind-the-back-cable-lateral-raise", "front_deltoid",   "secondary"],
  ["behind-the-back-cable-lateral-raise", "trapezius",       "stabilizer"],

  ["cross-body-cable-lateral-raise",  "lateral_deltoid", "primary"],
  ["cross-body-cable-lateral-raise",  "front_deltoid",   "secondary"],
  ["cross-body-cable-lateral-raise",  "obliques",        "stabilizer"],

  ["seated-cable-lateral-raise",      "lateral_deltoid", "primary"],
  ["seated-cable-lateral-raise",      "front_deltoid",   "secondary"],
  ["seated-cable-lateral-raise",      "trapezius",       "stabilizer"],

  ["cable-lu-raise",                  "lateral_deltoid", "primary"],
  ["cable-lu-raise",                  "front_deltoid",   "secondary"],
  ["cable-lu-raise",                  "trapezius",       "secondary"],

  ["cable-y-raise",                   "lateral_deltoid", "primary"],
  ["cable-y-raise",                   "trapezius",       "secondary"],
  ["cable-y-raise",                   "front_deltoid",   "secondary"],

  // Lateral deltoid: machine, band
  ["machine-lateral-raise",           "lateral_deltoid", "primary"],
  ["machine-lateral-raise",           "front_deltoid",   "secondary"],

  ["band-lateral-raise",              "lateral_deltoid", "primary"],
  ["band-lateral-raise",              "front_deltoid",   "secondary"],
  ["band-lateral-raise",              "trapezius",       "stabilizer"],

  // Shoulder adduction
  ["single-arm-cable-shoulder-adduction", "chest",       "primary"],
  ["single-arm-cable-shoulder-adduction", "lats",        "secondary"],
  ["single-arm-cable-shoulder-adduction", "rear_deltoid","stabilizer"],

  ["band-shoulder-adduction",         "chest",           "primary"],
  ["band-shoulder-adduction",         "lats",            "secondary"],
  ["band-shoulder-adduction",         "rear_deltoid",    "stabilizer"],

  // External rotation
  ["band-external-rotation",          "rear_deltoid",    "primary"],
  ["band-external-rotation",          "forearms",        "stabilizer"],

  ["cable-external-rotation",         "rear_deltoid",    "primary"],
  ["cable-external-rotation",         "forearms",        "stabilizer"],

  ["side-lying-dumbbell-external-rotation", "rear_deltoid", "primary"],
  ["side-lying-dumbbell-external-rotation", "forearms",     "stabilizer"],

  ["band-external-rotation-90-90",    "rear_deltoid",    "primary"],
  ["band-external-rotation-90-90",    "forearms",        "stabilizer"],

  ["cable-external-rotation-90-90",   "rear_deltoid",    "primary"],
  ["cable-external-rotation-90-90",   "forearms",        "stabilizer"],

  ["prone-incline-dumbbell-external-rotation", "rear_deltoid", "primary"],
  ["prone-incline-dumbbell-external-rotation", "forearms",     "stabilizer"],

  // Internal rotation
  ["band-internal-rotation",          "front_deltoid",   "primary"],
  ["band-internal-rotation",          "forearms",        "stabilizer"],

  ["cable-internal-rotation",         "front_deltoid",   "primary"],
  ["cable-internal-rotation",         "forearms",        "stabilizer"],

  ["side-lying-dumbbell-internal-rotation", "front_deltoid", "primary"],
  ["side-lying-dumbbell-internal-rotation", "forearms",      "stabilizer"],

  ["band-internal-rotation-90-90",    "front_deltoid",   "primary"],
  ["band-internal-rotation-90-90",    "forearms",        "stabilizer"],

  ["cable-internal-rotation-90-90",   "front_deltoid",   "primary"],
  ["cable-internal-rotation-90-90",   "forearms",        "stabilizer"],
];

// ─── EQUIPMENT LINKS ─────────────────────────────────────────
// [exercise_slug, equipment_slug, requirement_type]

const EXERCISE_EQUIPMENT: Array<[string, string, EquipmentRequirement]> = [
  ["standing-dumbbell-lateral-raise",         "dumbbells",            "required"],
  ["seated-dumbbell-lateral-raise",           "dumbbells",            "required"],
  ["seated-dumbbell-lateral-raise",           "flat-bench",           "required"],
  ["single-arm-dumbbell-lateral-raise",       "dumbbells",            "required"],
  ["dumbbell-lu-raise",                       "dumbbells",            "required"],
  ["side-lying-dumbbell-lateral-raise",       "dumbbells",            "required"],
  ["side-lying-dumbbell-lateral-raise",       "flat-bench",           "required"],
  ["incline-bench-lateral-raise",             "dumbbells",            "required"],
  ["incline-bench-lateral-raise",             "adjustable-bench",     "required"],
  ["partial-lateral-raise-top-half",          "dumbbells",            "required"],
  ["dumbbell-scaption-raise",                 "dumbbells",            "required"],
  ["dumbbell-y-raise",                        "dumbbells",            "required"],
  ["dumbbell-y-raise",                        "adjustable-bench",     "required"],
  ["plate-lateral-raise",                     "weight-plate",         "required"],
  ["cable-lateral-raise",                     "cable-station",        "required"],
  ["leaning-cable-lateral-raise",             "cable-station",        "required"],
  ["leaning-cable-lateral-raise",             "power-rack",           "optional"],
  ["behind-the-back-cable-lateral-raise",     "cable-station",        "required"],
  ["cross-body-cable-lateral-raise",          "cable-station",        "required"],
  ["seated-cable-lateral-raise",              "cable-station",        "required"],
  ["seated-cable-lateral-raise",              "flat-bench",           "required"],
  ["cable-lu-raise",                          "cable-station",        "required"],
  ["cable-y-raise",                           "cable-station",        "required"],
  ["machine-lateral-raise",                   "machine-lateral-raise","required"],
  ["band-lateral-raise",                      "resistance-band",      "required"],
  ["single-arm-cable-shoulder-adduction",     "cable-station",        "required"],
  ["band-shoulder-adduction",                 "resistance-band",      "required"],
  ["band-external-rotation",                  "resistance-band",      "required"],
  ["cable-external-rotation",                 "cable-station",        "required"],
  ["side-lying-dumbbell-external-rotation",   "dumbbells",            "required"],
  ["band-external-rotation-90-90",            "resistance-band",      "required"],
  ["cable-external-rotation-90-90",           "cable-station",        "required"],
  ["prone-incline-dumbbell-external-rotation","dumbbells",            "required"],
  ["prone-incline-dumbbell-external-rotation","adjustable-bench",     "required"],
  ["band-internal-rotation",                  "resistance-band",      "required"],
  ["cable-internal-rotation",                 "cable-station",        "required"],
  ["side-lying-dumbbell-internal-rotation",   "dumbbells",            "required"],
  ["band-internal-rotation-90-90",            "resistance-band",      "required"],
  ["cable-internal-rotation-90-90",           "cable-station",        "required"],
];

// ─── COACHING CUES ───────────────────────────────────────────
// [slug, cue_type, content, order_index]

const CUES: Array<[string, ExerciseCueType, string, number]> = [

  ["standing-dumbbell-lateral-raise", "setup",
    "Stand with dumbbells at the sides, a soft bend in the elbows fixed for the whole set, core braced.",
    1],
  ["standing-dumbbell-lateral-raise", "execution",
    "Raise the dumbbells out to the sides until the arms are roughly parallel to the floor, leading with the elbows rather than the hands, then lower under control.",
    2],
  ["standing-dumbbell-lateral-raise", "mental_cue",
    "Lead with the elbows.",
    3],
  ["standing-dumbbell-lateral-raise", "common_error",
    "Using torso momentum to swing the weight up: shifts load off the lateral deltoid onto the lower back and turns the set into swinging reps rather than controlled abduction. Reduce the load until the torso can stay still.",
    4],

  ["seated-dumbbell-lateral-raise", "setup",
    "Sit on a bench without back support, dumbbells at the sides, feet flat on the floor.",
    1],
  ["seated-dumbbell-lateral-raise", "execution",
    "Raise the dumbbells out to the sides to shoulder height without leaning back to generate momentum — the seated position removes the leg drive a standing raise allows.",
    2],

  ["single-arm-dumbbell-lateral-raise", "setup",
    "Stand beside a rack or bench, bracing lightly with the free hand, dumbbell in the working hand at the side.",
    1],
  ["single-arm-dumbbell-lateral-raise", "execution",
    "Raise the dumbbell out to the side while using the light brace only for balance, not to assist the lift, keeping the torso upright throughout.",
    2],

  ["dumbbell-lu-raise", "setup",
    "Stand holding dumbbells at the thighs with a neutral grip, feet shoulder-width.",
    1],
  ["dumbbell-lu-raise", "execution",
    "Raise the dumbbells out and slightly back in an arc toward the scapular plane, allowing a small amount of leg drive to initiate the first few degrees before finishing the top strictly with the delt.",
    2],
  ["dumbbell-lu-raise", "coaching_tip",
    "The slight assist from the legs at the very bottom is intentional — it allows heavier loading than a strict raise while the top portion, where the delt is most mechanically disadvantaged, stays fully muscle-driven.",
    3],

  ["side-lying-dumbbell-lateral-raise", "setup",
    "Lie on your side on a bench or the floor, bottom arm supporting the head, top arm holding a dumbbell resting against the top leg.",
    1],
  ["side-lying-dumbbell-lateral-raise", "execution",
    "Raise the dumbbell straight up until the arm is roughly perpendicular to the floor, feeling continuous tension from the very bottom of the rep — unlike a standing raise, gravity loads this position throughout.",
    2],
  ["side-lying-dumbbell-lateral-raise", "common_error",
    "Rocking the torso backward to help start the raise: reduces the strict bottom-position loading that is the entire purpose of the side-lying setup. Keep the hips and shoulders stacked throughout.",
    3],

  ["incline-bench-lateral-raise", "setup",
    "Lie face-down on a steep incline bench, chest and forehead supported, dumbbells hanging straight down.",
    1],
  ["incline-bench-lateral-raise", "execution",
    "Raise the dumbbells out to the sides without any ability to swing the torso for momentum — the chest support isolates the deltoid completely.",
    2],

  ["partial-lateral-raise-top-half", "setup",
    "Stand holding dumbbells with the arms already raised to roughly parallel with the floor.",
    1],
  ["partial-lateral-raise-top-half", "execution",
    "Perform small pulses through the top quarter of the range only, keeping continuous tension on the lateral deltoid without returning to the dead-hang bottom position.",
    2],

  ["dumbbell-scaption-raise", "setup",
    "Stand holding dumbbells at the sides with thumbs angled slightly up, feet shoulder-width.",
    1],
  ["dumbbell-scaption-raise", "execution",
    "Raise the dumbbells at roughly a 30° angle in front of the body — the scapular plane — rather than straight out to the side, reducing the impingement risk of a strict frontal-plane raise.",
    2],

  ["dumbbell-y-raise", "setup",
    "Lie face-down on a steep incline bench with light dumbbells, arms hanging straight down.",
    1],
  ["dumbbell-y-raise", "execution",
    "Raise the arms up and out into a Y shape overhead, leading with the thumbs, keeping the load light — this is a shoulder-health and lower-trap movement, not a loading exercise.",
    2],

  ["plate-lateral-raise", "setup",
    "Stand holding one weight plate in each hand by the edges, arms at the sides.",
    1],
  ["plate-lateral-raise", "execution",
    "Raise the plates out to the sides as in a standard lateral raise — the flat, wide grip increases the forearm and wrist stabilization demand compared to a dumbbell handle.",
    2],

  ["cable-lateral-raise", "setup",
    "Stand side-on to a low cable pulley, handle in the far hand, arm starting across the front of the body.",
    1],
  ["cable-lateral-raise", "execution",
    "Raise the arm out to the side against the cable's constant tension, which — unlike a dumbbell — continues to load the shoulder even at the fully lowered starting position.",
    2],

  ["leaning-cable-lateral-raise", "setup",
    "Stand beside a low cable pulley, gripping a fixed post or rack with the free hand, and lean the torso away from the pulley until the cable pulls the working arm across the body.",
    1],
  ["leaning-cable-lateral-raise", "execution",
    "Raise the arm out to the side from this leaned-away position, which places the lateral deltoid under significant tension at the stretched bottom position that a standing raise cannot replicate.",
    2],
  ["leaning-cable-lateral-raise", "safety",
    "Keep a firm grip on the support post throughout — leaning without a stable anchor risks losing balance under load.",
    3],

  ["behind-the-back-cable-lateral-raise", "setup",
    "Stand with the cable routed behind the body from a low pulley on the opposite side, handle gripped behind the hip.",
    1],
  ["behind-the-back-cable-lateral-raise", "execution",
    "Raise the arm out to the side, feeling the heaviest resistance at the bottom, adducted starting position — this variant is specifically used to overload the lateral deltoid's most stretched length.",
    2],

  ["cross-body-cable-lateral-raise", "setup",
    "Stand side-on to a low cable pulley on the opposite side of the body, handle crossing in front at hip level.",
    1],
  ["cross-body-cable-lateral-raise", "execution",
    "Raise the arm up and out to the side, maintaining tension through the stretched starting position before reaching the top.",
    2],

  ["seated-cable-lateral-raise", "setup",
    "Sit beside a low cable pulley without back support, handle in the far hand.",
    1],
  ["seated-cable-lateral-raise", "execution",
    "Raise the arm out to the side without leaning or using the legs to assist, isolating the deltoid more strictly than a standing cable version.",
    2],

  ["cable-lu-raise", "setup",
    "Stand between two low cable pulleys (or use a single dual-handle attachment), gripping a handle in each hand, arms crossed in front of the thighs.",
    1],
  ["cable-lu-raise", "execution",
    "Raise both arms out and back into the scapular plane, keeping constant cable tension throughout — unlike the dumbbell version, the bottom position is never unloaded.",
    2],

  ["cable-y-raise", "setup",
    "Stand facing away from two low cable pulleys, a handle in each hand, arms starting down and slightly in front of the thighs.",
    1],
  ["cable-y-raise", "execution",
    "Raise both arms up and out into a Y shape overhead, keeping the load light and the movement controlled — this targets the lower trapezius and lateral deltoid together for shoulder health.",
    2],

  ["machine-lateral-raise", "setup",
    "Sit with the outside of the upper arms against the machine's pads, grip the handles lightly.",
    1],
  ["machine-lateral-raise", "execution",
    "Raise through the guided arc to shoulder height, focusing on driving with the deltoid rather than gripping hard with the hands.",
    2],

  ["band-lateral-raise", "setup",
    "Stand on the middle of a resistance band with feet shoulder-width, holding a handle in each hand at the sides.",
    1],
  ["band-lateral-raise", "execution",
    "Raise the arms out to the sides against the band's resistance, which increases progressively through the range and is heaviest near the top.",
    2],

  ["single-arm-cable-shoulder-adduction", "setup",
    "Stand side-on to a high cable pulley, arm starting raised out to the side at roughly shoulder height, elbow straight.",
    1],
  ["single-arm-cable-shoulder-adduction", "execution",
    "Pull the straight arm down and across the body toward the opposite hip, feeling the pull originate from the chest and lat rather than the arm alone.",
    2],
  ["single-arm-cable-shoulder-adduction", "common_error",
    "Bending the elbow partway through the pull: turns the movement into a row or pulldown pattern and shifts emphasis away from the intended straight-arm adduction path.",
    3],

  ["band-shoulder-adduction", "setup",
    "Anchor a band overhead or to the side at shoulder height, arm starting raised out to the side, elbow straight.",
    1],
  ["band-shoulder-adduction", "execution",
    "Pull the straight arm down and across the body toward the opposite hip against the band's resistance.",
    2],

  ["band-external-rotation", "setup",
    "Anchor a band at elbow height, stand side-on, elbow bent 90° and pinned to the side of the torso, forearm across the body.",
    1],
  ["band-external-rotation", "execution",
    "Rotate the forearm outward away from the body while keeping the elbow pinned to the side — only the forearm should move.",
    2],
  ["band-external-rotation", "common_error",
    "Letting the elbow drift away from the torso during the rotation: recruits the larger deltoid and lat instead of isolating the intended rotator cuff musculature.",
    3],

  ["cable-external-rotation", "setup",
    "Stand side-on to a low cable pulley, elbow bent 90° and pinned to the side, forearm across the body gripping the handle.",
    1],
  ["cable-external-rotation", "execution",
    "Rotate the forearm outward against the cable's resistance while keeping the elbow fixed at the side.",
    2],

  ["side-lying-dumbbell-external-rotation", "setup",
    "Lie on the non-working side, working elbow bent 90° and pinned to the ribcage, dumbbell held with the forearm resting across the stomach.",
    1],
  ["side-lying-dumbbell-external-rotation", "execution",
    "Rotate the forearm upward against gravity, keeping the elbow pinned to the ribcage throughout, then lower under control.",
    2],

  ["band-external-rotation-90-90", "setup",
    "Anchor a band at shoulder height, raise the working arm out to the side to 90° with the elbow also bent 90°, forearm pointing forward.",
    1],
  ["band-external-rotation-90-90", "execution",
    "Rotate the forearm back and up toward vertical while holding the upper arm fixed at 90° of abduction — this position closely mirrors the late cocking phase of an overhead throw.",
    2],
  ["band-external-rotation-90-90", "safety",
    "Keep the upper arm elevation controlled and avoid letting the shoulder shrug upward to compensate — fatigue here should show up in the rotators, not the traps.",
    3],

  ["cable-external-rotation-90-90", "setup",
    "Stand with the working arm raised to 90° of abduction, elbow bent 90°, cable set to a low pulley on the same side.",
    1],
  ["cable-external-rotation-90-90", "execution",
    "Rotate the forearm back and up toward vertical while holding the upper arm fixed at 90°, then return under control to the stretched starting position.",
    2],

  ["prone-incline-dumbbell-external-rotation", "setup",
    "Lie face-down on an incline bench, working arm hanging down with the elbow bent 90°, upper arm braced against the bench edge.",
    1],
  ["prone-incline-dumbbell-external-rotation", "execution",
    "Rotate the forearm upward and back, keeping the upper arm fixed against the bench throughout the rep.",
    2],

  ["band-internal-rotation", "setup",
    "Anchor a band at elbow height on the working side, elbow bent 90° and pinned to the side, forearm out to the side.",
    1],
  ["band-internal-rotation", "execution",
    "Rotate the forearm inward across the body while keeping the elbow pinned to the side.",
    2],

  ["cable-internal-rotation", "setup",
    "Stand side-on to a low cable pulley on the working side, elbow bent 90° and pinned to the side, forearm starting out to the side.",
    1],
  ["cable-internal-rotation", "execution",
    "Rotate the forearm inward across the body against the cable's resistance, keeping the elbow fixed at the side.",
    2],

  ["side-lying-dumbbell-internal-rotation", "setup",
    "Lie on the working side, elbow bent 90° and pinned to the ribcage, dumbbell held with the forearm raised toward the ceiling.",
    1],
  ["side-lying-dumbbell-internal-rotation", "execution",
    "Rotate the forearm down toward the stomach against gravity, keeping the elbow pinned to the ribcage throughout, then return under control.",
    2],

  ["band-internal-rotation-90-90", "setup",
    "Anchor a band at shoulder height on the opposite side, raise the working arm to 90° of abduction with the elbow bent 90°, forearm pointing up.",
    1],
  ["band-internal-rotation-90-90", "execution",
    "Rotate the forearm forward and down toward the floor while holding the upper arm fixed at 90° of abduction.",
    2],

  ["cable-internal-rotation-90-90", "setup",
    "Stand with the working arm raised to 90° of abduction, elbow bent 90°, cable set to a high pulley on the opposite side.",
    1],
  ["cable-internal-rotation-90-90", "execution",
    "Rotate the forearm forward and down toward the floor while holding the upper arm fixed at 90°, then return under control against the cable's resistance.",
    2],

];

// ─── EXERCISE RELATIONS ────────────────────────────────────────
// [source_slug, target_slug, relation_type, notes]

const RELATIONS: Array<[string, string, ExerciseRelationType, string]> = [

  // Lateral raise family
  ["standing-dumbbell-lateral-raise", "seated-dumbbell-lateral-raise", "same_pattern",
    "Removing the ability to lean back or use leg drive isolates the deltoid more strictly than the standing version."],
  ["standing-dumbbell-lateral-raise", "single-arm-dumbbell-lateral-raise", "contralateral",
    "The single-arm version trains each side independently and allows a light brace for extra strictness."],
  ["standing-dumbbell-lateral-raise", "cable-lateral-raise", "same_pattern",
    "Cable resistance maintains tension through the fully lowered position, which a dumbbell cannot load due to gravity's near-zero torque at the side."],
  ["cable-lateral-raise", "leaning-cable-lateral-raise", "progression",
    "Leaning away from the pulley increases the stretch-position loading substantially, a more advanced variation of the same movement."],
  ["leaning-cable-lateral-raise", "cable-lateral-raise", "regression",
    "Standing upright removes the added stretch-position overload, appropriate when the leaning variation's balance or shoulder demand is not yet appropriate."],
  ["cable-lateral-raise", "behind-the-back-cable-lateral-raise", "progression",
    "Routing the cable behind the body further increases the resistance at the fully adducted starting position beyond the leaning variation."],
  ["behind-the-back-cable-lateral-raise", "cable-lateral-raise", "regression",
    "The standard front-crossing cable path is a more accessible entry point before adding the behind-the-back stretch overload."],
  ["standing-dumbbell-lateral-raise", "machine-lateral-raise", "lower_joint_stress",
    "The guided arc removes the stabilization and momentum-control demand of a free dumbbell, appropriate for athletes managing shoulder impingement sensitivity."],
  ["standing-dumbbell-lateral-raise", "band-lateral-raise", "lower_joint_stress",
    "Band tension is lightest at the bottom and increases through the range, reducing peak joint stress at the vulnerable adducted starting position compared to a dumbbell that loads unevenly."],
  ["standing-dumbbell-lateral-raise", "dumbbell-scaption-raise", "lower_joint_stress",
    "Raising in the scapular plane rather than the pure frontal plane reduces subacromial impingement risk while training the same lateral deltoid target."],
  ["standing-dumbbell-lateral-raise", "dumbbell-lu-raise", "substitute",
    "The Lu raise's scapular-plane arc and brief bottom-range assist reduce impingement risk while allowing heavier effective loading than a strict lateral raise."],
  ["dumbbell-lu-raise", "cable-lu-raise", "same_pattern",
    "Cable resistance adds constant tension through the arc that a dumbbell cannot provide, particularly at the crossed starting position."],
  ["standing-dumbbell-lateral-raise", "side-lying-dumbbell-lateral-raise", "substitute",
    "The side-lying position loads the lateral deltoid at its stretched bottom length, a stimulus a standing dumbbell raise cannot provide since gravity creates almost no resistance there."],
  ["standing-dumbbell-lateral-raise", "incline-bench-lateral-raise", "lower_joint_stress",
    "Chest support removes the torso-swing momentum that is the most common technique fault and source of excess shoulder strain in a standing raise."],
  ["standing-dumbbell-lateral-raise", "partial-lateral-raise-top-half", "substitute",
    "Partial top-half reps isolate the peak-contraction position and are commonly used as a burnout finisher after a set of full-range raises."],
  ["seated-cable-lateral-raise", "cable-lateral-raise", "progression",
    "Standing reintroduces a mild core and balance demand once strict seated form is established."],
  ["cable-lateral-raise", "seated-cable-lateral-raise", "regression",
    "Removing the standing balance component isolates the deltoid more strictly, appropriate when standing form breaks down under fatigue."],
  ["cable-y-raise", "dumbbell-y-raise", "same_pattern",
    "The dumbbell version removes the cable's constant tension but is accessible without a dual-pulley station."],

  // Shoulder adduction family
  ["single-arm-cable-shoulder-adduction", "band-shoulder-adduction", "regression",
    "Band resistance is lighter and more forgiving through the range than a cable stack, a more accessible entry point for the same pattern."],
  ["band-shoulder-adduction", "single-arm-cable-shoulder-adduction", "progression",
    "The cable stack allows finer load increments and heavier progression once the band pattern is well controlled."],

  // External rotation family
  ["band-external-rotation", "cable-external-rotation", "substitute",
    "The cable provides more consistent resistance through the arc than a band's steadily increasing tension curve."],
  ["band-external-rotation", "band-external-rotation-90-90", "progression",
    "Elevating the arm to 90° of abduction increases the shoulder stabilization demand and more closely replicates the late-cocking position of an overhead throw."],
  ["band-external-rotation-90-90", "band-external-rotation", "regression",
    "Lowering the arm back to the side removes the added stabilization demand of the elevated position, appropriate for early-stage rotator cuff work."],
  ["band-external-rotation", "side-lying-dumbbell-external-rotation", "substitute",
    "Gravity-based dumbbell loading rather than band or cable tension is a useful way to vary the resistance profile within a rotator cuff program."],

  // Internal rotation family
  ["band-internal-rotation", "cable-internal-rotation", "substitute",
    "The cable provides more consistent resistance through the arc than a band's steadily increasing tension curve."],
  ["band-internal-rotation", "band-internal-rotation-90-90", "progression",
    "Elevating the arm to 90° of abduction increases the shoulder stabilization demand beyond the elbow-at-side position."],
  ["band-internal-rotation-90-90", "band-internal-rotation", "regression",
    "Lowering the arm back to the side removes the added stabilization demand of the elevated position."],

];

// ─── MAIN ─────────────────────────────────────────────────────

async function main() {
  console.log("\nCatalyst OS — Exercise Library Seed 007: Shoulders");
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
    "007 — Shoulders (32 exercises)",
  );

  console.log("─────────────────────────────────────────────────────────");
  console.log("Seed 007 complete.\n");
  await sql.end();
}

main().catch(async (err) => {
  console.error("\nSeed failed:", err instanceof Error ? err.message : err);
  await sql.end();
  process.exit(1);
});
