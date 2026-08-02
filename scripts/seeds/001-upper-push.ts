#!/usr/bin/env npx tsx
// ─────────────────────────────────────────────────────────────
// Catalyst OS — Exercise Library Seed 001: Upper Body Push
//
// Usage:
//   set -a && source .env.local && set +a && npx tsx scripts/seeds/001-upper-push.ts
//
// Covers:
//   Horizontal push — barbell, dumbbell, cable, machine, bodyweight
//   Vertical push — barbell, dumbbell, machine, landmine, bodyweight
//
// Count: 53 exercises
// Spec: docs/exercise-intelligence-spec.md
// ─────────────────────────────────────────────────────────────

import { SHARED_EQUIPMENT, db, sql, seedEquipment, seedExercises } from "./_shared";
import type { MuscleGroup, MuscleRole, EquipmentRequirement, ExerciseCueType, ExerciseRelationType } from "./_shared";

// ─── EXERCISES ───────────────────────────────────────────────

const EXERCISES = [

  // ── Horizontal Push: Barbell ──────────────────────────────

  { slug: "barbell-bench-press", name: "Barbell Bench Press",
    movementPattern: "push_horizontal" as const, classification: "compound" as const,
    resistanceType: "barbell" as const, difficulty: "intermediate" as const,
    fatigueCost: 7, technicalComplexity: 5, stabilityDemand: 5,
    jointStressShoulder: 5, jointStressElbow: 3, jointStressSpine: 3,
    lengthenedBias: 6, stretchMediatedPotential: 6 },

  { slug: "incline-barbell-bench-press", name: "Incline Barbell Bench Press",
    movementPattern: "push_horizontal" as const, classification: "compound" as const,
    resistanceType: "barbell" as const, difficulty: "intermediate" as const,
    fatigueCost: 7, technicalComplexity: 5, stabilityDemand: 5,
    jointStressShoulder: 6, jointStressElbow: 3, jointStressSpine: 3,
    lengthenedBias: 7, stretchMediatedPotential: 7 },

  { slug: "decline-barbell-bench-press", name: "Decline Barbell Bench Press",
    movementPattern: "push_horizontal" as const, classification: "compound" as const,
    resistanceType: "barbell" as const, difficulty: "intermediate" as const,
    defaultBodyPosition: "decline" as const,
    fatigueCost: 7, technicalComplexity: 5, stabilityDemand: 5,
    jointStressShoulder: 4, jointStressElbow: 3, jointStressSpine: 3,
    lengthenedBias: 5, stretchMediatedPotential: 5 },

  { slug: "close-grip-bench-press", name: "Close-Grip Bench Press",
    movementPattern: "push_horizontal" as const, classification: "compound" as const,
    resistanceType: "barbell" as const, difficulty: "intermediate" as const,
    fatigueCost: 7, technicalComplexity: 5, stabilityDemand: 5,
    jointStressShoulder: 4, jointStressElbow: 5, jointStressSpine: 3,
    lengthenedBias: 5, stretchMediatedPotential: 4 },

  { slug: "pause-bench-press", name: "Pause Bench Press",
    movementPattern: "push_horizontal" as const, classification: "compound" as const,
    resistanceType: "barbell" as const, difficulty: "intermediate" as const,
    fatigueCost: 7, technicalComplexity: 6, stabilityDemand: 5,
    jointStressShoulder: 5, jointStressElbow: 3, jointStressSpine: 3,
    lengthenedBias: 8, stretchMediatedPotential: 7 },

  { slug: "barbell-floor-press", name: "Barbell Floor Press",
    movementPattern: "push_horizontal" as const, classification: "compound" as const,
    resistanceType: "barbell" as const, difficulty: "intermediate" as const,
    defaultBodyPosition: "lying_supine" as const,
    fatigueCost: 6, technicalComplexity: 4, stabilityDemand: 4,
    jointStressShoulder: 3, jointStressElbow: 4, jointStressSpine: 2,
    lengthenedBias: 3, stretchMediatedPotential: 3 },

  { slug: "wide-grip-bench-press", name: "Wide-Grip Bench Press",
    movementPattern: "push_horizontal" as const, classification: "compound" as const,
    resistanceType: "barbell" as const, difficulty: "intermediate" as const,
    fatigueCost: 7, technicalComplexity: 5, stabilityDemand: 5,
    jointStressShoulder: 7, jointStressElbow: 3, jointStressSpine: 3,
    lengthenedBias: 7, stretchMediatedPotential: 7 },

  // ── Horizontal Push: Dumbbell ────────────────────────────

  { slug: "dumbbell-bench-press", name: "Dumbbell Bench Press",
    movementPattern: "push_horizontal" as const, classification: "compound" as const,
    resistanceType: "dumbbell" as const, difficulty: "beginner" as const,
    defaultBodyPosition: "lying_supine" as const,
    fatigueCost: 6, technicalComplexity: 4, stabilityDemand: 5,
    jointStressShoulder: 5, jointStressElbow: 4,
    lengthenedBias: 7, stretchMediatedPotential: 7 },

  { slug: "incline-dumbbell-bench-press", name: "Incline Dumbbell Bench Press",
    movementPattern: "push_horizontal" as const, classification: "compound" as const,
    resistanceType: "dumbbell" as const, difficulty: "intermediate" as const,
    defaultBodyPosition: "incline" as const,
    fatigueCost: 6, technicalComplexity: 4, stabilityDemand: 5,
    jointStressShoulder: 6, jointStressElbow: 4,
    lengthenedBias: 8, stretchMediatedPotential: 8 },

  { slug: "decline-dumbbell-bench-press", name: "Decline Dumbbell Bench Press",
    movementPattern: "push_horizontal" as const, classification: "compound" as const,
    resistanceType: "dumbbell" as const, difficulty: "intermediate" as const,
    defaultBodyPosition: "decline" as const,
    fatigueCost: 6, technicalComplexity: 4, stabilityDemand: 5,
    jointStressShoulder: 4, jointStressElbow: 4,
    lengthenedBias: 6, stretchMediatedPotential: 5 },

  { slug: "dumbbell-floor-press", name: "Dumbbell Floor Press",
    movementPattern: "push_horizontal" as const, classification: "compound" as const,
    resistanceType: "dumbbell" as const, difficulty: "beginner" as const,
    defaultBodyPosition: "lying_supine" as const,
    fatigueCost: 5, technicalComplexity: 3, stabilityDemand: 4,
    jointStressShoulder: 4, jointStressElbow: 3, jointStressSpine: 1,
    lengthenedBias: 3, stretchMediatedPotential: 3 },

  { slug: "single-arm-dumbbell-bench-press", name: "Single-Arm Dumbbell Bench Press",
    movementPattern: "push_horizontal" as const, classification: "compound" as const,
    resistanceType: "dumbbell" as const, difficulty: "intermediate" as const,
    unilateral: true, defaultBodyPosition: "lying_supine" as const,
    fatigueCost: 6, technicalComplexity: 5, stabilityDemand: 7,
    jointStressShoulder: 5, jointStressElbow: 4, jointStressSpine: 4,
    lengthenedBias: 7, stretchMediatedPotential: 7 },

  { slug: "neutral-grip-dumbbell-press", name: "Neutral-Grip Dumbbell Press",
    movementPattern: "push_horizontal" as const, classification: "compound" as const,
    resistanceType: "dumbbell" as const, difficulty: "beginner" as const,
    defaultBodyPosition: "lying_supine" as const,
    fatigueCost: 6, technicalComplexity: 3, stabilityDemand: 5,
    jointStressShoulder: 4, jointStressElbow: 4,
    lengthenedBias: 7, stretchMediatedPotential: 6 },

  // ── Horizontal Push: Cable & Machine ────────────────────

  { slug: "cable-chest-fly", name: "Cable Chest Fly",
    movementPattern: "push_horizontal" as const, classification: "isolation" as const,
    resistanceType: "cable" as const, difficulty: "beginner" as const,
    defaultBodyPosition: "standing" as const,
    fatigueCost: 4, technicalComplexity: 3, stabilityDemand: 4,
    jointStressShoulder: 4, jointStressElbow: 2,
    lengthenedBias: 9, shortenedBias: 7, stretchMediatedPotential: 9 },

  { slug: "cable-chest-fly-low-to-high", name: "Cable Chest Fly (Low to High)",
    movementPattern: "push_horizontal" as const, classification: "isolation" as const,
    resistanceType: "cable" as const, difficulty: "beginner" as const,
    defaultBodyPosition: "standing" as const,
    fatigueCost: 4, technicalComplexity: 3, stabilityDemand: 4,
    jointStressShoulder: 4, jointStressElbow: 2,
    lengthenedBias: 9, shortenedBias: 7, stretchMediatedPotential: 9 },

  { slug: "cable-chest-fly-high-to-low", name: "Cable Chest Fly (High to Low)",
    movementPattern: "push_horizontal" as const, classification: "isolation" as const,
    resistanceType: "cable" as const, difficulty: "beginner" as const,
    defaultBodyPosition: "standing" as const,
    fatigueCost: 4, technicalComplexity: 3, stabilityDemand: 4,
    jointStressShoulder: 4, jointStressElbow: 2,
    lengthenedBias: 8, shortenedBias: 7, stretchMediatedPotential: 8 },

  { slug: "pec-deck-fly", name: "Pec Deck Fly",
    movementPattern: "push_horizontal" as const, classification: "isolation" as const,
    resistanceType: "machine" as const, difficulty: "beginner" as const,
    defaultBodyPosition: "seated" as const,
    fatigueCost: 3, technicalComplexity: 1, stabilityDemand: 1,
    jointStressShoulder: 5, jointStressElbow: 2,
    lengthenedBias: 8, shortenedBias: 7, stretchMediatedPotential: 8 },

  { slug: "machine-chest-press", name: "Machine Chest Press",
    movementPattern: "push_horizontal" as const, classification: "compound" as const,
    resistanceType: "machine" as const, difficulty: "beginner" as const,
    defaultBodyPosition: "seated" as const,
    fatigueCost: 4, technicalComplexity: 2, stabilityDemand: 1,
    jointStressShoulder: 4, jointStressElbow: 3,
    lengthenedBias: 6, stretchMediatedPotential: 6 },

  { slug: "smith-machine-bench-press", name: "Smith Machine Bench Press",
    movementPattern: "push_horizontal" as const, classification: "compound" as const,
    resistanceType: "smith_machine" as const, difficulty: "beginner" as const,
    defaultBodyPosition: "lying_supine" as const,
    fatigueCost: 6, technicalComplexity: 3, stabilityDemand: 3,
    jointStressShoulder: 5, jointStressElbow: 3, jointStressSpine: 3,
    lengthenedBias: 5, stretchMediatedPotential: 5 },

  // ── Horizontal Push: Bodyweight ──────────────────────────

  { slug: "push-up", name: "Push-Up",
    movementPattern: "push_horizontal" as const, classification: "compound" as const,
    resistanceType: "bodyweight" as const, difficulty: "beginner" as const,
    defaultBodyPosition: "lying_prone" as const,
    fatigueCost: 4, technicalComplexity: 3, stabilityDemand: 5,
    jointStressShoulder: 4, jointStressElbow: 3, jointStressWrist: 3,
    lengthenedBias: 5, stretchMediatedPotential: 5 },

  { slug: "wide-push-up", name: "Wide-Grip Push-Up",
    movementPattern: "push_horizontal" as const, classification: "compound" as const,
    resistanceType: "bodyweight" as const, difficulty: "beginner" as const,
    defaultBodyPosition: "lying_prone" as const,
    fatigueCost: 4, technicalComplexity: 3, stabilityDemand: 5,
    jointStressShoulder: 5, jointStressElbow: 3, jointStressWrist: 3,
    lengthenedBias: 6, stretchMediatedPotential: 6 },

  { slug: "diamond-push-up", name: "Diamond Push-Up",
    movementPattern: "push_horizontal" as const, classification: "compound" as const,
    resistanceType: "bodyweight" as const, difficulty: "intermediate" as const,
    defaultBodyPosition: "lying_prone" as const,
    fatigueCost: 4, technicalComplexity: 3, stabilityDemand: 5,
    jointStressShoulder: 4, jointStressElbow: 5, jointStressWrist: 4,
    lengthenedBias: 5, stretchMediatedPotential: 4 },

  { slug: "decline-push-up", name: "Decline Push-Up",
    movementPattern: "push_horizontal" as const, classification: "compound" as const,
    resistanceType: "bodyweight" as const, difficulty: "intermediate" as const,
    defaultBodyPosition: "lying_prone" as const,
    fatigueCost: 5, technicalComplexity: 4, stabilityDemand: 6,
    jointStressShoulder: 5, jointStressElbow: 3, jointStressWrist: 3,
    lengthenedBias: 6, stretchMediatedPotential: 6 },

  { slug: "incline-push-up", name: "Incline Push-Up",
    movementPattern: "push_horizontal" as const, classification: "compound" as const,
    resistanceType: "bodyweight" as const, difficulty: "beginner" as const,
    defaultBodyPosition: "standing" as const,
    fatigueCost: 3, technicalComplexity: 2, stabilityDemand: 3,
    jointStressShoulder: 3, jointStressElbow: 2, jointStressWrist: 2,
    lengthenedBias: 4, stretchMediatedPotential: 4 },

  { slug: "ring-push-up", name: "Ring Push-Up",
    movementPattern: "push_horizontal" as const, classification: "compound" as const,
    resistanceType: "suspension" as const, difficulty: "intermediate" as const,
    defaultBodyPosition: "lying_prone" as const,
    fatigueCost: 5, technicalComplexity: 5, stabilityDemand: 8,
    jointStressShoulder: 5, jointStressElbow: 4, jointStressWrist: 4,
    lengthenedBias: 7, stretchMediatedPotential: 7 },

  // ── Dip & Related ────────────────────────────────────────

  { slug: "dip", name: "Dip",
    movementPattern: "push_vertical" as const, classification: "compound" as const,
    resistanceType: "bodyweight" as const, difficulty: "intermediate" as const,
    defaultBodyPosition: "standing" as const,
    fatigueCost: 6, technicalComplexity: 4, stabilityDemand: 6,
    jointStressShoulder: 6, jointStressElbow: 5,
    lengthenedBias: 7, stretchMediatedPotential: 6 },

  { slug: "weighted-dip", name: "Weighted Dip",
    movementPattern: "push_vertical" as const, classification: "compound" as const,
    resistanceType: "bodyweight" as const, difficulty: "intermediate" as const,
    defaultBodyPosition: "standing" as const,
    fatigueCost: 7, technicalComplexity: 5, stabilityDemand: 6,
    jointStressShoulder: 7, jointStressElbow: 6,
    lengthenedBias: 7, stretchMediatedPotential: 6 },

  // ── Chest Isolation: Flyes ────────────────────────────────

  { slug: "dumbbell-chest-fly", name: "Dumbbell Chest Fly",
    movementPattern: "push_horizontal" as const, classification: "isolation" as const,
    resistanceType: "dumbbell" as const, difficulty: "beginner" as const,
    defaultBodyPosition: "lying_supine" as const,
    fatigueCost: 4, technicalComplexity: 3, stabilityDemand: 4,
    jointStressShoulder: 5, jointStressElbow: 2,
    lengthenedBias: 9, shortenedBias: 3, stretchMediatedPotential: 8 },

  { slug: "incline-dumbbell-fly", name: "Incline Dumbbell Fly",
    movementPattern: "push_horizontal" as const, classification: "isolation" as const,
    resistanceType: "dumbbell" as const, difficulty: "beginner" as const,
    defaultBodyPosition: "incline" as const,
    fatigueCost: 4, technicalComplexity: 3, stabilityDemand: 4,
    jointStressShoulder: 6, jointStressElbow: 2,
    lengthenedBias: 9, shortenedBias: 3, stretchMediatedPotential: 9 },

  { slug: "dumbbell-pullover", name: "Dumbbell Pullover",
    movementPattern: "push_horizontal" as const, classification: "compound" as const,
    resistanceType: "dumbbell" as const, difficulty: "beginner" as const,
    defaultBodyPosition: "lying_supine" as const,
    fatigueCost: 4, technicalComplexity: 3, stabilityDemand: 4,
    jointStressShoulder: 6, jointStressElbow: 3, jointStressSpine: 3,
    lengthenedBias: 9, stretchMediatedPotential: 8 },

  { slug: "barbell-pullover", name: "Barbell Pullover",
    movementPattern: "push_horizontal" as const, classification: "compound" as const,
    resistanceType: "barbell" as const, difficulty: "intermediate" as const,
    defaultBodyPosition: "lying_supine" as const,
    fatigueCost: 5, technicalComplexity: 4, stabilityDemand: 4,
    jointStressShoulder: 7, jointStressElbow: 4, jointStressSpine: 3,
    lengthenedBias: 10, stretchMediatedPotential: 9 },

  // ── Vertical Push: Barbell ────────────────────────────────

  { slug: "barbell-overhead-press", name: "Barbell Overhead Press",
    movementPattern: "push_vertical" as const, classification: "compound" as const,
    resistanceType: "barbell" as const, difficulty: "intermediate" as const,
    defaultBodyPosition: "standing" as const,
    fatigueCost: 8, technicalComplexity: 6, stabilityDemand: 6,
    jointStressShoulder: 7, jointStressElbow: 3, jointStressWrist: 3, jointStressSpine: 7,
    lengthenedBias: 6, stretchMediatedPotential: 6 },

  { slug: "seated-barbell-overhead-press", name: "Seated Barbell Overhead Press",
    movementPattern: "push_vertical" as const, classification: "compound" as const,
    resistanceType: "barbell" as const, difficulty: "intermediate" as const,
    defaultBodyPosition: "seated" as const,
    fatigueCost: 7, technicalComplexity: 5, stabilityDemand: 5,
    jointStressShoulder: 7, jointStressElbow: 3, jointStressWrist: 3, jointStressSpine: 5,
    lengthenedBias: 6, stretchMediatedPotential: 6 },

  { slug: "push-press", name: "Push Press",
    movementPattern: "push_vertical" as const, classification: "power" as const,
    resistanceType: "barbell" as const, difficulty: "advanced" as const,
    defaultBodyPosition: "standing" as const,
    fatigueCost: 9, technicalComplexity: 7, stabilityDemand: 7,
    jointStressShoulder: 7, jointStressElbow: 3, jointStressWrist: 3, jointStressSpine: 7, jointStressKnee: 4,
    lengthenedBias: 5, stretchMediatedPotential: 5 },

  { slug: "z-press", name: "Z Press",
    movementPattern: "push_vertical" as const, classification: "compound" as const,
    resistanceType: "barbell" as const, difficulty: "advanced" as const,
    defaultBodyPosition: "seated" as const,
    fatigueCost: 7, technicalComplexity: 7, stabilityDemand: 7,
    jointStressShoulder: 7, jointStressElbow: 3, jointStressSpine: 6,
    lengthenedBias: 6, stretchMediatedPotential: 6 },

  { slug: "behind-neck-press", name: "Behind-Neck Press",
    movementPattern: "push_vertical" as const, classification: "compound" as const,
    resistanceType: "barbell" as const, difficulty: "advanced" as const,
    defaultBodyPosition: "seated" as const,
    fatigueCost: 7, technicalComplexity: 6, stabilityDemand: 5,
    jointStressShoulder: 9, jointStressElbow: 3, jointStressWrist: 3, jointStressSpine: 5,
    lengthenedBias: 8, stretchMediatedPotential: 6 },

  // ── Vertical Push: Dumbbell ───────────────────────────────

  { slug: "dumbbell-overhead-press", name: "Dumbbell Overhead Press",
    movementPattern: "push_vertical" as const, classification: "compound" as const,
    resistanceType: "dumbbell" as const, difficulty: "beginner" as const,
    defaultBodyPosition: "standing" as const,
    fatigueCost: 6, technicalComplexity: 4, stabilityDemand: 5,
    jointStressShoulder: 6, jointStressElbow: 3, jointStressSpine: 5,
    lengthenedBias: 7, stretchMediatedPotential: 7 },

  { slug: "dumbbell-seated-overhead-press", name: "Dumbbell Seated Overhead Press",
    movementPattern: "push_vertical" as const, classification: "compound" as const,
    resistanceType: "dumbbell" as const, difficulty: "beginner" as const,
    defaultBodyPosition: "seated" as const,
    fatigueCost: 6, technicalComplexity: 4, stabilityDemand: 4,
    jointStressShoulder: 6, jointStressElbow: 3, jointStressSpine: 4,
    lengthenedBias: 7, stretchMediatedPotential: 7 },

  { slug: "arnold-press", name: "Arnold Press",
    movementPattern: "push_vertical" as const, classification: "compound" as const,
    resistanceType: "dumbbell" as const, difficulty: "intermediate" as const,
    defaultBodyPosition: "seated" as const,
    fatigueCost: 6, technicalComplexity: 5, stabilityDemand: 4,
    jointStressShoulder: 7, jointStressElbow: 3,
    lengthenedBias: 8, stretchMediatedPotential: 7 },

  { slug: "single-arm-dumbbell-overhead-press", name: "Single-Arm Dumbbell Overhead Press",
    movementPattern: "push_vertical" as const, classification: "compound" as const,
    resistanceType: "dumbbell" as const, difficulty: "intermediate" as const,
    unilateral: true, defaultBodyPosition: "standing" as const,
    fatigueCost: 6, technicalComplexity: 5, stabilityDemand: 8,
    jointStressShoulder: 6, jointStressElbow: 3, jointStressSpine: 6,
    lengthenedBias: 7, stretchMediatedPotential: 7 },

  { slug: "dumbbell-push-press", name: "Dumbbell Push Press",
    movementPattern: "push_vertical" as const, classification: "power" as const,
    resistanceType: "dumbbell" as const, difficulty: "intermediate" as const,
    defaultBodyPosition: "standing" as const,
    fatigueCost: 7, technicalComplexity: 5, stabilityDemand: 6,
    jointStressShoulder: 6, jointStressElbow: 3, jointStressSpine: 6, jointStressKnee: 3,
    lengthenedBias: 5, stretchMediatedPotential: 5 },

  // ── Vertical Push: Cable, Machine, Bodyweight ─────────────

  { slug: "landmine-press", name: "Landmine Press",
    movementPattern: "push_vertical" as const, classification: "compound" as const,
    resistanceType: "landmine" as const, difficulty: "beginner" as const,
    defaultBodyPosition: "standing" as const,
    fatigueCost: 5, technicalComplexity: 4, stabilityDemand: 5,
    jointStressShoulder: 5, jointStressElbow: 3, jointStressSpine: 5,
    lengthenedBias: 6, stretchMediatedPotential: 5 },

  { slug: "half-kneeling-landmine-press", name: "Half-Kneeling Landmine Press",
    movementPattern: "push_vertical" as const, classification: "compound" as const,
    resistanceType: "landmine" as const, difficulty: "intermediate" as const,
    unilateral: true, defaultBodyPosition: "kneeling" as const,
    fatigueCost: 5, technicalComplexity: 5, stabilityDemand: 7,
    jointStressShoulder: 5, jointStressElbow: 3, jointStressSpine: 5,
    lengthenedBias: 6, stretchMediatedPotential: 5 },

  { slug: "machine-shoulder-press", name: "Machine Shoulder Press",
    movementPattern: "push_vertical" as const, classification: "compound" as const,
    resistanceType: "machine" as const, difficulty: "beginner" as const,
    defaultBodyPosition: "seated" as const,
    fatigueCost: 4, technicalComplexity: 2, stabilityDemand: 2,
    jointStressShoulder: 6, jointStressElbow: 3,
    lengthenedBias: 7, stretchMediatedPotential: 6 },

  { slug: "smith-machine-overhead-press", name: "Smith Machine Overhead Press",
    movementPattern: "push_vertical" as const, classification: "compound" as const,
    resistanceType: "smith_machine" as const, difficulty: "beginner" as const,
    defaultBodyPosition: "standing" as const,
    fatigueCost: 6, technicalComplexity: 4, stabilityDemand: 4,
    jointStressShoulder: 6, jointStressElbow: 3, jointStressSpine: 6,
    lengthenedBias: 6, stretchMediatedPotential: 6 },

  { slug: "cable-overhead-press", name: "Cable Overhead Press",
    movementPattern: "push_vertical" as const, classification: "compound" as const,
    resistanceType: "cable" as const, difficulty: "intermediate" as const,
    defaultBodyPosition: "standing" as const,
    fatigueCost: 6, technicalComplexity: 5, stabilityDemand: 6,
    jointStressShoulder: 6, jointStressElbow: 3, jointStressSpine: 6,
    lengthenedBias: 7, shortenedBias: 6, stretchMediatedPotential: 7 },

  { slug: "pike-push-up", name: "Pike Push-Up",
    movementPattern: "push_vertical" as const, classification: "compound" as const,
    resistanceType: "bodyweight" as const, difficulty: "intermediate" as const,
    defaultBodyPosition: "lying_prone" as const,
    fatigueCost: 4, technicalComplexity: 4, stabilityDemand: 6,
    jointStressShoulder: 5, jointStressElbow: 3, jointStressWrist: 4,
    lengthenedBias: 6, stretchMediatedPotential: 6 },

  { slug: "handstand-push-up", name: "Handstand Push-Up",
    movementPattern: "push_vertical" as const, classification: "compound" as const,
    resistanceType: "bodyweight" as const, difficulty: "advanced" as const,
    defaultBodyPosition: "standing" as const,
    fatigueCost: 7, technicalComplexity: 9, stabilityDemand: 10,
    jointStressShoulder: 8, jointStressElbow: 5, jointStressWrist: 7,
    lengthenedBias: 7, stretchMediatedPotential: 7 },

] as const;

