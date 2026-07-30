#!/usr/bin/env npx tsx
// ─────────────────────────────────────────────────────────────
// Catalyst OS — Exercise Library Seed 002: Upper Body Pull
//
// Usage:
//   source .env.local && npx tsx scripts/seeds/002-upper-pull.ts
//
// Covers:
//   Horizontal pull — barbell, dumbbell, cable, machine, bodyweight
//   Vertical pull — bodyweight, cable/machine (lat pulldown)
//   Rear deltoid & scapular retraction — cable, dumbbell, machine, band
//
// Count: 45 exercises
// Spec: docs/exercise-intelligence-spec.md
// ─────────────────────────────────────────────────────────────

import { SHARED_EQUIPMENT, db, sql, seedEquipment, seedExercises } from "./_shared";
import type { MuscleGroup, MuscleRole, EquipmentRequirement, ExerciseCueType, ExerciseRelationType } from "./_shared";

// ─── LOCAL EQUIPMENT ─────────────────────────────────────────
// Additions beyond SHARED_EQUIPMENT needed for this file.

const EQUIPMENT = [
  { slug: "assisted-pull-up-machine", name: "Assisted Pull-Up Machine", category: "machines" },
] as const;

// ─── EXERCISES ───────────────────────────────────────────────

const EXERCISES = [

  // ── Horizontal Pull: Barbell ──────────────────────────────

  { slug: "bent-over-barbell-row", name: "Bent-Over Barbell Row",
    movementPattern: "pull_horizontal" as const, classification: "compound" as const,
    resistanceType: "barbell" as const, difficulty: "intermediate" as const,
    fatigueCost: 6, technicalComplexity: 6, stabilityDemand: 6,
    jointStressShoulder: 4, jointStressElbow: 4, jointStressWrist: 3, jointStressSpine: 6, jointStressHip: 3,
    lengthenedBias: 6, stretchMediatedPotential: 6 },

  { slug: "pendlay-row", name: "Pendlay Row",
    movementPattern: "pull_horizontal" as const, classification: "compound" as const,
    resistanceType: "barbell" as const, difficulty: "advanced" as const,
    fatigueCost: 7, technicalComplexity: 7, stabilityDemand: 6,
    jointStressShoulder: 4, jointStressElbow: 4, jointStressWrist: 3, jointStressSpine: 7, jointStressHip: 4,
    lengthenedBias: 5, stretchMediatedPotential: 5 },

  { slug: "yates-row", name: "Yates Row",
    movementPattern: "pull_horizontal" as const, classification: "compound" as const,
    resistanceType: "barbell" as const, difficulty: "intermediate" as const,
    fatigueCost: 6, technicalComplexity: 6, stabilityDemand: 5,
    jointStressShoulder: 4, jointStressElbow: 4, jointStressWrist: 3, jointStressSpine: 5, jointStressHip: 2,
    lengthenedBias: 5, stretchMediatedPotential: 5 },

  { slug: "underhand-barbell-row", name: "Underhand Barbell Row",
    movementPattern: "pull_horizontal" as const, classification: "compound" as const,
    resistanceType: "barbell" as const, difficulty: "intermediate" as const,
    fatigueCost: 6, technicalComplexity: 6, stabilityDemand: 6,
    jointStressShoulder: 4, jointStressElbow: 5, jointStressWrist: 3, jointStressSpine: 6, jointStressHip: 3,
    lengthenedBias: 6, stretchMediatedPotential: 6 },

  { slug: "seal-row", name: "Seal Row",
    movementPattern: "pull_horizontal" as const, classification: "compound" as const,
    resistanceType: "barbell" as const, difficulty: "intermediate" as const,
    defaultBodyPosition: "lying_prone" as const,
    fatigueCost: 5, technicalComplexity: 4, stabilityDemand: 2,
    jointStressShoulder: 4, jointStressElbow: 4, jointStressWrist: 3,
    lengthenedBias: 7, stretchMediatedPotential: 7 },

  // ── Horizontal Pull: Dumbbell ────────────────────────────

  { slug: "single-arm-dumbbell-row", name: "Single-Arm Dumbbell Row",
    movementPattern: "pull_horizontal" as const, classification: "compound" as const,
    resistanceType: "dumbbell" as const, difficulty: "beginner" as const,
    unilateral: true, defaultBodyPosition: "split_stance" as const,
    fatigueCost: 5, technicalComplexity: 4, stabilityDemand: 5,
    jointStressShoulder: 4, jointStressElbow: 4, jointStressWrist: 2, jointStressSpine: 3,
    lengthenedBias: 7, stretchMediatedPotential: 7 },

  { slug: "chest-supported-dumbbell-row", name: "Chest-Supported Dumbbell Row",
    movementPattern: "pull_horizontal" as const, classification: "compound" as const,
    resistanceType: "dumbbell" as const, difficulty: "beginner" as const,
    defaultBodyPosition: "incline" as const,
    fatigueCost: 4, technicalComplexity: 3, stabilityDemand: 2,
    jointStressShoulder: 4, jointStressElbow: 4, jointStressWrist: 2,
    lengthenedBias: 7, stretchMediatedPotential: 7 },

  { slug: "kroc-row", name: "Kroc Row",
    movementPattern: "pull_horizontal" as const, classification: "compound" as const,
    resistanceType: "dumbbell" as const, difficulty: "advanced" as const,
    unilateral: true, defaultBodyPosition: "split_stance" as const,
    fatigueCost: 6, technicalComplexity: 5, stabilityDemand: 6,
    jointStressShoulder: 4, jointStressElbow: 4, jointStressWrist: 4, jointStressSpine: 4,
    lengthenedBias: 6, stretchMediatedPotential: 5 },

  { slug: "incline-dumbbell-row", name: "Incline Dumbbell Row",
    movementPattern: "pull_horizontal" as const, classification: "compound" as const,
    resistanceType: "dumbbell" as const, difficulty: "beginner" as const,
    defaultBodyPosition: "incline" as const,
    fatigueCost: 4, technicalComplexity: 3, stabilityDemand: 3,
    jointStressShoulder: 4, jointStressElbow: 4, jointStressWrist: 2, jointStressSpine: 1,
    lengthenedBias: 7, stretchMediatedPotential: 7 },

  { slug: "renegade-row", name: "Renegade Row",
    movementPattern: "pull_horizontal" as const, classification: "compound" as const,
    resistanceType: "dumbbell" as const, difficulty: "advanced" as const,
    unilateral: true, alternating: true,
    fatigueCost: 6, technicalComplexity: 7, stabilityDemand: 9,
    jointStressShoulder: 5, jointStressElbow: 4, jointStressWrist: 5, jointStressSpine: 5,
    lengthenedBias: 5, stretchMediatedPotential: 4 },

  // ── Horizontal Pull: Cable & Machine ─────────────────────

  { slug: "seated-cable-row", name: "Seated Cable Row",
    movementPattern: "pull_horizontal" as const, classification: "compound" as const,
    resistanceType: "cable" as const, difficulty: "beginner" as const,
    defaultBodyPosition: "seated" as const,
    fatigueCost: 4, technicalComplexity: 3, stabilityDemand: 3,
    jointStressShoulder: 3, jointStressElbow: 3, jointStressWrist: 2, jointStressSpine: 2,
    lengthenedBias: 6, shortenedBias: 7, stretchMediatedPotential: 6 },

  { slug: "wide-grip-seated-cable-row", name: "Wide-Grip Seated Cable Row",
    movementPattern: "pull_horizontal" as const, classification: "compound" as const,
    resistanceType: "cable" as const, difficulty: "beginner" as const,
    defaultBodyPosition: "seated" as const,
    fatigueCost: 4, technicalComplexity: 3, stabilityDemand: 3,
    jointStressShoulder: 4, jointStressElbow: 3, jointStressWrist: 2, jointStressSpine: 2,
    lengthenedBias: 6, shortenedBias: 6, stretchMediatedPotential: 6 },

  { slug: "close-grip-seated-cable-row", name: "Close-Grip Seated Cable Row",
    movementPattern: "pull_horizontal" as const, classification: "compound" as const,
    resistanceType: "cable" as const, difficulty: "beginner" as const,
    defaultBodyPosition: "seated" as const,
    fatigueCost: 4, technicalComplexity: 3, stabilityDemand: 3,
    jointStressShoulder: 3, jointStressElbow: 4, jointStressWrist: 2, jointStressSpine: 2,
    lengthenedBias: 6, shortenedBias: 7, stretchMediatedPotential: 6 },

  { slug: "underhand-seated-cable-row", name: "Underhand Seated Cable Row",
    movementPattern: "pull_horizontal" as const, classification: "compound" as const,
    resistanceType: "cable" as const, difficulty: "beginner" as const,
    defaultBodyPosition: "seated" as const,
    fatigueCost: 4, technicalComplexity: 3, stabilityDemand: 3,
    jointStressShoulder: 3, jointStressElbow: 4, jointStressWrist: 2, jointStressSpine: 2,
    lengthenedBias: 6, shortenedBias: 7, stretchMediatedPotential: 6 },

  { slug: "single-arm-cable-row", name: "Single-Arm Cable Row",
    movementPattern: "pull_horizontal" as const, classification: "compound" as const,
    resistanceType: "cable" as const, difficulty: "intermediate" as const,
    unilateral: true, defaultBodyPosition: "seated" as const,
    fatigueCost: 4, technicalComplexity: 4, stabilityDemand: 5,
    jointStressShoulder: 3, jointStressElbow: 3, jointStressWrist: 2, jointStressSpine: 3,
    lengthenedBias: 6, shortenedBias: 6, stretchMediatedPotential: 6 },

  { slug: "chest-supported-machine-row", name: "Chest-Supported Machine Row",
    movementPattern: "pull_horizontal" as const, classification: "compound" as const,
    resistanceType: "machine" as const, difficulty: "beginner" as const,
    defaultBodyPosition: "seated" as const,
    fatigueCost: 3, technicalComplexity: 2, stabilityDemand: 1,
    jointStressShoulder: 3, jointStressElbow: 3, jointStressWrist: 1,
    lengthenedBias: 6, shortenedBias: 6, stretchMediatedPotential: 6 },

  { slug: "t-bar-row", name: "T-Bar Row",
    movementPattern: "pull_horizontal" as const, classification: "compound" as const,
    resistanceType: "plate_loaded" as const, difficulty: "intermediate" as const,
    defaultBodyPosition: "standing" as const,
    fatigueCost: 6, technicalComplexity: 5, stabilityDemand: 5,
    jointStressShoulder: 4, jointStressElbow: 4, jointStressWrist: 3, jointStressSpine: 5, jointStressHip: 3,
    lengthenedBias: 6, shortenedBias: 6, stretchMediatedPotential: 6 },

  { slug: "landmine-row", name: "Landmine Row",
    movementPattern: "pull_horizontal" as const, classification: "compound" as const,
    resistanceType: "landmine" as const, difficulty: "intermediate" as const,
    unilateral: true, defaultBodyPosition: "standing" as const,
    fatigueCost: 5, technicalComplexity: 5, stabilityDemand: 6,
    jointStressShoulder: 4, jointStressElbow: 4, jointStressWrist: 3, jointStressSpine: 4, jointStressHip: 2,
    lengthenedBias: 6, shortenedBias: 6, stretchMediatedPotential: 6 },

  { slug: "meadows-row", name: "Meadows Row",
    movementPattern: "pull_horizontal" as const, classification: "compound" as const,
    resistanceType: "landmine" as const, difficulty: "advanced" as const,
    unilateral: true, defaultBodyPosition: "standing" as const,
    fatigueCost: 6, technicalComplexity: 6, stabilityDemand: 7,
    jointStressShoulder: 4, jointStressElbow: 4, jointStressWrist: 3, jointStressSpine: 4, jointStressHip: 3,
    lengthenedBias: 7, shortenedBias: 6, stretchMediatedPotential: 6 },

  // ── Horizontal Pull: Bodyweight ──────────────────────────

  { slug: "inverted-row", name: "Inverted Row",
    movementPattern: "pull_horizontal" as const, classification: "compound" as const,
    resistanceType: "bodyweight" as const, difficulty: "beginner" as const,
    defaultBodyPosition: "lying_supine" as const,
    fatigueCost: 4, technicalComplexity: 3, stabilityDemand: 4,
    jointStressShoulder: 3, jointStressElbow: 3, jointStressWrist: 2, jointStressSpine: 2,
    lengthenedBias: 6, shortenedBias: 6, stretchMediatedPotential: 6 },

  { slug: "feet-elevated-inverted-row", name: "Feet-Elevated Inverted Row",
    movementPattern: "pull_horizontal" as const, classification: "compound" as const,
    resistanceType: "bodyweight" as const, difficulty: "intermediate" as const,
    defaultBodyPosition: "lying_supine" as const,
    fatigueCost: 5, technicalComplexity: 4, stabilityDemand: 5,
    jointStressShoulder: 3, jointStressElbow: 3, jointStressWrist: 2, jointStressSpine: 3,
    lengthenedBias: 6, shortenedBias: 6, stretchMediatedPotential: 6 },

  { slug: "ring-row", name: "Ring Row",
    movementPattern: "pull_horizontal" as const, classification: "compound" as const,
    resistanceType: "suspension" as const, difficulty: "intermediate" as const,
    defaultBodyPosition: "lying_supine" as const,
    fatigueCost: 4, technicalComplexity: 4, stabilityDemand: 6,
    jointStressShoulder: 4, jointStressElbow: 3, jointStressWrist: 3, jointStressSpine: 3,
    lengthenedBias: 6, shortenedBias: 6, stretchMediatedPotential: 6 },

  { slug: "trx-row", name: "TRX Row",
    movementPattern: "pull_horizontal" as const, classification: "compound" as const,
    resistanceType: "suspension" as const, difficulty: "beginner" as const,
    defaultBodyPosition: "standing" as const,
    fatigueCost: 4, technicalComplexity: 3, stabilityDemand: 5,
    jointStressShoulder: 3, jointStressElbow: 3, jointStressWrist: 2, jointStressSpine: 2,
    lengthenedBias: 6, shortenedBias: 6, stretchMediatedPotential: 6 },

  // ── Vertical Pull: Bodyweight ─────────────────────────────

  { slug: "pull-up", name: "Pull-Up",
    movementPattern: "pull_vertical" as const, classification: "compound" as const,
    resistanceType: "bodyweight" as const, difficulty: "intermediate" as const,
    defaultBodyPosition: "hanging" as const,
    fatigueCost: 5, technicalComplexity: 5, stabilityDemand: 7,
    jointStressShoulder: 4, jointStressElbow: 4, jointStressWrist: 3, jointStressSpine: 2,
    lengthenedBias: 7, stretchMediatedPotential: 7 },

  { slug: "chin-up", name: "Chin-Up",
    movementPattern: "pull_vertical" as const, classification: "compound" as const,
    resistanceType: "bodyweight" as const, difficulty: "intermediate" as const,
    defaultBodyPosition: "hanging" as const,
    fatigueCost: 5, technicalComplexity: 5, stabilityDemand: 7,
    jointStressShoulder: 4, jointStressElbow: 5, jointStressWrist: 3, jointStressSpine: 2,
    lengthenedBias: 7, stretchMediatedPotential: 7 },

  { slug: "neutral-grip-pull-up", name: "Neutral-Grip Pull-Up",
    movementPattern: "pull_vertical" as const, classification: "compound" as const,
    resistanceType: "bodyweight" as const, difficulty: "intermediate" as const,
    defaultBodyPosition: "hanging" as const,
    fatigueCost: 5, technicalComplexity: 5, stabilityDemand: 7,
    jointStressShoulder: 4, jointStressElbow: 4, jointStressWrist: 3, jointStressSpine: 2,
    lengthenedBias: 7, stretchMediatedPotential: 7 },

  { slug: "wide-grip-pull-up", name: "Wide-Grip Pull-Up",
    movementPattern: "pull_vertical" as const, classification: "compound" as const,
    resistanceType: "bodyweight" as const, difficulty: "advanced" as const,
    defaultBodyPosition: "hanging" as const,
    fatigueCost: 5, technicalComplexity: 6, stabilityDemand: 7,
    jointStressShoulder: 5, jointStressElbow: 4, jointStressWrist: 3, jointStressSpine: 2,
    lengthenedBias: 6, stretchMediatedPotential: 6 },

  { slug: "commando-pull-up", name: "Commando Pull-Up",
    movementPattern: "pull_vertical" as const, classification: "compound" as const,
    resistanceType: "bodyweight" as const, difficulty: "advanced" as const,
    unilateral: true, alternating: true, defaultBodyPosition: "hanging" as const,
    fatigueCost: 6, technicalComplexity: 7, stabilityDemand: 8,
    jointStressShoulder: 5, jointStressElbow: 4, jointStressWrist: 4, jointStressSpine: 3,
    lengthenedBias: 6, stretchMediatedPotential: 6 },

  { slug: "weighted-pull-up", name: "Weighted Pull-Up",
    movementPattern: "pull_vertical" as const, classification: "compound" as const,
    resistanceType: "bodyweight" as const, difficulty: "advanced" as const,
    defaultBodyPosition: "hanging" as const,
    fatigueCost: 7, technicalComplexity: 6, stabilityDemand: 7,
    jointStressShoulder: 5, jointStressElbow: 4, jointStressWrist: 4, jointStressSpine: 3,
    lengthenedBias: 7, stretchMediatedPotential: 7 },

  { slug: "negative-pull-up", name: "Negative Pull-Up",
    movementPattern: "pull_vertical" as const, classification: "compound" as const,
    resistanceType: "bodyweight" as const, difficulty: "beginner" as const,
    defaultBodyPosition: "hanging" as const,
    fatigueCost: 4, technicalComplexity: 4, stabilityDemand: 6,
    jointStressShoulder: 4, jointStressElbow: 3, jointStressWrist: 3, jointStressSpine: 1,
    lengthenedBias: 8, shortenedBias: 4, stretchMediatedPotential: 8 },

  { slug: "assisted-pull-up", name: "Assisted Pull-Up",
    movementPattern: "pull_vertical" as const, classification: "compound" as const,
    resistanceType: "machine" as const, difficulty: "beginner" as const,
    defaultBodyPosition: "kneeling" as const,
    fatigueCost: 3, technicalComplexity: 3, stabilityDemand: 3,
    jointStressShoulder: 3, jointStressElbow: 3, jointStressWrist: 2, jointStressSpine: 1,
    lengthenedBias: 6, shortenedBias: 5, stretchMediatedPotential: 6 },

  { slug: "scapular-pull-up", name: "Scapular Pull-Up",
    movementPattern: "pull_vertical" as const, classification: "skill" as const,
    resistanceType: "bodyweight" as const, difficulty: "beginner" as const,
    defaultBodyPosition: "hanging" as const,
    fatigueCost: 2, technicalComplexity: 3, stabilityDemand: 5,
    jointStressShoulder: 2, jointStressWrist: 2,
    lengthenedBias: 3, shortenedBias: 5, stretchMediatedPotential: 2 },

  // ── Vertical Pull: Lat Pulldown & Cable ──────────────────

  { slug: "lat-pulldown", name: "Lat Pulldown",
    movementPattern: "pull_vertical" as const, classification: "compound" as const,
    resistanceType: "cable" as const, difficulty: "beginner" as const,
    defaultBodyPosition: "seated" as const,
    fatigueCost: 4, technicalComplexity: 3, stabilityDemand: 2,
    jointStressShoulder: 3, jointStressElbow: 3, jointStressWrist: 2, jointStressSpine: 4,
    lengthenedBias: 6, shortenedBias: 6, stretchMediatedPotential: 6 },

  { slug: "close-grip-lat-pulldown", name: "Close-Grip Lat Pulldown",
    movementPattern: "pull_vertical" as const, classification: "compound" as const,
    resistanceType: "cable" as const, difficulty: "beginner" as const,
    defaultBodyPosition: "seated" as const,
    fatigueCost: 4, technicalComplexity: 3, stabilityDemand: 2,
    jointStressShoulder: 3, jointStressElbow: 4, jointStressWrist: 2, jointStressSpine: 4,
    lengthenedBias: 6, shortenedBias: 7, stretchMediatedPotential: 6 },

  { slug: "underhand-lat-pulldown", name: "Underhand Lat Pulldown",
    movementPattern: "pull_vertical" as const, classification: "compound" as const,
    resistanceType: "cable" as const, difficulty: "beginner" as const,
    defaultBodyPosition: "seated" as const,
    fatigueCost: 4, technicalComplexity: 3, stabilityDemand: 2,
    jointStressShoulder: 3, jointStressElbow: 5, jointStressWrist: 2, jointStressSpine: 4,
    lengthenedBias: 6, shortenedBias: 7, stretchMediatedPotential: 6 },

  { slug: "single-arm-lat-pulldown", name: "Single-Arm Lat Pulldown",
    movementPattern: "pull_vertical" as const, classification: "compound" as const,
    resistanceType: "cable" as const, difficulty: "intermediate" as const,
    unilateral: true, defaultBodyPosition: "seated" as const,
    fatigueCost: 4, technicalComplexity: 4, stabilityDemand: 3,
    jointStressShoulder: 3, jointStressElbow: 4, jointStressWrist: 2, jointStressSpine: 4,
    lengthenedBias: 6, shortenedBias: 6, stretchMediatedPotential: 6 },

  { slug: "straight-arm-pulldown", name: "Straight-Arm Pulldown",
    movementPattern: "scapular_depression" as const, classification: "isolation" as const,
    resistanceType: "cable" as const, difficulty: "beginner" as const,
    defaultBodyPosition: "standing" as const,
    fatigueCost: 3, technicalComplexity: 3, stabilityDemand: 3,
    jointStressShoulder: 4, jointStressElbow: 1, jointStressWrist: 2, jointStressSpine: 2,
    lengthenedBias: 8, shortenedBias: 6, stretchMediatedPotential: 8 },

  // ── Rear Deltoid & Scapular Retraction ───────────────────

  { slug: "face-pull", name: "Face Pull",
    movementPattern: "scapular_retraction" as const, classification: "isolation" as const,
    resistanceType: "cable" as const, difficulty: "beginner" as const,
    defaultBodyPosition: "standing" as const,
    fatigueCost: 3, technicalComplexity: 3, stabilityDemand: 3,
    jointStressShoulder: 3, jointStressElbow: 2, jointStressWrist: 1, jointStressSpine: 1,
    lengthenedBias: 4, shortenedBias: 8, stretchMediatedPotential: 3 },

  { slug: "band-pull-apart", name: "Band Pull-Apart",
    movementPattern: "scapular_retraction" as const, classification: "isolation" as const,
    resistanceType: "band" as const, difficulty: "beginner" as const,
    defaultBodyPosition: "standing" as const,
    fatigueCost: 2, technicalComplexity: 2, stabilityDemand: 2,
    jointStressShoulder: 2, jointStressElbow: 1,
    lengthenedBias: 3, shortenedBias: 8, stretchMediatedPotential: 2 },

  { slug: "cable-rear-delt-fly", name: "Cable Rear Delt Fly",
    movementPattern: "shoulder_abduction" as const, classification: "isolation" as const,
    resistanceType: "cable" as const, difficulty: "beginner" as const,
    defaultBodyPosition: "standing" as const,
    fatigueCost: 3, technicalComplexity: 3, stabilityDemand: 3,
    jointStressShoulder: 4, jointStressElbow: 2,
    lengthenedBias: 5, shortenedBias: 8, stretchMediatedPotential: 5 },

  { slug: "dumbbell-rear-delt-fly", name: "Dumbbell Rear Delt Fly",
    movementPattern: "shoulder_abduction" as const, classification: "isolation" as const,
    resistanceType: "dumbbell" as const, difficulty: "beginner" as const,
    defaultBodyPosition: "hinge_position" as const,
    fatigueCost: 3, technicalComplexity: 3, stabilityDemand: 4,
    jointStressShoulder: 4, jointStressElbow: 2, jointStressSpine: 3,
    lengthenedBias: 5, shortenedBias: 8, stretchMediatedPotential: 5 },

  { slug: "machine-rear-delt-fly", name: "Machine Rear Delt Fly",
    movementPattern: "shoulder_abduction" as const, classification: "isolation" as const,
    resistanceType: "machine" as const, difficulty: "beginner" as const,
    defaultBodyPosition: "seated" as const,
    fatigueCost: 3, technicalComplexity: 1, stabilityDemand: 1,
    jointStressShoulder: 4, jointStressElbow: 2,
    lengthenedBias: 5, shortenedBias: 8, stretchMediatedPotential: 5 },

  { slug: "chest-supported-rear-delt-raise", name: "Chest-Supported Rear Delt Raise",
    movementPattern: "shoulder_abduction" as const, classification: "isolation" as const,
    resistanceType: "dumbbell" as const, difficulty: "beginner" as const,
    defaultBodyPosition: "incline" as const,
    fatigueCost: 3, technicalComplexity: 3, stabilityDemand: 2,
    jointStressShoulder: 4, jointStressElbow: 2,
    lengthenedBias: 5, shortenedBias: 8, stretchMediatedPotential: 5 },

  { slug: "incline-y-raise", name: "Incline Y-Raise",
    movementPattern: "scapular_retraction" as const, classification: "isolation" as const,
    resistanceType: "dumbbell" as const, difficulty: "intermediate" as const,
    defaultBodyPosition: "incline" as const,
    fatigueCost: 3, technicalComplexity: 4, stabilityDemand: 3,
    jointStressShoulder: 4, jointStressElbow: 1,
    lengthenedBias: 6, shortenedBias: 7, stretchMediatedPotential: 6 },

  { slug: "cable-high-row", name: "Cable High Row",
    movementPattern: "pull_horizontal" as const, classification: "compound" as const,
    resistanceType: "cable" as const, difficulty: "beginner" as const,
    defaultBodyPosition: "standing" as const,
    fatigueCost: 4, technicalComplexity: 3, stabilityDemand: 3,
    jointStressShoulder: 4, jointStressElbow: 3, jointStressSpine: 2,
    lengthenedBias: 6, shortenedBias: 7, stretchMediatedPotential: 6 },

] as const;

// ─── MUSCLES ─────────────────────────────────────────────────
// [slug, muscle_group, role]

const MUSCLES: Array<[string, MuscleGroup, MuscleRole]> = [

  // Barbell horizontal pull
  ["bent-over-barbell-row",        "lats",           "primary"],
  ["bent-over-barbell-row",        "rear_deltoid",   "secondary"],
  ["bent-over-barbell-row",        "biceps",         "secondary"],
  ["bent-over-barbell-row",        "spinal_erectors","stabilizer"],

  ["pendlay-row",                  "lats",           "primary"],
  ["pendlay-row",                  "rear_deltoid",   "secondary"],
  ["pendlay-row",                  "biceps",         "secondary"],
  ["pendlay-row",                  "spinal_erectors","stabilizer"],

  ["yates-row",                    "lats",           "primary"],
  ["yates-row",                    "rear_deltoid",   "secondary"],
  ["yates-row",                    "biceps",         "secondary"],
  ["yates-row",                    "spinal_erectors","stabilizer"],

  ["underhand-barbell-row",        "lats",           "primary"],
  ["underhand-barbell-row",        "biceps",         "secondary"],
  ["underhand-barbell-row",        "rear_deltoid",   "secondary"],
  ["underhand-barbell-row",        "spinal_erectors","stabilizer"],

  ["seal-row",                     "lats",           "primary"],
  ["seal-row",                     "rear_deltoid",   "secondary"],
  ["seal-row",                     "biceps",         "secondary"],

  // Dumbbell horizontal pull
  ["single-arm-dumbbell-row",      "lats",           "primary"],
  ["single-arm-dumbbell-row",      "rear_deltoid",   "secondary"],
  ["single-arm-dumbbell-row",      "biceps",         "secondary"],
  ["single-arm-dumbbell-row",      "obliques",       "stabilizer"],

  ["chest-supported-dumbbell-row", "lats",           "primary"],
  ["chest-supported-dumbbell-row", "rear_deltoid",   "secondary"],
  ["chest-supported-dumbbell-row", "biceps",         "secondary"],

  ["kroc-row",                     "lats",           "primary"],
  ["kroc-row",                     "rear_deltoid",   "secondary"],
  ["kroc-row",                     "biceps",         "secondary"],
  ["kroc-row",                     "obliques",       "stabilizer"],
  ["kroc-row",                     "forearms",       "stabilizer"],

  ["incline-dumbbell-row",         "lats",           "primary"],
  ["incline-dumbbell-row",         "rear_deltoid",   "secondary"],
  ["incline-dumbbell-row",         "biceps",         "secondary"],

  ["renegade-row",                 "lats",           "primary"],
  ["renegade-row",                 "rear_deltoid",   "secondary"],
  ["renegade-row",                 "biceps",         "secondary"],
  ["renegade-row",                 "transverse_abdominis", "stabilizer"],
  ["renegade-row",                 "obliques",       "stabilizer"],

  // Cable & machine horizontal pull
  ["seated-cable-row",             "lats",           "primary"],
  ["seated-cable-row",             "rear_deltoid",   "secondary"],
  ["seated-cable-row",             "biceps",         "secondary"],

  ["wide-grip-seated-cable-row",   "upper_back",     "primary"],
  ["wide-grip-seated-cable-row",   "rhomboids",      "secondary"],
  ["wide-grip-seated-cable-row",   "rear_deltoid",   "secondary"],
  ["wide-grip-seated-cable-row",   "biceps",         "secondary"],

  ["close-grip-seated-cable-row",  "lats",           "primary"],
  ["close-grip-seated-cable-row",  "biceps",         "secondary"],
  ["close-grip-seated-cable-row",  "rear_deltoid",   "secondary"],

  ["underhand-seated-cable-row",   "lats",           "primary"],
  ["underhand-seated-cable-row",   "biceps",         "secondary"],
  ["underhand-seated-cable-row",   "rear_deltoid",   "secondary"],

  ["single-arm-cable-row",         "lats",           "primary"],
  ["single-arm-cable-row",         "rear_deltoid",   "secondary"],
  ["single-arm-cable-row",         "biceps",         "secondary"],
  ["single-arm-cable-row",         "obliques",       "stabilizer"],

  ["chest-supported-machine-row",  "lats",           "primary"],
  ["chest-supported-machine-row",  "rear_deltoid",   "secondary"],
  ["chest-supported-machine-row",  "biceps",         "secondary"],

  ["t-bar-row",                    "lats",           "primary"],
  ["t-bar-row",                    "rear_deltoid",   "secondary"],
  ["t-bar-row",                    "biceps",         "secondary"],
  ["t-bar-row",                    "spinal_erectors","stabilizer"],

  ["landmine-row",                 "lats",           "primary"],
  ["landmine-row",                 "rear_deltoid",   "secondary"],
  ["landmine-row",                 "biceps",         "secondary"],
  ["landmine-row",                 "obliques",       "stabilizer"],

  ["meadows-row",                  "lats",           "primary"],
  ["meadows-row",                  "rear_deltoid",   "secondary"],
  ["meadows-row",                  "biceps",         "secondary"],
  ["meadows-row",                  "obliques",       "stabilizer"],

  // Bodyweight horizontal pull
  ["inverted-row",                 "lats",           "primary"],
  ["inverted-row",                 "rear_deltoid",   "secondary"],
  ["inverted-row",                 "biceps",         "secondary"],
  ["inverted-row",                 "transverse_abdominis", "stabilizer"],

  ["feet-elevated-inverted-row",   "lats",           "primary"],
  ["feet-elevated-inverted-row",   "rear_deltoid",   "secondary"],
  ["feet-elevated-inverted-row",   "biceps",         "secondary"],
  ["feet-elevated-inverted-row",   "transverse_abdominis", "stabilizer"],

  ["ring-row",                     "lats",           "primary"],
  ["ring-row",                     "rear_deltoid",   "secondary"],
  ["ring-row",                     "biceps",         "secondary"],
  ["ring-row",                     "transverse_abdominis", "stabilizer"],

  ["trx-row",                      "lats",           "primary"],
  ["trx-row",                      "rear_deltoid",   "secondary"],
  ["trx-row",                      "biceps",         "secondary"],
  ["trx-row",                      "transverse_abdominis", "stabilizer"],

  // Vertical pull: bodyweight
  ["pull-up",                      "lats",           "primary"],
  ["pull-up",                      "rear_deltoid",   "secondary"],
  ["pull-up",                      "biceps",         "secondary"],
  ["pull-up",                      "transverse_abdominis", "stabilizer"],

  ["chin-up",                      "lats",           "primary"],
  ["chin-up",                      "biceps",         "secondary"],
  ["chin-up",                      "rear_deltoid",   "secondary"],
  ["chin-up",                      "transverse_abdominis", "stabilizer"],

  ["neutral-grip-pull-up",         "lats",           "primary"],
  ["neutral-grip-pull-up",         "rear_deltoid",   "secondary"],
  ["neutral-grip-pull-up",         "biceps",         "secondary"],
  ["neutral-grip-pull-up",         "transverse_abdominis", "stabilizer"],

  ["wide-grip-pull-up",            "lats",           "primary"],
  ["wide-grip-pull-up",            "rear_deltoid",   "secondary"],
  ["wide-grip-pull-up",            "upper_back",     "secondary"],

  ["commando-pull-up",             "lats",           "primary"],
  ["commando-pull-up",             "biceps",         "secondary"],
  ["commando-pull-up",             "rear_deltoid",   "secondary"],
  ["commando-pull-up",             "obliques",       "stabilizer"],
  ["commando-pull-up",             "transverse_abdominis", "stabilizer"],

  ["weighted-pull-up",             "lats",           "primary"],
  ["weighted-pull-up",             "rear_deltoid",   "secondary"],
  ["weighted-pull-up",             "biceps",         "secondary"],
  ["weighted-pull-up",             "transverse_abdominis", "stabilizer"],

  ["negative-pull-up",             "lats",           "primary"],
  ["negative-pull-up",             "rear_deltoid",   "secondary"],
  ["negative-pull-up",             "biceps",         "secondary"],

  ["assisted-pull-up",             "lats",           "primary"],
  ["assisted-pull-up",             "rear_deltoid",   "secondary"],
  ["assisted-pull-up",             "biceps",         "secondary"],

  ["scapular-pull-up",             "trapezius",      "primary"],
  ["scapular-pull-up",             "lats",           "secondary"],
  ["scapular-pull-up",             "rhomboids",      "secondary"],

  // Vertical pull: lat pulldown & cable
  ["lat-pulldown",                 "lats",           "primary"],
  ["lat-pulldown",                 "rear_deltoid",   "secondary"],
  ["lat-pulldown",                 "biceps",         "secondary"],

  ["close-grip-lat-pulldown",      "lats",           "primary"],
  ["close-grip-lat-pulldown",      "biceps",         "secondary"],
  ["close-grip-lat-pulldown",      "rear_deltoid",   "secondary"],

  ["underhand-lat-pulldown",       "lats",           "primary"],
  ["underhand-lat-pulldown",       "biceps",         "secondary"],
  ["underhand-lat-pulldown",       "rear_deltoid",   "secondary"],

  ["single-arm-lat-pulldown",      "lats",           "primary"],
  ["single-arm-lat-pulldown",      "rear_deltoid",   "secondary"],
  ["single-arm-lat-pulldown",      "biceps",         "secondary"],
  ["single-arm-lat-pulldown",      "obliques",       "stabilizer"],

  ["straight-arm-pulldown",        "lats",           "primary"],
  ["straight-arm-pulldown",        "triceps",        "secondary"],

  // Rear deltoid & scapular retraction
  ["face-pull",                    "rear_deltoid",   "primary"],
  ["face-pull",                    "trapezius",      "secondary"],
  ["face-pull",                    "rhomboids",      "secondary"],

  ["band-pull-apart",              "rear_deltoid",   "primary"],
  ["band-pull-apart",              "rhomboids",      "secondary"],
  ["band-pull-apart",              "trapezius",      "secondary"],

  ["cable-rear-delt-fly",          "rear_deltoid",   "primary"],
  ["cable-rear-delt-fly",          "rhomboids",      "secondary"],
  ["cable-rear-delt-fly",          "trapezius",      "secondary"],

  ["dumbbell-rear-delt-fly",       "rear_deltoid",   "primary"],
  ["dumbbell-rear-delt-fly",       "rhomboids",      "secondary"],
  ["dumbbell-rear-delt-fly",       "trapezius",      "secondary"],

  ["machine-rear-delt-fly",        "rear_deltoid",   "primary"],
  ["machine-rear-delt-fly",        "rhomboids",      "secondary"],

  ["chest-supported-rear-delt-raise","rear_deltoid", "primary"],
  ["chest-supported-rear-delt-raise","rhomboids",    "secondary"],
  ["chest-supported-rear-delt-raise","trapezius",    "secondary"],

  ["incline-y-raise",              "trapezius",      "primary"],
  ["incline-y-raise",              "rear_deltoid",   "secondary"],

  ["cable-high-row",               "upper_back",     "primary"],
  ["cable-high-row",               "rhomboids",      "secondary"],
  ["cable-high-row",               "rear_deltoid",   "secondary"],
  ["cable-high-row",               "trapezius",      "secondary"],
];