// ─── MUSCLES ─────────────────────────────────────────────────
// [slug, muscle_group, role]

const MUSCLES: Array<[string, MuscleGroup, MuscleRole]> = [

  // Barbell horizontal push: chest primary, front delt + triceps secondary
  ["barbell-bench-press",          "chest",          "primary"],
  ["barbell-bench-press",          "front_deltoid",  "secondary"],
  ["barbell-bench-press",          "triceps",        "secondary"],

  ["incline-barbell-bench-press",  "chest",          "primary"],
  ["incline-barbell-bench-press",  "front_deltoid",  "primary"],
  ["incline-barbell-bench-press",  "triceps",        "secondary"],

  ["decline-barbell-bench-press",  "chest",          "primary"],
  ["decline-barbell-bench-press",  "front_deltoid",  "secondary"],
  ["decline-barbell-bench-press",  "triceps",        "secondary"],

  ["close-grip-bench-press",       "triceps",        "primary"],
  ["close-grip-bench-press",       "chest",          "secondary"],
  ["close-grip-bench-press",       "front_deltoid",  "secondary"],

  ["pause-bench-press",            "chest",          "primary"],
  ["pause-bench-press",            "front_deltoid",  "secondary"],
  ["pause-bench-press",            "triceps",        "secondary"],

  ["barbell-floor-press",          "chest",          "primary"],
  ["barbell-floor-press",          "triceps",        "primary"],
  ["barbell-floor-press",          "front_deltoid",  "secondary"],

  ["wide-grip-bench-press",        "chest",          "primary"],
  ["wide-grip-bench-press",        "front_deltoid",  "secondary"],
  ["wide-grip-bench-press",        "triceps",        "secondary"],

  // Dumbbell horizontal push
  ["dumbbell-bench-press",         "chest",          "primary"],
  ["dumbbell-bench-press",         "front_deltoid",  "secondary"],
  ["dumbbell-bench-press",         "triceps",        "secondary"],

  ["incline-dumbbell-bench-press", "chest",          "primary"],
  ["incline-dumbbell-bench-press", "front_deltoid",  "primary"],
  ["incline-dumbbell-bench-press", "triceps",        "secondary"],

  ["decline-dumbbell-bench-press", "chest",          "primary"],
  ["decline-dumbbell-bench-press", "front_deltoid",  "secondary"],
  ["decline-dumbbell-bench-press", "triceps",        "secondary"],

  ["dumbbell-floor-press",         "chest",          "primary"],
  ["dumbbell-floor-press",         "triceps",        "primary"],
  ["dumbbell-floor-press",         "front_deltoid",  "secondary"],

  ["single-arm-dumbbell-bench-press", "chest",       "primary"],
  ["single-arm-dumbbell-bench-press", "front_deltoid", "secondary"],
  ["single-arm-dumbbell-bench-press", "triceps",     "secondary"],
  ["single-arm-dumbbell-bench-press", "obliques",    "stabilizer"],

  ["neutral-grip-dumbbell-press",  "chest",          "primary"],
  ["neutral-grip-dumbbell-press",  "front_deltoid",  "secondary"],
  ["neutral-grip-dumbbell-press",  "triceps",        "secondary"],

  // Cable/machine horizontal
  ["cable-chest-fly",              "chest",          "primary"],
  ["cable-chest-fly",              "front_deltoid",  "secondary"],

  ["cable-chest-fly-low-to-high",  "chest",          "primary"],
  ["cable-chest-fly-low-to-high",  "front_deltoid",  "secondary"],

  ["cable-chest-fly-high-to-low",  "chest",          "primary"],
  ["cable-chest-fly-high-to-low",  "front_deltoid",  "secondary"],

  ["pec-deck-fly",                 "chest",          "primary"],
  ["pec-deck-fly",                 "front_deltoid",  "stabilizer"],

  ["machine-chest-press",          "chest",          "primary"],
  ["machine-chest-press",          "front_deltoid",  "secondary"],
  ["machine-chest-press",          "triceps",        "secondary"],

  ["smith-machine-bench-press",    "chest",          "primary"],
  ["smith-machine-bench-press",    "front_deltoid",  "secondary"],
  ["smith-machine-bench-press",    "triceps",        "secondary"],

  // Bodyweight horizontal
  ["push-up",                      "chest",          "primary"],
  ["push-up",                      "front_deltoid",  "secondary"],
  ["push-up",                      "triceps",        "secondary"],
  ["push-up",                      "transverse_abdominis", "stabilizer"],

  ["wide-push-up",                 "chest",          "primary"],
  ["wide-push-up",                 "front_deltoid",  "secondary"],
  ["wide-push-up",                 "triceps",        "secondary"],

  ["diamond-push-up",              "triceps",        "primary"],
  ["diamond-push-up",              "chest",          "secondary"],
  ["diamond-push-up",              "front_deltoid",  "secondary"],

  ["decline-push-up",              "chest",          "primary"],
  ["decline-push-up",              "front_deltoid",  "primary"],
  ["decline-push-up",              "triceps",        "secondary"],

  ["incline-push-up",              "chest",          "primary"],
  ["incline-push-up",              "front_deltoid",  "secondary"],
  ["incline-push-up",              "triceps",        "secondary"],

  ["ring-push-up",                 "chest",          "primary"],
  ["ring-push-up",                 "front_deltoid",  "secondary"],
  ["ring-push-up",                 "triceps",        "secondary"],
  ["ring-push-up",                 "transverse_abdominis", "stabilizer"],

  // Dip & related
  ["dip",                          "chest",          "primary"],
  ["dip",                          "triceps",        "primary"],
  ["dip",                          "front_deltoid",  "secondary"],

  ["weighted-dip",                 "chest",          "primary"],
  ["weighted-dip",                 "triceps",        "primary"],
  ["weighted-dip",                 "front_deltoid",  "secondary"],

  // Dumbbell flyes
  ["dumbbell-chest-fly",           "chest",          "primary"],
  ["dumbbell-chest-fly",           "front_deltoid",  "secondary"],

  ["incline-dumbbell-fly",         "chest",          "primary"],
  ["incline-dumbbell-fly",         "front_deltoid",  "primary"],

  ["dumbbell-pullover",            "chest",          "primary"],
  ["dumbbell-pullover",            "lats",           "secondary"],
  ["dumbbell-pullover",            "triceps",        "secondary"],

  ["barbell-pullover",             "chest",          "primary"],
  ["barbell-pullover",             "lats",           "secondary"],
  ["barbell-pullover",             "triceps",        "secondary"],

  // Vertical push: barbell
  ["barbell-overhead-press",       "front_deltoid",  "primary"],
  ["barbell-overhead-press",       "lateral_deltoid","secondary"],
  ["barbell-overhead-press",       "triceps",        "secondary"],
  ["barbell-overhead-press",       "trapezius",      "stabilizer"],
  ["barbell-overhead-press",       "spinal_erectors","stabilizer"],

  ["seated-barbell-overhead-press","front_deltoid",  "primary"],
  ["seated-barbell-overhead-press","lateral_deltoid","secondary"],
  ["seated-barbell-overhead-press","triceps",        "secondary"],
  ["seated-barbell-overhead-press","trapezius",      "stabilizer"],

  ["push-press",                   "front_deltoid",  "primary"],
  ["push-press",                   "lateral_deltoid","secondary"],
  ["push-press",                   "triceps",        "secondary"],
  ["push-press",                   "quadriceps",     "secondary"],
  ["push-press",                   "spinal_erectors","stabilizer"],

  ["z-press",                      "front_deltoid",  "primary"],
  ["z-press",                      "lateral_deltoid","secondary"],
  ["z-press",                      "triceps",        "secondary"],
  ["z-press",                      "transverse_abdominis", "stabilizer"],

  ["behind-neck-press",            "front_deltoid",  "primary"],
  ["behind-neck-press",            "lateral_deltoid","primary"],
  ["behind-neck-press",            "triceps",        "secondary"],
  ["behind-neck-press",            "rear_deltoid",   "secondary"],

  // Vertical push: dumbbell
  ["dumbbell-overhead-press",      "front_deltoid",  "primary"],
  ["dumbbell-overhead-press",      "lateral_deltoid","secondary"],
  ["dumbbell-overhead-press",      "triceps",        "secondary"],

  ["dumbbell-seated-overhead-press","front_deltoid", "primary"],
  ["dumbbell-seated-overhead-press","lateral_deltoid","secondary"],
  ["dumbbell-seated-overhead-press","triceps",       "secondary"],

  ["arnold-press",                 "front_deltoid",  "primary"],
  ["arnold-press",                 "lateral_deltoid","primary"],
  ["arnold-press",                 "triceps",        "secondary"],

  ["single-arm-dumbbell-overhead-press","front_deltoid","primary"],
  ["single-arm-dumbbell-overhead-press","lateral_deltoid","secondary"],
  ["single-arm-dumbbell-overhead-press","triceps",   "secondary"],
  ["single-arm-dumbbell-overhead-press","obliques",  "stabilizer"],

  ["dumbbell-push-press",          "front_deltoid",  "primary"],
  ["dumbbell-push-press",          "lateral_deltoid","secondary"],
  ["dumbbell-push-press",          "triceps",        "secondary"],
  ["dumbbell-push-press",          "quadriceps",     "secondary"],

  // Vertical push: cable/machine/bodyweight
  ["landmine-press",               "front_deltoid",  "primary"],
  ["landmine-press",               "chest",          "secondary"],
  ["landmine-press",               "triceps",        "secondary"],

  ["half-kneeling-landmine-press", "front_deltoid",  "primary"],
  ["half-kneeling-landmine-press", "chest",          "secondary"],
  ["half-kneeling-landmine-press", "obliques",       "stabilizer"],

  ["machine-shoulder-press",       "front_deltoid",  "primary"],
  ["machine-shoulder-press",       "lateral_deltoid","secondary"],
  ["machine-shoulder-press",       "triceps",        "secondary"],

  ["smith-machine-overhead-press", "front_deltoid",  "primary"],
  ["smith-machine-overhead-press", "lateral_deltoid","secondary"],
  ["smith-machine-overhead-press", "triceps",        "secondary"],

  ["cable-overhead-press",         "front_deltoid",  "primary"],
  ["cable-overhead-press",         "lateral_deltoid","secondary"],
  ["cable-overhead-press",         "triceps",        "secondary"],

  ["pike-push-up",                 "front_deltoid",  "primary"],
  ["pike-push-up",                 "lateral_deltoid","secondary"],
  ["pike-push-up",                 "triceps",        "secondary"],

  ["handstand-push-up",            "front_deltoid",  "primary"],
  ["handstand-push-up",            "lateral_deltoid","primary"],
  ["handstand-push-up",            "triceps",        "secondary"],
  ["handstand-push-up",            "trapezius",      "stabilizer"],
];

// ─── EQUIPMENT LINKS ─────────────────────────────────────────
// [exercise_slug, equipment_slug, requirement_type]

const EXERCISE_EQUIPMENT: Array<[string, string, EquipmentRequirement]> = [
  ["barbell-bench-press",           "barbell",           "required"],
  ["barbell-bench-press",           "flat-bench",        "required"],
  ["incline-barbell-bench-press",   "barbell",           "required"],
  ["incline-barbell-bench-press",   "adjustable-bench",  "required"],
  ["decline-barbell-bench-press",   "barbell",           "required"],
  ["decline-barbell-bench-press",   "adjustable-bench",  "required"],
  ["close-grip-bench-press",        "barbell",           "required"],
  ["close-grip-bench-press",        "flat-bench",        "required"],
  ["pause-bench-press",             "barbell",           "required"],
  ["pause-bench-press",             "flat-bench",        "required"],
  ["barbell-floor-press",           "barbell",           "required"],
  ["wide-grip-bench-press",         "barbell",           "required"],
  ["wide-grip-bench-press",         "flat-bench",        "required"],
  ["dumbbell-bench-press",          "dumbbells",         "required"],
  ["dumbbell-bench-press",          "adjustable-bench",  "required"],
  ["incline-dumbbell-bench-press",  "dumbbells",         "required"],
  ["incline-dumbbell-bench-press",  "adjustable-bench",  "required"],
  ["decline-dumbbell-bench-press",  "dumbbells",         "required"],
  ["decline-dumbbell-bench-press",  "adjustable-bench",  "required"],
  ["dumbbell-floor-press",          "dumbbells",         "required"],
  ["single-arm-dumbbell-bench-press","dumbbells",        "required"],
  ["single-arm-dumbbell-bench-press","adjustable-bench", "required"],
  ["neutral-grip-dumbbell-press",   "dumbbells",         "required"],
  ["neutral-grip-dumbbell-press",   "flat-bench",        "required"],
  ["cable-chest-fly",               "cable-station",     "required"],
  ["cable-chest-fly-low-to-high",   "cable-station",     "required"],
  ["cable-chest-fly-high-to-low",   "cable-station",     "required"],
  ["pec-deck-fly",                  "pec-deck-machine",  "required"],
  ["machine-chest-press",           "machine-chest-press","required"],
  ["smith-machine-bench-press",     "smith-machine",     "required"],
  ["ring-push-up",                  "rings",             "required"],
  ["dip",                           "dip-station",       "required"],
  ["weighted-dip",                  "dip-station",       "required"],
  ["dumbbell-chest-fly",            "dumbbells",         "required"],
  ["dumbbell-chest-fly",            "flat-bench",        "required"],
  ["incline-dumbbell-fly",          "dumbbells",         "required"],
  ["incline-dumbbell-fly",          "adjustable-bench",  "required"],
  ["dumbbell-pullover",             "dumbbells",         "required"],
  ["dumbbell-pullover",             "flat-bench",        "required"],
  ["barbell-pullover",              "barbell",           "required"],
  ["barbell-pullover",              "flat-bench",        "required"],
  ["barbell-overhead-press",        "barbell",           "required"],
  ["barbell-overhead-press",        "power-rack",        "optional"],
  ["seated-barbell-overhead-press", "barbell",           "required"],
  ["seated-barbell-overhead-press", "adjustable-bench",  "required"],
  ["push-press",                    "barbell",           "required"],
  ["push-press",                    "power-rack",        "optional"],
  ["z-press",                       "barbell",           "required"],
  ["behind-neck-press",             "barbell",           "required"],
  ["behind-neck-press",             "power-rack",        "optional"],
  ["dumbbell-overhead-press",       "dumbbells",         "required"],
  ["dumbbell-seated-overhead-press","dumbbells",         "required"],
  ["dumbbell-seated-overhead-press","adjustable-bench",  "optional"],
  ["arnold-press",                  "dumbbells",         "required"],
  ["arnold-press",                  "adjustable-bench",  "optional"],
  ["single-arm-dumbbell-overhead-press","dumbbells",     "required"],
  ["dumbbell-push-press",           "dumbbells",         "required"],
  ["landmine-press",                "barbell",           "required"],
  ["landmine-press",                "landmine-attachment","required"],
  ["half-kneeling-landmine-press",  "barbell",           "required"],
  ["half-kneeling-landmine-press",  "landmine-attachment","required"],
  ["machine-shoulder-press",        "machine-shoulder-press","required"],
  ["smith-machine-overhead-press",  "smith-machine",     "required"],
  ["cable-overhead-press",          "cable-station",     "required"],
  ["handstand-push-up",             "pull-up-bar",       "optional"],
];