// ─── EQUIPMENT LINKS ─────────────────────────────────────────
// [exercise_slug, equipment_slug, requirement_type]

const EXERCISE_EQUIPMENT: Array<[string, string, EquipmentRequirement]> = [
  ["bent-over-barbell-row",         "barbell",           "required"],
  ["pendlay-row",                   "barbell",           "required"],
  ["yates-row",                     "barbell",           "required"],
  ["underhand-barbell-row",         "barbell",           "required"],
  ["seal-row",                      "barbell",           "required"],
  ["seal-row",                      "adjustable-bench",  "required"],
  ["single-arm-dumbbell-row",       "dumbbells",         "required"],
  ["single-arm-dumbbell-row",       "flat-bench",        "required"],
  ["chest-supported-dumbbell-row",  "dumbbells",         "required"],
  ["chest-supported-dumbbell-row",  "adjustable-bench",  "required"],
  ["kroc-row",                      "dumbbells",         "required"],
  ["kroc-row",                      "flat-bench",        "required"],
  ["incline-dumbbell-row",          "dumbbells",         "required"],
  ["incline-dumbbell-row",          "adjustable-bench",  "required"],
  ["renegade-row",                  "dumbbells",         "required"],
  ["seated-cable-row",              "cable-station",     "required"],
  ["wide-grip-seated-cable-row",    "cable-station",     "required"],
  ["close-grip-seated-cable-row",   "cable-station",     "required"],
  ["underhand-seated-cable-row",    "cable-station",     "required"],
  ["single-arm-cable-row",          "cable-station",     "required"],
  ["chest-supported-machine-row",   "machine-row",       "required"],
  ["t-bar-row",                     "barbell",           "required"],
  ["t-bar-row",                     "landmine-attachment","required"],
  ["landmine-row",                  "barbell",           "required"],
  ["landmine-row",                  "landmine-attachment","required"],
  ["meadows-row",                   "barbell",           "required"],
  ["meadows-row",                   "landmine-attachment","required"],
  ["inverted-row",                  "barbell",           "required"],
  ["inverted-row",                  "power-rack",        "required"],
  ["feet-elevated-inverted-row",    "barbell",           "required"],
  ["feet-elevated-inverted-row",    "power-rack",        "required"],
  ["ring-row",                      "rings",             "required"],
  ["trx-row",                       "suspension-trainer","required"],
  ["pull-up",                       "pull-up-bar",       "required"],
  ["chin-up",                       "pull-up-bar",       "required"],
  ["neutral-grip-pull-up",          "pull-up-bar",       "required"],
  ["wide-grip-pull-up",             "pull-up-bar",       "required"],
  ["commando-pull-up",              "pull-up-bar",       "required"],
  ["weighted-pull-up",              "pull-up-bar",       "required"],
  ["negative-pull-up",              "pull-up-bar",       "required"],
  ["assisted-pull-up",              "assisted-pull-up-machine","required"],
  ["scapular-pull-up",              "pull-up-bar",       "required"],
  ["lat-pulldown",                  "lat-pulldown-machine","required"],
  ["close-grip-lat-pulldown",       "lat-pulldown-machine","required"],
  ["underhand-lat-pulldown",        "lat-pulldown-machine","required"],
  ["single-arm-lat-pulldown",       "cable-station",     "required"],
  ["straight-arm-pulldown",         "cable-station",     "required"],
  ["face-pull",                     "cable-station",     "required"],
  ["band-pull-apart",               "resistance-band",   "required"],
  ["cable-rear-delt-fly",           "cable-station",     "required"],
  ["dumbbell-rear-delt-fly",        "dumbbells",         "required"],
  ["machine-rear-delt-fly",         "machine-rear-delt-fly","required"],
  ["chest-supported-rear-delt-raise","dumbbells",        "required"],
  ["chest-supported-rear-delt-raise","adjustable-bench", "required"],
  ["incline-y-raise",               "dumbbells",         "required"],
  ["incline-y-raise",               "adjustable-bench",  "required"],
  ["cable-high-row",                "cable-station",     "required"],
];