// ─── COACHING CUES ───────────────────────────────────────────
// [slug, cue_type, content, order_index]

const CUES: Array<[string, ExerciseCueType, string, number]> = [

  ["barbell-bench-press", "setup",
    "Grip the bar just outside shoulder-width. Retract your shoulder blades hard and press them into the bench. Arch your lower back naturally — you should be able to slide a hand under it.",
    1],
  ["barbell-bench-press", "execution",
    "Lower the bar to the lower chest in a slight arc, elbows at 70–75°. Drive the bar up and slightly back toward the rack, not straight up. Leg drive into the floor reinforces your arch.",
    2],
  ["barbell-bench-press", "common_error",
    "Elbows flaring to 90°: dramatically increases shoulder impingement risk and reduces force transfer into the bar. Pull your elbows slightly toward your hips throughout the press.",
    3],

  ["incline-barbell-bench-press", "setup",
    "Set the bench to 30–45°. Grip shoulder-width, bar at mid-upper chest. Establish the same shoulder blade retraction as flat bench.",
    1],
  ["incline-barbell-bench-press", "execution",
    "Lower to the upper chest. Press on a slight arc. At this angle, front delt is primary — expect to handle less load than flat bench.",
    2],

  ["close-grip-bench-press", "setup",
    "Grip inside shoulder-width — about fist-width apart. Wrists should be stacked directly over elbows throughout the entire movement.",
    1],
  ["close-grip-bench-press", "execution",
    "Lower to the lower chest with elbows tucked tight. Think 'elbows to ribs' on the descent. Drive up and lock out fully to hit triceps at the top.",
    2],
  ["close-grip-bench-press", "common_error",
    "Bar drifts toward the face on descent: creates high elbow stress and reduces triceps engagement. Aim for the lower sternum, not the collarbones.",
    3],

  ["pause-bench-press", "setup",
    "Same setup as standard bench press. The difference is at the bottom — come to a complete dead stop on the chest for 2–3 seconds before pressing.",
    1],
  ["pause-bench-press", "execution",
    "Maintain full tension during the pause. Do not relax your arch or leg drive. When you press, explode out of the bottom.",
    2],

  ["dumbbell-bench-press", "setup",
    "Lower the dumbbells to chest level with elbows at roughly 75°. Don't let them flare out to 90°.",
    1],
  ["dumbbell-bench-press", "execution",
    "Press up and slightly in — dumbbells should converge toward each other at the top without touching.",
    2],

  ["incline-dumbbell-bench-press", "setup",
    "Set bench to 30–45°. The higher the angle, the more front delt involvement. Bring dumbbells up to shoulder level before pressing.",
    1],
  ["incline-dumbbell-bench-press", "execution",
    "Press with a neutral arc, converging at the top. Control the eccentric all the way to a deep stretch at the bottom.",
    2],

  ["dumbbell-floor-press", "setup",
    "Lie on the floor with the dumbbells resting on thighs. Kick them up one at a time to the press position. Elbows rest on the floor at the bottom.",
    1],
  ["dumbbell-floor-press", "execution",
    "Press up until arms are extended. On the return, rest your triceps on the floor briefly before each rep — this eliminates the stretch reflex and increases triceps demand.",
    2],

  ["cable-chest-fly", "setup",
    "Set pulleys to mid-height (about chest level). Stand in a split stance for stability. Lean slightly forward from the hip, not the spine.",
    1],
  ["cable-chest-fly", "execution",
    "Bring hands together in a wide arc — lead with the elbow, not the hand. Feel a full stretch in the chest at the outstretched position before driving the arms together.",
    2],
  ["cable-chest-fly", "mental_cue",
    "Hug a giant tree.",
    3],

  ["cable-chest-fly-low-to-high", "setup",
    "Set pulleys to low position (ankle-to-knee height). Stand between them, lean slightly forward.",
    1],
  ["cable-chest-fly-low-to-high", "execution",
    "Drive the arms upward and inward in an arc, finishing at shoulder height. This angle emphasizes the upper chest and clavicular head.",
    2],

  ["cable-chest-fly-high-to-low", "setup",
    "Set pulleys to shoulder height or above. Arms start wide and high, finish at hip level.",
    1],
  ["cable-chest-fly-high-to-low", "execution",
    "Bring arms down and in, finishing together at hip level. Emphasizes lower chest and sternal fibers.",
    2],

  ["pec-deck-fly", "setup",
    "Set the seat so handles are at chest level. Your elbows should be slightly bent and stay at 90° — the movement is purely shoulder adduction.",
    1],
  ["pec-deck-fly", "execution",
    "Bring pads together through a full arc. Control the negative — the stretch at the open position is where most stimulus occurs.",
    2],
  ["pec-deck-fly", "common_error",
    "Letting arms go too far behind the body: rotator cuff impingement risk. Stop the movement when your elbows are level with your torso.",
    3],

  ["push-up", "setup",
    "Hands slightly wider than shoulders. Body in a rigid plank — squeeze glutes and abs. Gaze at a point just in front of your hands.",
    1],
  ["push-up", "execution",
    "Lower until chest nearly touches the floor. Press to full arm extension. Your body should move as one rigid unit — no sagging hips.",
    2],

  ["diamond-push-up", "setup",
    "Form a diamond shape with your thumbs and index fingers. Position the diamond at the center of your chest.",
    1],
  ["diamond-push-up", "execution",
    "Lower with elbows tracking close to your torso — they should brush your sides. Full extension at the top for maximum triceps contraction.",
    2],

  ["ring-push-up", "setup",
    "Set rings at a height where your body is 10–20° from horizontal. The rings will rotate naturally during the movement — allow this.",
    1],
  ["ring-push-up", "execution",
    "Turn the rings out at the top (supinated position) to fully engage the chest. At the bottom, allow the rings to internally rotate naturally.",
    2],

  ["dip", "setup",
    "Support yourself with arms locked out. Lean slightly forward to shift emphasis to chest; stay upright to shift to triceps.",
    1],
  ["dip", "execution",
    "Lower until shoulders are below elbows. Drive up through the palms. Do not let shoulders shrug up toward ears at the bottom.",
    2],
  ["dip", "common_error",
    "Excessive forward lean: can shift too much stress onto the anterior shoulder capsule at the bottom of deep dips. Limit ROM if shoulder pain occurs.",
    3],

  ["dumbbell-chest-fly", "setup",
    "Lie flat, arms extended above chest with a slight bend in the elbows. That bend stays fixed throughout the movement.",
    1],
  ["dumbbell-chest-fly", "execution",
    "Lower dumbbells in a wide arc until you feel a deep stretch across the chest. Return by squeezing the chest, not by bending the elbows more.",
    2],

  ["incline-dumbbell-fly", "setup",
    "Set bench to 30–45°. Identical arm position to flat dumbbell fly — slight fixed elbow bend.",
    1],
  ["incline-dumbbell-fly", "execution",
    "Lower into a deep stretch. The upper chest and clavicular fibers receive the most stretch at the bottom. Hold the stretch for a moment before returning.",
    2],

  ["dumbbell-pullover", "setup",
    "Lie perpendicular to a flat bench, upper back on the bench. Hold one dumbbell vertically with both hands above chest.",
    1],
  ["dumbbell-pullover", "execution",
    "Lower the dumbbell behind your head in an arc, maintaining a slight elbow bend. Feel the stretch across your chest and lats. Return to above the chest.",
    2],

  ["barbell-overhead-press", "setup",
    "Grip just outside shoulder-width. Bar rests on the front deltoids — not your throat. Elbows slightly in front of the bar.",
    1],
  ["barbell-overhead-press", "execution",
    "Press straight up. As the bar clears your head, push your head forward slightly so the bar and spine are in alignment at the top.",
    2],
  ["barbell-overhead-press", "breathing",
    "Big breath and brace before the lift. Hold through the press. Exhale at the top, reset, and brace again for each rep.",
    3],
  ["barbell-overhead-press", "common_error",
    "Excessive lower back arch: the lumbar spine hyperextends to compensate for limited thoracic mobility. Brace harder and address t-spine mobility if this is consistent.",
    4],

  ["push-press", "setup",
    "Same as overhead press. The dip is 2–4 inches — a quick knee bend, not a squat. Stay on full foot, do not go onto toes.",
    1],
  ["push-press", "execution",
    "Dip quickly and reverse into a powerful drive through the legs. The legs provide momentum that gets the bar past the sticking point of the press.",
    2],

  ["z-press", "setup",
    "Sit on the floor with legs straight out in front. This requires significant hamstring flexibility to sit upright. Place the barbell as in a standard overhead press.",
    1],
  ["z-press", "execution",
    "With no lower body support, pure core and upper body stability must maintain the pressing position. The difficulty is entirely in staying upright — if you can't, address mobility first.",
    2],

  ["behind-neck-press", "setup",
    "Use only when thoracic and shoulder mobility is established. Lower the bar behind the neck to the base of the skull, not the middle of the neck.",
    1],
  ["behind-neck-press", "execution",
    "Press straight up from behind the head. This requires significant shoulder external rotation mobility. Avoid if any impingement symptoms occur.",
    2],
  ["behind-neck-press", "safety",
    "Contraindicated for athletes with rotator cuff issues, shoulder impingement, or limited shoulder mobility. The wide-grip position places the shoulder in maximum external rotation under load.",
    3],

  ["dumbbell-overhead-press", "setup",
    "Start with dumbbells at shoulder height, palms facing forward. Feet shoulder-width apart, braced core.",
    1],
  ["dumbbell-overhead-press", "execution",
    "Press overhead, converging slightly at the top. Allow the arms to travel in a natural arc rather than forcing a perfectly straight path.",
    2],

  ["arnold-press", "setup",
    "Start with palms facing you, dumbbells at chin height. The press begins with a rotation from this position.",
    1],
  ["arnold-press", "execution",
    "Rotate the dumbbells outward as you press overhead — by the top, palms face away from you. Reverse on the way down. The rotation loads the shoulder through internal-to-external rotation.",
    2],

  ["landmine-press", "setup",
    "Anchor the barbell in a landmine. Stand perpendicular to the bar, holding the end with one or both hands at shoulder height.",
    1],
  ["landmine-press", "execution",
    "Press the barbell up and forward in the arc defined by the pivot. The arc path reduces shoulder impingement risk compared to straight-up overhead pressing.",
    2],

  ["machine-shoulder-press", "setup",
    "Adjust seat so handles are at shoulder height. Keep your back flat against the pad throughout.",
    1],
  ["machine-shoulder-press", "execution",
    "Press to full extension — lock out to maximize deltoid activation at the top. Control the descent to the start position.",
    2],

  ["pike-push-up", "setup",
    "Start in a push-up position, then walk your hands back until your body forms an inverted V. Hands stay shoulder-width.",
    1],
  ["pike-push-up", "execution",
    "Lower the crown of your head toward the floor between your hands. Press back to the inverted V.",
    2],

  ["handstand-push-up", "setup",
    "Kick into a handstand against a wall. Hands shoulder-width. Head neutral — gaze at the wall.",
    1],
  ["handstand-push-up", "execution",
    "Lower until the crown of your head touches the floor. Press back to full lockout. Full-range handstand push-ups require significant shoulder and wrist strength and mobility.",
    2],
  ["handstand-push-up", "safety",
    "Practice with a spotter or wall support until technique is established. Falling risk is real. Build prerequisite strength with pike push-ups and wall-assisted handstand holds first.",
    3],
];

// ─── EXERCISE RELATIONS ───────────────────────────────────────
// [source_slug, target_slug, relation_type, notes]

const RELATIONS: Array<[string, string, ExerciseRelationType, string]> = [

  // Bench press family — substitutions
  ["barbell-bench-press", "dumbbell-bench-press", "lower_joint_stress",
    "Dumbbells allow independent arm movement and reduce anterior shoulder stress; suitable for athletes managing shoulder impingement."],
  ["barbell-bench-press", "machine-chest-press", "lower_joint_stress",
    "Machine press fixes the bar path, eliminating stabilizer demand and reducing joint stress — appropriate for injury rehab or when stability is the limiting factor."],
  ["barbell-bench-press", "incline-barbell-bench-press", "same_pattern",
    "Same horizontal push pattern at a different angle — shifts emphasis from mid/lower to upper chest and front deltoid."],
  ["barbell-bench-press", "close-grip-bench-press", "same_pattern",
    "Same horizontal push, narrower grip emphasizes triceps over chest."],
  ["barbell-bench-press", "pause-bench-press", "same_pattern",
    "Adds a dead-stop pause at the bottom to eliminate stretch reflex — increases demand at the lengthened position."],

  // Dumbbell bench press family
  ["dumbbell-bench-press", "incline-dumbbell-bench-press", "same_pattern",
    "Same dumbbell compound push at incline — upper chest and front delt emphasis."],
  ["dumbbell-bench-press", "dumbbell-floor-press", "lower_joint_stress",
    "Floor press limits ROM and eliminates deep shoulder stretch — lower shoulder joint stress and useful when bench is unavailable."],

  // Push-up progression chain
  ["push-up", "incline-push-up", "progression",
    "Incline push-up reduces load by ~50% — the entry point for athletes who cannot perform a standard push-up yet."],
  ["push-up", "decline-push-up", "regression",
    "Decline push-up increases load and shifts emphasis to upper chest — appropriate progression past standard push-up."],
  ["push-up", "ring-push-up", "regression",
    "Ring push-up adds significant stability demand — appropriate for athletes seeking progressive overload without adding weight."],
  ["push-up", "barbell-bench-press", "progression",
    "Once push-up volume is high, loading with a barbell provides better progressive overload potential."],

  // Isolation alternatives
  ["cable-chest-fly", "pec-deck-fly", "same_pattern",
    "Both are horizontal shoulder adduction isolation exercises; pec deck is machine-guided with less stability demand."],
  ["cable-chest-fly", "dumbbell-chest-fly", "same_pattern",
    "Same movement pattern; cable maintains tension through full ROM while dumbbell loses tension at peak contraction."],
  ["incline-dumbbell-fly", "cable-chest-fly-low-to-high", "same_pattern",
    "Both target upper chest through horizontal adduction; cable provides consistent tension throughout the arc."],

  // Dip substitutions
  ["dip", "push-up", "lower_joint_stress",
    "Push-up provides similar chest/triceps stimulus with significantly less shoulder joint stress."],

  // Overhead press family
  ["barbell-overhead-press", "dumbbell-overhead-press", "lower_joint_stress",
    "Dumbbells allow natural wrist rotation and independent arm tracking — reduces shoulder impingement risk versus fixed-bar path."],
  ["barbell-overhead-press", "landmine-press", "lower_joint_stress",
    "The arc of the landmine is more shoulder-friendly than straight overhead pressing; appropriate for athletes with shoulder issues."],
  ["barbell-overhead-press", "machine-shoulder-press", "lower_joint_stress",
    "Machine press is fully guided — appropriate for learning the movement or managing injury."],
  ["barbell-overhead-press", "push-press", "regression",
    "Push press is a more advanced version — it uses leg drive to move heavier loads through the overhead pattern."],
  ["barbell-overhead-press", "seated-barbell-overhead-press", "same_pattern",
    "Seated version reduces systemic fatigue and eliminates lower back loading — useful for pure pressing focus."],
  ["dumbbell-overhead-press", "arnold-press", "same_pattern",
    "Arnold press adds shoulder rotation through the ROM — trains through a greater arc with higher front delt lengthened-position stimulus."],
  ["z-press", "barbell-overhead-press", "regression",
    "Z-press is a more demanding version — no leg drive, no lower body support, requires superior core stability and thoracic mobility."],
  ["pike-push-up", "handstand-push-up", "progression",
    "Pike push-up is the stepping stone to handstand push-ups; builds overhead strength through a similar motor pattern."],
];

// ─── MAIN ─────────────────────────────────────────────────────

async function main() {
  console.log("\nCatalyst OS — Exercise Library Seed 001: Upper Body Push");
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
    "001 — Upper Body Push (53 exercises)",
  );

  console.log("─────────────────────────────────────────────────────────");
  console.log("Seed 001 complete.\n");
  await sql.end();
}

main().catch(async (err) => {
  console.error("\nSeed failed:", err instanceof Error ? err.message : err);
  await sql.end();
  process.exit(1);
});