// ─── COACHING CUES ───────────────────────────────────────────
// [slug, cue_type, content, order_index]

const CUES: Array<[string, ExerciseCueType, string, number]> = [

  ["bent-over-barbell-row", "setup",
    "Hinge at the hips to roughly 45° with a soft knee bend. Grip just outside shoulder-width. Let the bar hang at arm's length below the shoulders before the first pull.",
    1],
  ["bent-over-barbell-row", "execution",
    "Pull the bar to the lower ribcage, driving elbows back and up. Keep the torso angle fixed throughout the set — the row happens at the shoulder, not the hips.",
    2],
  ["bent-over-barbell-row", "common_error",
    "Torso rising toward vertical on each rep: turns the row into a partial deadlift and shifts load off the lats onto the lower back. Lock the hip hinge angle before the first pull.",
    3],

  ["pendlay-row", "setup",
    "Set up as a bent-over row but with the torso closer to parallel with the floor. The bar starts on the floor for every rep — no resting tension between sets.",
    1],
  ["pendlay-row", "execution",
    "Pull explosively off the floor to the lower ribcage, then return the bar fully to the floor before the next rep. Reset your brace each time.",
    2],

  ["seal-row", "setup",
    "Lie prone on a raised, elevated bench with a barbell hanging beneath. Chest and hips stay in contact with the bench for the entire set.",
    1],
  ["seal-row", "execution",
    "Pull the bar to the bench without any leg drive, hip movement, or momentum available. This strict isolation makes it easy to progressively overload the lats without spinal loading.",
    2],

  ["single-arm-dumbbell-row", "setup",
    "Support your weight with one hand and one knee on a bench. Keep the spine neutral and roughly parallel to the floor.",
    1],
  ["single-arm-dumbbell-row", "execution",
    "Pull the dumbbell to the hip, not the armpit — driving the elbow back and slightly up. Avoid rotating the torso to help the weight up.",
    2],

  ["chest-supported-dumbbell-row", "setup",
    "Lie chest-down on an incline bench set to 30–45°, dumbbells hanging at arm's length below the shoulders.",
    1],
  ["chest-supported-dumbbell-row", "execution",
    "Pull both dumbbells to the ribcage without any body English — the bench eliminates momentum entirely, isolating the back musculature.",
    2],

  ["seated-cable-row", "setup",
    "Sit with knees slightly bent, feet braced on the platform. Sit tall with a neutral spine before initiating the first pull.",
    1],
  ["seated-cable-row", "execution",
    "Pull the handle to the torso while keeping the torso still — avoid rocking backward to add momentum. Squeeze the shoulder blades together at the end range.",
    2],
  ["seated-cable-row", "common_error",
    "Excessive torso lean-back on each rep: substitutes lower back extension for lat and mid-back contraction. Keep the movement isolated to the arms and shoulder blades.",
    3],

  ["t-bar-row", "setup",
    "Straddle the bar with a hip-hinge stance similar to a bent-over barbell row. Use a V-handle or parallel-grip attachment.",
    1],
  ["t-bar-row", "execution",
    "Pull the bar to the sternum, driving elbows back. The fixed bar path makes this a reliable option for progressive overload without the balance demand of a free barbell row.",
    2],

  ["meadows-row", "setup",
    "Stand perpendicular to a landmine-anchored barbell, feet staggered. Grip near the sleeve with one hand, torso hinged forward.",
    1],
  ["meadows-row", "execution",
    "Row the bar up and back in the arc defined by the landmine pivot. The unilateral, off-center loading demands significant core stabilization through the set.",
    2],

  ["inverted-row", "setup",
    "Set a bar in a rack at a height matched to your ability — higher is easier, lower is harder. Grip just outside shoulder-width, body rigid in a straight line from ankles to shoulders.",
    1],
  ["inverted-row", "execution",
    "Pull your chest to the bar, keeping the body rigid throughout — no sagging hips or piking at the waist. Lower under control to a full stretch.",
    2],

  ["pull-up", "setup",
    "Grip the bar just outside shoulder-width, palms facing away. Start from a full dead hang with shoulder blades relaxed.",
    1],
  ["pull-up", "execution",
    "Pull your chin over the bar by driving the elbows down and back, not just bending the arms. Lower under control to a complete dead hang each rep.",
    2],
  ["pull-up", "common_error",
    "Kipping or using leg swing to generate momentum: removes tension from the lats and increases shoulder injury risk under load. Keep the body still and controlled unless training kipping intentionally.",
    3],

  ["chin-up", "setup",
    "Grip shoulder-width or slightly narrower, palms facing you. Start from a full dead hang.",
    1],
  ["chin-up", "execution",
    "Pull your chin over the bar, keeping elbows tracking close to the torso. The supinated grip allows greater biceps contribution than a pronated pull-up.",
    2],

  ["weighted-pull-up", "setup",
    "Attach load via a dip belt or between the feet. Start from a full dead hang — do not begin the set from a partial hang to avoid strict standards.",
    1],
  ["weighted-pull-up", "execution",
    "Maintain the same strict form as a bodyweight pull-up. If form breaks down under the added load, reduce weight rather than sacrificing range of motion.",
    2],

  ["negative-pull-up", "setup",
    "Jump or step up to the top position, chin over the bar. This is the entry point for athletes who cannot yet perform a full unassisted pull-up.",
    1],
  ["negative-pull-up", "execution",
    "Lower yourself as slowly as possible — aim for 4–6 seconds to a full dead hang. The eccentric-only pattern builds the strength needed for the concentric.",
    2],

  ["commando-pull-up", "setup",
    "Grip the bar with hands close together, one in front of the other, body oriented sideways to the bar.",
    1],
  ["commando-pull-up", "execution",
    "Pull your head to one side of the bar, lower fully, then pull to the opposite side on the next rep. The alternating pattern adds significant rotational core demand.",
    2],

  ["lat-pulldown", "setup",
    "Sit with thighs secured under the pad. Grip the bar wide, palms facing away. Lean back slightly — no more than 10–15° from vertical.",
    1],
  ["lat-pulldown", "execution",
    "Pull the bar to the upper chest, driving elbows down and back. Control the return to a full stretch at the top — don't let the weight stack slam.",
    2],

  ["straight-arm-pulldown", "setup",
    "Stand facing a high cable pulley with a straight bar or rope attachment. Arms extended, slight bend at the elbow that stays fixed throughout.",
    1],
  ["straight-arm-pulldown", "execution",
    "Pull the bar down in an arc to the thighs using only shoulder extension — the elbows do not bend further during the movement. This isolates the lats without elbow flexor involvement.",
    2],

  ["face-pull", "setup",
    "Set the cable to upper-chest or head height with a rope attachment. Stand back far enough to keep tension through the full range.",
    1],
  ["face-pull", "execution",
    "Pull the rope toward your face, splitting the ends apart and driving your hands back so your thumbs finish near your ears. Externally rotate at the top.",
    2],
  ["face-pull", "mental_cue",
    "Pull your hands apart, not just back.",
    3],

  ["band-pull-apart", "setup",
    "Hold a resistance band at shoulder height with arms extended in front of you, hands shoulder-width apart.",
    1],
  ["band-pull-apart", "execution",
    "Pull the band apart by driving the shoulder blades together, keeping the arms straight throughout. Control the return — don't let the band snap back.",
    2],

  ["dumbbell-rear-delt-fly", "setup",
    "Hinge forward at the hips until the torso is close to parallel with the floor. Dumbbells hang below the shoulders with a slight elbow bend that stays fixed.",
    1],
  ["dumbbell-rear-delt-fly", "execution",
    "Raise the dumbbells out to the sides in an arc, leading with the elbows. Stop when the arms are roughly parallel to the floor — going higher shifts load to the trapezius.",
    2],

  ["scapular-pull-up", "setup",
    "Hang from the bar with straight arms, shoulders relaxed and fully shrugged up toward the ears.",
    1],
  ["scapular-pull-up", "execution",
    "Without bending the elbows, depress and retract the shoulder blades to lift the body a few inches. This builds the scapular control that underpins a strong pull-up.",
    2],

  ["cable-high-row", "setup",
    "Set the cable to chest height with a straight bar or rope. Stand facing the anchor point, feet staggered for a stable base.",
    1],
  ["cable-high-row", "execution",
    "Pull the handle toward the upper chest with elbows flared out to the sides. This angle emphasizes the mid-back and rear deltoid more than a standard low row.",
    2],
];

// ─── EXERCISE RELATIONS ────────────────────────────────────────
// [source_slug, target_slug, relation_type, notes]

const RELATIONS: Array<[string, string, ExerciseRelationType, string]> = [

  // Bent-over barbell row family
  ["bent-over-barbell-row", "single-arm-dumbbell-row", "lower_joint_stress",
    "Bench support on the free hand removes the isometric spinal-stabilization demand of the bent-over barbell position — appropriate for athletes managing low back sensitivity."],
  ["bent-over-barbell-row", "chest-supported-machine-row", "lower_joint_stress",
    "Chest support eliminates spinal loading entirely, isolating the lats and mid-back without any lower back demand."],
  ["bent-over-barbell-row", "seal-row", "lower_joint_stress",
    "Prone chest support removes spinal stabilization while preserving strict, momentum-free tension on the target musculature."],
  ["bent-over-barbell-row", "pendlay-row", "same_pattern",
    "Dead-stop variation from the floor each rep — removes the stretch reflex and increases starting-strength demand out of the bottom."],
  ["bent-over-barbell-row", "yates-row", "same_pattern",
    "More upright torso angle shifts emphasis toward the upper back and reduces spinal shear relative to a traditional 90° bent-over position."],
  ["bent-over-barbell-row", "t-bar-row", "same_pattern",
    "Fixed landmine bar path preserves the bent-over hip-hinge loading pattern while removing the balance demand of a free barbell."],

  // Dumbbell row family
  ["chest-supported-dumbbell-row", "single-arm-dumbbell-row", "contralateral",
    "Single-arm version isolates each side independently, allowing focused correction of left-right strength asymmetries and adding rotational core demand."],

  // Pull-up progression chain
  ["pull-up", "lat-pulldown", "progression",
    "Pull-up is a progression of the lat pulldown pattern — once an athlete can pull bodyweight for target reps, transition from pulldown to unassisted pull-up."],
  ["lat-pulldown", "pull-up", "regression",
    "Lat pulldown allows precise load reduction below bodyweight — the standard regression path for athletes not yet able to perform a full pull-up."],
  ["weighted-pull-up", "pull-up", "progression",
    "Weighted pull-up is a progression of the standard bodyweight pull-up — add external load once bodyweight reps consistently exceed 10–12."],
  ["pull-up", "weighted-pull-up", "regression",
    "Standard bodyweight pull-up is the regression path once weighted load must be removed due to fatigue, deload, or joint sensitivity."],
  ["pull-up", "negative-pull-up", "regression",
    "Negative-only pull-ups build eccentric strength as the primary regression pathway toward a full unassisted concentric pull-up."],
  ["negative-pull-up", "pull-up", "progression",
    "Pull-up is a progression of the negative-only pattern — once the concentric can be completed unassisted, progress to full reps."],
  ["pull-up", "assisted-pull-up", "regression",
    "Assisted pull-up machine removes a fixed portion of bodyweight, providing a steppable regression path with precise load control."],
  ["assisted-pull-up", "pull-up", "progression",
    "Pull-up is a progression of the assisted pattern — reduce assistance incrementally until bodyweight is fully unsupported."],
  ["pull-up", "chin-up", "same_pattern",
    "Supinated grip shifts emphasis toward biceps and lower lats; typically allows slightly higher load than a pronated pull-up."],
  ["pull-up", "commando-pull-up", "same_pattern",
    "Adds an alternating side-to-side path and unilateral loading — significantly higher rotational core and grip demand than a standard pull-up."],

  // Lat pulldown family
  ["lat-pulldown", "close-grip-lat-pulldown", "same_pattern",
    "Same vertical pull pattern with a neutral grip — reduces shoulder stress and increases biceps and lower-lat contribution."],
  ["lat-pulldown", "single-arm-lat-pulldown", "contralateral",
    "Single-arm version trains each lat independently and adds anti-rotation core demand not present in the bilateral pattern."],
  ["straight-arm-pulldown", "lat-pulldown", "lower_joint_stress",
    "Straight-arm pulldown isolates the lats through shoulder extension alone, eliminating elbow flexion demand — useful for building mind-muscle connection or managing elbow tendinopathy."],

  // Rear delt / scapular family
  ["face-pull", "band-pull-apart", "same_pattern",
    "Both train scapular retraction and external rotation; band pull-apart requires no cable station and is well suited to warm-ups or home use."],
  ["dumbbell-rear-delt-fly", "cable-rear-delt-fly", "same_pattern",
    "Cable variation maintains constant tension through the full range, unlike dumbbells which lose tension near the top of the arc."],
  ["dumbbell-rear-delt-fly", "machine-rear-delt-fly", "lower_joint_stress",
    "Machine-guided path removes the balance and lower-back stabilization demand of the bent-over dumbbell position."],
];

// ─── MAIN ─────────────────────────────────────────────────────

async function main() {
  console.log("\nCatalyst OS — Exercise Library Seed 002: Upper Body Pull");
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
    "002 — Upper Body Pull (45 exercises)",
  );

  console.log("─────────────────────────────────────────────────────────");
  console.log("Seed 002 complete.\n");
  await sql.end();
}

main().catch(async (err) => {
  console.error("\nSeed failed:", err instanceof Error ? err.message : err);
  await sql.end();
  process.exit(1);
});
