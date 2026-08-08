// ─────────────────────────────────────────────────────────────
// Kynovant — Exercise Library Seed Data 011: Reviewed MVP Expansion
// ─────────────────────────────────────────────────────────────

import type {
  EquipmentRequirement,
  ExerciseCueType,
  ExerciseDef,
  ExerciseRelationType,
  MuscleGroup,
  MuscleRole,
  MovementPattern,
  ResistanceType,
  ExerciseClassification,
  ExerciseDifficulty,
  BodyPosition,
} from "./_shared";

type ReviewExercise = ExerciseDef & {
  primary: MuscleGroup;
  secondary?: readonly MuscleGroup[];
  stabilizers?: readonly MuscleGroup[];
  equipment?: readonly string[];
  family: string;
  cueKind: "press" | "pull" | "hinge" | "squat" | "lunge" | "curl" | "extension" | "raise" | "core" | "carry" | "mobility" | "cardio" | "power";
};

type VariantSeed = readonly [slug: string, name: string, extraAliases?: readonly string[]];

type FamilySeed = {
  family: string;
  cueKind: ReviewExercise["cueKind"];
  movementPattern: MovementPattern;
  classification: ExerciseClassification;
  resistanceType?: ResistanceType;
  difficulty?: ExerciseDifficulty;
  primary: MuscleGroup;
  secondary?: readonly MuscleGroup[];
  stabilizers?: readonly MuscleGroup[];
  equipment?: readonly string[];
  defaultBodyPosition?: BodyPosition;
  unilateral?: boolean;
  isTimeBased?: boolean;
  isDistanceBased?: boolean;
  isCardio?: boolean;
  isMobility?: boolean;
  fatigueCost: number;
  technicalComplexity: number;
  stabilityDemand: number;
  jointStressShoulder?: number;
  jointStressElbow?: number;
  jointStressWrist?: number;
  jointStressSpine?: number;
  jointStressHip?: number;
  jointStressKnee?: number;
  jointStressAnkle?: number;
  lengthenedBias: number;
  shortenedBias: number;
  stretchMediatedPotential: number;
  variants: readonly VariantSeed[];
};

export const LOCAL_EQUIPMENT = [
  { slug: "elliptical", name: "Elliptical Trainer", category: "cardio_equipment" },
  { slug: "recumbent-bike", name: "Recumbent Bike", category: "cardio_equipment" },
  { slug: "foam-roller", name: "Foam Roller", category: "accessories" },
  { slug: "yoga-mat", name: "Yoga Mat", category: "accessories" },
  { slug: "mini-band", name: "Mini Band", category: "accessories" },
  { slug: "ankle-strap", name: "Cable Ankle Strap", category: "cables" },
  { slug: "weight-plate", name: "Weight Plate", category: "free_weights" },
  { slug: "stability-ball", name: "Stability Ball", category: "accessories" },
  { slug: "exercise-sliders", name: "Exercise Sliders", category: "accessories" },
  { slug: "wrist-roller", name: "Wrist Roller", category: "accessories" },
  { slug: "captains-chair", name: "Captain's Chair", category: "accessories" },
  { slug: "back-extension-bench", name: "45-Degree Back Extension Bench", category: "machines" },
  { slug: "sandbag", name: "Sandbag", category: "free_weights" },
] as const;

const strengthPrescription = {
  sets: 3,
  repsMin: 8,
  repsMax: 12,
  tempo: "2111",
  targetRpe: 7,
  restSeconds: 75,
  substitutionPolicy: "flexible",
};

const isolationPrescription = {
  sets: 3,
  repsMin: 10,
  repsMax: 15,
  tempo: "2111",
  targetRpe: 7,
  restSeconds: 60,
  substitutionPolicy: "flexible",
};

const mobilityPrescription = {
  sets: 1,
  repsMin: 6,
  repsMax: 10,
  durationSeconds: 60,
  targetRpe: 3,
  restSeconds: 15,
  substitutionPolicy: "flexible",
};

const cardioPrescription = {
  sets: 1,
  durationSeconds: 1200,
  targetRpeMin: 3,
  targetRpeMax: 6,
  restSeconds: 0,
  substitutionPolicy: "flexible",
};

function aliasFor(name: string, resistanceType?: ResistanceType) {
  const aliases = new Set<string>();
  if (resistanceType === "dumbbell") aliases.add(name.replace("Dumbbell", "DB"));
  if (resistanceType === "barbell") aliases.add(name.replace("Barbell", "BB"));
  if (name.includes("Single-Arm")) aliases.add(name.replace("Single-Arm", "One-Arm"));
  if (name.includes("Single-Leg")) aliases.add(name.replace("Single-Leg", "One-Leg"));
  if (name.includes("Push-Up")) aliases.add(name.replace("Push-Up", "Pushup"));
  if (name.includes("Pull-Up")) aliases.add(name.replace("Pull-Up", "Pullup"));
  if (name.includes("Romanian Deadlift")) aliases.add(name.replace("Romanian Deadlift", "RDL"));
  if (name.includes("Triceps")) aliases.add(name.replace("Triceps", "Tricep"));
  if (name.includes("Calf Raise")) aliases.add(name.replace("Calf Raise", "Calf Raises"));
  if (name.includes("Fly")) aliases.add(name.replace("Fly", "Flye"));
  if (name.includes("Walk")) aliases.add(name.replace("Walk", "Walking"));
  return [...aliases].filter((alias) => alias !== name);
}

function normalizedExerciseText(slug: string, name: string) {
  return `${slug} ${name}`.toLowerCase();
}

function inferResistanceType(seed: FamilySeed, slug: string, name: string): ResistanceType | undefined {
  const text = normalizedExerciseText(slug, name);
  if (seed.classification === "cardio") return seed.resistanceType;
  if (text.includes("farmer-carry-calf-raise")) return "dumbbell";
  if (text.includes("band") || text.includes("mini-band")) return "band";
  if (text.includes("slider") || text.includes("stability-ball") || text.includes("nordic") || text.includes("razor-curl") || text.includes("glute-ham")) return "bodyweight";
  if (seed.classification === "mobility") return seed.resistanceType ?? "bodyweight";
  if (text.includes("smith")) return "smith_machine";
  if (text.includes("plate-loaded")) return "plate_loaded";
  if (text.includes("landmine")) return "landmine";
  if (text.includes("machine") || text.includes("hack-squat") || text.includes("leg-press") || text.includes("pendulum") || text.includes("v-squat")) return "machine";
  if (text.includes("cable") || text.includes("pulldown")) return "cable";
  if (text.includes("kettlebell")) return "kettlebell";
  if (text.includes("dumbbell") || text.includes("db")) return "dumbbell";
  if (text.includes("ez-bar") || text.includes("barbell") || text.includes("zercher") || text.includes("clean") || text.includes("snatch") || text.includes("jerk")) return "barbell";
  if (text.includes("medicine-ball")) return "medicine_ball";
  if (text.includes("sandbag")) return "sandbag";
  if (text.includes("suspension")) return "suspension";
  if (
    text.includes("bodyweight")
    || text.includes("push-up")
    || text.includes("pull-up")
    || text.includes("dip")
    || text.includes("plank")
    || text.includes("bear-crawl")
    || text.includes("hanging")
    || text.includes("copenhagen")
    || text.includes("shrimp-squat")
    || text.includes("pistol")
    || text.includes("clamshell")
    || text.includes("frog-pump")
    || text.includes("leg swing")
  ) {
    return "bodyweight";
  }
  return seed.resistanceType;
}

function inferEquipment(seed: FamilySeed, slug: string, name: string): readonly string[] | undefined {
  const text = normalizedExerciseText(slug, name);
  const equipment = new Set<string>();

  if (text.includes("treadmill")) equipment.add("treadmill");
  if (text.includes("recumbent-bike")) equipment.add("recumbent-bike");
  if (text.includes("stationary-bike")) equipment.add("stationary-bike");
  if (text.includes("elliptical")) equipment.add("elliptical");
  if (text.includes("rower")) equipment.add("rowing-machine");
  if (text.includes("stair-climber")) equipment.add("stair-climber");
  if (text.includes("assault-bike")) equipment.add("assault-bike");
  if (text.includes("ski-erg")) equipment.add("ski-erg");
  if (text.includes("battle-rope")) equipment.add("battle-rope");
  if (text.includes("jump-rope")) equipment.add("jump-rope");
  if (text.includes("sled")) equipment.add("sled");

  if (text.includes("cable") || text.includes("pulldown")) equipment.add("cable-station");
  if (text.includes("kickback") || text.includes("hip-adduction") || text.includes("hip-abduction") || (text.includes("cable") && text.includes("ankle"))) equipment.add("ankle-strap");
  if (text.includes("lat-pulldown")) equipment.add("lat-pulldown-machine");
  if (text.includes("machine-chest-press") || text.includes("plate-loaded-chest-press")) equipment.add("machine-chest-press");
  if (text.includes("machine-row") || text.includes("iso-lateral-machine-row") || text.includes("plate-loaded-high-row") || text.includes("plate-loaded-low-row")) equipment.add("machine-row");
  if (text.includes("machine-shoulder-press")) equipment.add("machine-shoulder-press");
  if (text.includes("machine-lateral-raise")) equipment.add("machine-lateral-raise");
  if (text.includes("machine-reverse-fly")) equipment.add("machine-rear-delt-fly");
  if (text.includes("machine-preacher-curl") || text.includes("machine-curl")) equipment.add("machine-curl");
  if (text.includes("machine-dip") || text.includes("assisted-dip")) equipment.add("dip-station");
  if (text.includes("machine-glute-kickback")) equipment.add("hip-thrust-machine");
  if (text.includes("machine-hip-hinge")) equipment.add("machine-back-extension");
  if (text.includes("machine-hip-adduction")) equipment.add("machine-hip-adduction");
  if (text.includes("machine-hip-abduction")) equipment.add("machine-hip-abduction");
  if (text.includes("machine-calf-raise") || text.includes("donkey-calf-raise")) equipment.add("machine-calf-raise");
  if (text.includes("seated-calf-raise")) equipment.add("seated-calf-raise-machine");
  if (text.includes("leg-press")) equipment.add("leg-press-machine");
  if (text.includes("hack-squat")) equipment.add("hack-squat-machine");
  if (text.includes("smith")) equipment.add("smith-machine");
  if (text.includes("pendulum") || text.includes("v-squat")) equipment.add("hack-squat-machine");
  if (text.includes("leg-curl") && text.includes("seated")) equipment.add("seated-leg-curl-machine");
  if (text.includes("leg-curl") && text.includes("lying") && !text.includes("banded")) equipment.add("lying-leg-curl-machine");
  if (text.includes("glute-ham")) equipment.add("glute-ham-developer");
  if (text.includes("razor-curl")) equipment.add("glute-ham-developer");
  if (text.includes("reverse-hyper")) equipment.add("reverse-hyper-machine");
  if (text.includes("45-degree-back-extension")) equipment.add("back-extension-bench");
  if (text.includes("captain")) equipment.add("captains-chair");
  if (text.includes("pull-up")) equipment.add("pull-up-bar");
  if (text.includes("band") || text.includes("mini-band")) equipment.add(text.includes("mini-band") ? "mini-band" : "resistance-band");
  if (text.includes("stability-ball")) equipment.add("stability-ball");
  if (text.includes("slider")) equipment.add("exercise-sliders");
  if (text.includes("wrist-roller")) equipment.add("wrist-roller");
  if (text.includes("plate")) equipment.add("weight-plate");
  if (text.includes("kettlebell")) equipment.add("kettlebells");
  if (text.includes("dumbbell") || text.includes("db")) equipment.add("dumbbells");
  if (text.includes("ez-bar")) equipment.add("ez-curl-bar");
  if (text.includes("barbell") || text.includes("clean") || text.includes("snatch") || text.includes("jerk") || text.includes("zercher")) equipment.add("barbell");
  if (text.includes("bench") || text.includes("incline") || text.includes("seal-row")) equipment.add(text.includes("floor") ? "yoga-mat" : "adjustable-bench");
  if (text.includes("sandbag")) equipment.add("sandbag");

  if (text.includes("bodyweight-calf-raise") || text.includes("wall-ankle-mobilization") || text.includes("half-kneeling-ankle-mobilization")) return [];
  if (text.includes("banded-ankle-distraction")) return ["resistance-band"];
  if (text.includes("pec-doorway") || text.includes("wall-pec-minor") || text.includes("wall-slide")) return [];
  if (text.includes("farmer-carry-calf-raise")) {
    equipment.delete("machine-calf-raise");
    equipment.add("dumbbells");
  }

  if (equipment.size > 0) return [...equipment];
  return seed.equipment;
}

function inferMovementPattern(seed: FamilySeed, slug: string, name: string): MovementPattern {
  const text = normalizedExerciseText(slug, name);
  if (text.includes("calf-raise") || text.includes("tibialis")) return "gait";
  if (text.includes("romanian-deadlift") || text.includes("hip-hinge") || text.includes("pull-through")) return "hip_hinge";
  if (text.includes("leg-curl") || text.includes("nordic") || text.includes("razor-curl") || text.includes("glute-ham")) return "knee_flexion";
  if (text.includes("terminal-knee-extension")) return "knee_extension";
  if (text.includes("ankle-mobilization") || text.includes("ankle-distraction")) return "gait";
  if (text.includes("couch-stretch") || text.includes("pigeon-stretch") || text.includes("90-90") || text.includes("adductor-rock") || text.includes("frog-rock") || text.includes("hamstring-floss")) return "hip_flexion";
  if (text.includes("pec-doorway") || text.includes("pec-minor") || text.includes("lat-stretch")) return "shoulder_adduction";
  if (text.includes("wall-slide") || text.includes("bird-dog-row-reach")) return "scapular_retraction";
  if (text.includes("glute-bridge")) return "hip_extension";
  if (text.includes("face-pull") || text.includes("pull-apart") || text.includes("reverse-fly") || text.includes("rear-delt")) return "scapular_retraction";
  if (text.includes("external-rotation") || text.includes("dislocate")) return "external_rotation";
  if (text.includes("pulldown") || text.includes("pull-up")) return "pull_vertical";
  if (text.includes("row")) return "pull_horizontal";
  if (text.includes("overhead-press") || text.includes("shoulder-press") || text.includes("front-raise") || text.includes("jerk")) return "push_vertical";
  if (text.includes("lateral-raise") || text.includes("scaption")) return "shoulder_abduction";
  if (text.includes("curl") && !text.includes("leg-curl")) return "elbow_flexion";
  if (text.includes("triceps") || text.includes("pushdown") || text.includes("dip")) return "elbow_extension";
  if (text.includes("lunge")) return "lunge";
  if (text.includes("split-squat") || text.includes("single-leg") || text.includes("pistol") || text.includes("shrimp") || text.includes("step-down") || text.includes("step-up") || text.includes("skater")) return "squat_unilateral";
  if (text.includes("squat") || text.includes("leg-press")) return "squat_bilateral";
  if (text.includes("hip-thrust") || text.includes("frog-pump") || text.includes("glute-kickback") || text.includes("hip-extension") || text.includes("hyperextension")) return "hip_extension";
  if (text.includes("pallof")) return "anti_rotation";
  if (text.includes("plank") || text.includes("hold") || text.includes("dead-bug") || text.includes("hollow") || text.includes("body-saw")) return "iso_hold";
  if (text.includes("reach-through") || text.includes("rotation") || text.includes("windmill") || text.includes("thread-the-needle")) return "rotation";
  if (text.includes("carry") || text.includes("walk") || text.includes("waiter")) return "carry";
  if (text.includes("clean") || text.includes("snatch")) return "hip_hinge";
  return seed.movementPattern;
}

function inferClassification(seed: FamilySeed, slug: string, name: string): ExerciseClassification {
  const pattern = inferMovementPattern(seed, slug, name);
  if (seed.classification === "cardio" || seed.classification === "mobility") return seed.classification;
  if (pattern === "knee_flexion" || pattern === "knee_extension" || pattern === "elbow_flexion" || pattern === "elbow_extension" || pattern === "shoulder_abduction" || pattern === "scapular_retraction" || pattern === "external_rotation") return "isolation";
  if (seed.cueKind === "power") return "power";
  return seed.classification;
}

function inferPrimary(seed: FamilySeed, slug: string, name: string): MuscleGroup {
  const text = normalizedExerciseText(slug, name);
  if (text.includes("couch-stretch")) return "hip_flexors";
  if (text.includes("ankle-mobilization") || text.includes("ankle-distraction")) return "calves";
  if (text.includes("pigeon-stretch") || text.includes("90-90") || text.includes("glute-bridge")) return "glutes";
  if (text.includes("frog-rock") || text.includes("adductor-rock")) return "adductors";
  if (text.includes("hamstring-floss")) return "hamstrings";
  if (text.includes("lat-stretch")) return "lats";
  if (text.includes("pec-doorway") || text.includes("pec-minor")) return "chest";
  if (text.includes("wall-slide") || text.includes("bird-dog-row-reach")) return "upper_back";
  if (text.includes("band-dislocate")) return "front_deltoid";
  if (text.includes("tibialis")) return "tibialis";
  if (text.includes("hip-adduction") || text.includes("adductor") || text.includes("copenhagen")) return "adductors";
  if (text.includes("hip-abduction") || text.includes("abductor") || text.includes("lateral-walk") || text.includes("monster-walk") || text.includes("clamshell")) return "abductors";
  if (text.includes("wrist") || text.includes("pinch") || text.includes("pronation") || text.includes("supination")) return "forearms";
  if (text.includes("front-raise")) return "front_deltoid";
  if (text.includes("face-pull") || text.includes("pull-apart") || text.includes("reverse-fly") || text.includes("rear-delt")) return "rear_deltoid";
  if (text.includes("hip-flexion") || text.includes("hanging-march") || text.includes("knee-raise")) return "hip_flexors";
  if (seed.classification === "cardio") return "cardiovascular";
  return seed.primary;
}

function inferSecondary(seed: FamilySeed, primary: MuscleGroup, slug: string, name: string): readonly MuscleGroup[] | undefined {
  const text = normalizedExerciseText(slug, name);
  const secondary = new Set<MuscleGroup>(seed.classification === "mobility" ? [] : seed.secondary ?? []);
  secondary.delete(primary);
  if (seed.classification === "mobility") {
    if (primary === "spinal_erectors") secondary.add("obliques");
    if (primary === "hip_flexors") secondary.add("glutes");
    if (primary === "glutes") secondary.add("hip_flexors");
    if (primary === "adductors") secondary.add("hip_flexors");
    if (primary === "lats" || primary === "chest") secondary.add("front_deltoid");
    if (primary === "upper_back") secondary.add("rear_deltoid");
    if (primary === "front_deltoid") secondary.add("lateral_deltoid");
    if (primary === "forearms") secondary.add("brachioradialis");
    if (primary === "hamstrings") secondary.add("glutes");
  }
  if (text.includes("tibialis")) secondary.add("calves");
  if (primary === "adductors") {
    secondary.add("hip_flexors");
    secondary.add("obliques");
  }
  if (primary === "abductors") secondary.add("glutes");
  if (primary === "forearms") {
    secondary.add("brachioradialis");
    secondary.delete("brachialis");
  }
  if (primary === "front_deltoid") {
    secondary.add("lateral_deltoid");
    secondary.delete("front_deltoid");
  }
  if (primary === "rear_deltoid") {
    secondary.add("rhomboids");
    secondary.add("trapezius");
  }
  if (primary === "cardiovascular") {
    secondary.add("quadriceps");
    secondary.add("glutes");
    secondary.add("calves");
  }
  return secondary.size > 0 ? [...secondary] : undefined;
}

function exerciseFromFamily(seed: FamilySeed, variant: VariantSeed): ReviewExercise {
  const [slug, name, extraAliases = []] = variant;
  const resistanceType = inferResistanceType(seed, slug, name);
  const movementPattern = inferMovementPattern(seed, slug, name);
  const classification = inferClassification(seed, slug, name);
  const primary = inferPrimary(seed, slug, name);
  const equipment = inferEquipment(seed, slug, name);
  const prescription = seed.classification === "mobility"
    ? mobilityPrescription
    : seed.classification === "cardio"
      ? cardioPrescription
      : seed.classification === "isolation"
        ? isolationPrescription
        : strengthPrescription;

  return {
    slug,
    name,
    alternateNames: [...aliasFor(name, resistanceType), ...extraAliases],
    movementPattern,
    classification,
    resistanceType,
    difficulty: seed.difficulty ?? "beginner",
    unilateral: seed.unilateral,
    isTimeBased: seed.isTimeBased,
    isDistanceBased: seed.isDistanceBased,
    isCardio: seed.isCardio,
    isMobility: seed.isMobility,
    defaultBodyPosition: seed.defaultBodyPosition,
    fatigueCost: seed.fatigueCost,
    technicalComplexity: seed.technicalComplexity,
    stabilityDemand: seed.stabilityDemand,
    jointStressShoulder: seed.jointStressShoulder,
    jointStressElbow: seed.jointStressElbow,
    jointStressWrist: seed.jointStressWrist,
    jointStressSpine: seed.jointStressSpine,
    jointStressHip: seed.jointStressHip,
    jointStressKnee: seed.jointStressKnee,
    jointStressAnkle: seed.jointStressAnkle,
    lengthenedBias: seed.lengthenedBias,
    shortenedBias: seed.shortenedBias,
    stretchMediatedPotential: seed.stretchMediatedPotential,
    defaultPrescription: prescription,
    primary,
    secondary: inferSecondary(seed, primary, slug, name),
    stabilizers: seed.stabilizers,
    equipment,
    family: seed.family,
    cueKind: seed.cueKind,
  };
}

const FAMILIES: readonly FamilySeed[] = [
  {
    family: "chest-press",
    cueKind: "press",
    movementPattern: "push_horizontal",
    classification: "compound",
    resistanceType: "dumbbell",
    primary: "chest",
    secondary: ["front_deltoid", "triceps"],
    equipment: ["dumbbells", "adjustable-bench"],
    defaultBodyPosition: "incline",
    fatigueCost: 6,
    technicalComplexity: 4,
    stabilityDemand: 5,
    jointStressShoulder: 5,
    jointStressElbow: 3,
    jointStressSpine: 2,
    lengthenedBias: 7,
    shortenedBias: 5,
    stretchMediatedPotential: 7,
    variants: [
      ["low-incline-dumbbell-bench-press", "Low-Incline Dumbbell Bench Press"],
      ["high-incline-dumbbell-bench-press", "High-Incline Dumbbell Bench Press"],
      ["alternating-dumbbell-bench-press", "Alternating Dumbbell Bench Press"],
      ["single-arm-incline-dumbbell-bench-press", "Single-Arm Incline Dumbbell Bench Press"],
      ["dumbbell-squeeze-press", "Dumbbell Squeeze Press"],
      ["incline-dumbbell-squeeze-press", "Incline Dumbbell Squeeze Press"],
      ["dumbbell-crush-grip-bench-press", "Dumbbell Crush-Grip Bench Press"],
      ["dumbbell-bench-press-1-and-1-4", "Dumbbell Bench Press 1-and-1/4 Rep"],
      ["pause-dumbbell-bench-press", "Pause Dumbbell Bench Press"],
      ["tempo-dumbbell-bench-press", "Tempo Dumbbell Bench Press"],
    ],
  },
  {
    family: "chest-cable-machine",
    cueKind: "press",
    movementPattern: "push_horizontal",
    classification: "compound",
    resistanceType: "cable",
    primary: "chest",
    secondary: ["front_deltoid", "triceps"],
    equipment: ["cable-station"],
    defaultBodyPosition: "standing",
    fatigueCost: 5,
    technicalComplexity: 4,
    stabilityDemand: 5,
    jointStressShoulder: 4,
    jointStressElbow: 3,
    jointStressSpine: 2,
    lengthenedBias: 6,
    shortenedBias: 6,
    stretchMediatedPotential: 6,
    variants: [
      ["standing-cable-chest-press", "Standing Cable Chest Press"],
      ["single-arm-cable-chest-press", "Single-Arm Cable Chest Press"],
      ["split-stance-cable-chest-press", "Split-Stance Cable Chest Press"],
      ["low-to-high-cable-chest-press", "Low-to-High Cable Chest Press"],
      ["high-to-low-cable-chest-press", "High-to-Low Cable Chest Press"],
      ["half-kneeling-single-arm-cable-press", "Half-Kneeling Single-Arm Cable Press"],
      ["machine-chest-press-neutral-grip", "Machine Chest Press Neutral Grip"],
      ["machine-chest-press-wide-grip", "Machine Chest Press Wide Grip"],
      ["machine-chest-press-single-arm", "Machine Chest Press Single Arm"],
      ["plate-loaded-chest-press", "Plate-Loaded Chest Press"],
    ],
  },
  {
    family: "chest-fly-lengthened",
    cueKind: "press",
    movementPattern: "push_horizontal",
    classification: "isolation",
    resistanceType: "cable",
    primary: "chest",
    secondary: ["front_deltoid"],
    equipment: ["cable-station"],
    defaultBodyPosition: "standing",
    fatigueCost: 3,
    technicalComplexity: 3,
    stabilityDemand: 4,
    jointStressShoulder: 5,
    jointStressElbow: 1,
    lengthenedBias: 8,
    shortenedBias: 6,
    stretchMediatedPotential: 8,
    variants: [
      ["bayesian-cable-chest-fly", "Bayesian Cable Chest Fly"],
      ["single-arm-cable-chest-fly", "Single-Arm Cable Chest Fly"],
      ["incline-cable-chest-fly", "Incline Cable Chest Fly"],
      ["decline-cable-chest-fly", "Decline Cable Chest Fly"],
      ["seated-cable-chest-fly", "Seated Cable Chest Fly"],
      ["lying-cable-chest-fly", "Lying Cable Chest Fly"],
      ["paused-stretch-dumbbell-chest-fly", "Paused-Stretch Dumbbell Chest Fly"],
      ["lengthened-partial-dumbbell-chest-fly", "Lengthened-Partial Dumbbell Chest Fly"],
      ["floor-dumbbell-chest-fly", "Floor Dumbbell Chest Fly"],
      ["single-arm-dumbbell-chest-fly", "Single-Arm Dumbbell Chest Fly"],
    ],
  },
  {
    family: "back-horizontal-pull",
    cueKind: "pull",
    movementPattern: "pull_horizontal",
    classification: "compound",
    resistanceType: "dumbbell",
    primary: "lats",
    secondary: ["upper_back", "rear_deltoid", "biceps"],
    stabilizers: ["spinal_erectors"],
    equipment: ["dumbbells", "adjustable-bench"],
    defaultBodyPosition: "hinge_position",
    fatigueCost: 5,
    technicalComplexity: 4,
    stabilityDemand: 5,
    jointStressShoulder: 4,
    jointStressElbow: 3,
    jointStressWrist: 2,
    jointStressSpine: 3,
    lengthenedBias: 7,
    shortenedBias: 6,
    stretchMediatedPotential: 6,
    variants: [
      ["two-arm-dumbbell-row", "Two-Arm Dumbbell Row"],
      ["chest-supported-neutral-grip-dumbbell-row", "Chest-Supported Neutral-Grip Dumbbell Row"],
      ["chest-supported-wide-dumbbell-row", "Chest-Supported Wide Dumbbell Row"],
      ["elbows-out-dumbbell-row", "Elbows-Out Dumbbell Row"],
      ["bench-supported-single-arm-dumbbell-row", "Bench-Supported Single-Arm Dumbbell Row"],
      ["contralateral-single-arm-dumbbell-row", "Contralateral Single-Arm Dumbbell Row"],
      ["dead-stop-dumbbell-row", "Dead-Stop Dumbbell Row"],
      ["lengthened-partial-dumbbell-row", "Lengthened-Partial Dumbbell Row"],
      ["seal-row-dumbbell", "Dumbbell Seal Row"],
      ["incline-prone-dumbbell-row", "Incline Prone Dumbbell Row"],
      ["chest-supported-kettlebell-row", "Chest-Supported Kettlebell Row"],
      ["single-arm-kettlebell-row", "Single-Arm Kettlebell Row"],
    ],
  },
  {
    family: "back-cable-machine",
    cueKind: "pull",
    movementPattern: "pull_horizontal",
    classification: "compound",
    resistanceType: "cable",
    primary: "upper_back",
    secondary: ["lats", "rear_deltoid", "biceps"],
    equipment: ["cable-station"],
    defaultBodyPosition: "seated",
    fatigueCost: 4,
    technicalComplexity: 3,
    stabilityDemand: 3,
    jointStressShoulder: 3,
    jointStressElbow: 3,
    jointStressWrist: 2,
    jointStressSpine: 2,
    lengthenedBias: 6,
    shortenedBias: 7,
    stretchMediatedPotential: 5,
    variants: [
      ["neutral-grip-seated-cable-row", "Neutral-Grip Seated Cable Row"],
      ["rope-seated-cable-row", "Rope Seated Cable Row"],
      ["single-arm-seated-cable-row", "Single-Arm Seated Cable Row"],
      ["high-to-low-cable-row", "High-to-Low Cable Row"],
      ["low-cable-row-to-hip", "Low Cable Row to Hip"],
      ["standing-cable-row", "Standing Cable Row"],
      ["half-kneeling-single-arm-cable-row", "Half-Kneeling Single-Arm Cable Row"],
      ["machine-row-neutral-grip", "Machine Row Neutral Grip"],
      ["machine-row-wide-grip", "Machine Row Wide Grip"],
      ["iso-lateral-machine-row", "Iso-Lateral Machine Row"],
      ["plate-loaded-high-row", "Plate-Loaded High Row"],
      ["plate-loaded-low-row", "Plate-Loaded Low Row"],
    ],
  },
  {
    family: "lats-vertical-pull",
    cueKind: "pull",
    movementPattern: "pull_vertical",
    classification: "compound",
    resistanceType: "cable",
    primary: "lats",
    secondary: ["biceps", "rear_deltoid"],
    equipment: ["lat-pulldown-machine"],
    defaultBodyPosition: "seated",
    fatigueCost: 4,
    technicalComplexity: 3,
    stabilityDemand: 2,
    jointStressShoulder: 4,
    jointStressElbow: 3,
    jointStressWrist: 2,
    lengthenedBias: 7,
    shortenedBias: 6,
    stretchMediatedPotential: 7,
    variants: [
      ["neutral-grip-lat-pulldown", "Neutral-Grip Lat Pulldown"],
      ["wide-neutral-grip-lat-pulldown", "Wide Neutral-Grip Lat Pulldown"],
      ["v-bar-lat-pulldown", "V-Bar Lat Pulldown"],
      ["kneeling-lat-pulldown", "Kneeling Lat Pulldown"],
      ["single-arm-kneeling-lat-pulldown", "Single-Arm Kneeling Lat Pulldown"],
      ["cross-body-lat-pulldown", "Cross-Body Lat Pulldown"],
      ["bayesian-lat-pulldown", "Bayesian Lat Pulldown"],
      ["machine-lat-pulldown-neutral-grip", "Machine Lat Pulldown Neutral Grip"],
      ["assisted-neutral-grip-pull-up", "Assisted Neutral-Grip Pull-Up"],
      ["band-assisted-pull-up", "Band-Assisted Pull-Up"],
      ["eccentric-neutral-grip-pull-up", "Eccentric Neutral-Grip Pull-Up"],
      ["chest-supported-lat-pulldown", "Chest-Supported Lat Pulldown"],
    ],
  },
  {
    family: "shoulders-press",
    cueKind: "press",
    movementPattern: "push_vertical",
    classification: "compound",
    resistanceType: "dumbbell",
    primary: "front_deltoid",
    secondary: ["lateral_deltoid", "triceps"],
    equipment: ["dumbbells"],
    defaultBodyPosition: "standing",
    fatigueCost: 5,
    technicalComplexity: 4,
    stabilityDemand: 5,
    jointStressShoulder: 5,
    jointStressElbow: 3,
    jointStressSpine: 3,
    lengthenedBias: 4,
    shortenedBias: 7,
    stretchMediatedPotential: 3,
    variants: [
      ["standing-neutral-grip-dumbbell-overhead-press", "Standing Neutral-Grip Dumbbell Overhead Press"],
      ["seated-neutral-grip-dumbbell-overhead-press", "Seated Neutral-Grip Dumbbell Overhead Press"],
      ["single-arm-standing-dumbbell-overhead-press", "Single-Arm Standing Dumbbell Overhead Press"],
      ["single-arm-seated-dumbbell-overhead-press", "Single-Arm Seated Dumbbell Overhead Press"],
      ["alternating-dumbbell-overhead-press", "Alternating Dumbbell Overhead Press"],
      ["tempo-dumbbell-overhead-press", "Tempo Dumbbell Overhead Press"],
      ["pause-dumbbell-overhead-press", "Pause Dumbbell Overhead Press"],
      ["machine-shoulder-press-neutral-grip", "Machine Shoulder Press Neutral Grip"],
      ["single-arm-machine-shoulder-press", "Single-Arm Machine Shoulder Press"],
      ["cable-shoulder-press", "Cable Shoulder Press"],
      ["single-arm-cable-shoulder-press", "Single-Arm Cable Shoulder Press"],
      ["half-kneeling-cable-shoulder-press", "Half-Kneeling Cable Shoulder Press"],
    ],
  },
  {
    family: "shoulders-raise",
    cueKind: "raise",
    movementPattern: "shoulder_abduction",
    classification: "isolation",
    resistanceType: "dumbbell",
    primary: "lateral_deltoid",
    secondary: ["front_deltoid"],
    stabilizers: ["trapezius"],
    equipment: ["dumbbells"],
    defaultBodyPosition: "standing",
    fatigueCost: 2,
    technicalComplexity: 2,
    stabilityDemand: 3,
    jointStressShoulder: 4,
    jointStressElbow: 1,
    jointStressWrist: 2,
    lengthenedBias: 3,
    shortenedBias: 8,
    stretchMediatedPotential: 2,
    variants: [
      ["lean-away-dumbbell-lateral-raise", "Lean-Away Dumbbell Lateral Raise"],
      ["dead-stop-dumbbell-lateral-raise", "Dead-Stop Dumbbell Lateral Raise"],
      ["lengthened-partial-cable-lateral-raise", "Lengthened-Partial Cable Lateral Raise"],
      ["cuffed-cable-lateral-raise", "Cuffed Cable Lateral Raise"],
      ["single-arm-machine-lateral-raise", "Single-Arm Machine Lateral Raise"],
      ["dual-cable-lateral-raise", "Dual Cable Lateral Raise"],
      ["seated-machine-lateral-raise", "Seated Machine Lateral Raise"],
      ["thumbs-up-dumbbell-lateral-raise", "Thumbs-Up Dumbbell Lateral Raise"],
      ["scaption-raise-cable", "Cable Scaption Raise"],
      ["plate-front-raise", "Plate Front Raise"],
      ["band-front-raise", "Band Front Raise"],
      ["incline-dumbbell-front-raise", "Incline Dumbbell Front Raise"],
    ],
  },
  {
    family: "rear-delts-traps",
    cueKind: "pull",
    movementPattern: "scapular_retraction",
    classification: "isolation",
    resistanceType: "cable",
    primary: "rear_deltoid",
    secondary: ["rhomboids", "trapezius"],
    equipment: ["cable-station"],
    defaultBodyPosition: "standing",
    fatigueCost: 2,
    technicalComplexity: 3,
    stabilityDemand: 3,
    jointStressShoulder: 3,
    jointStressElbow: 2,
    jointStressSpine: 1,
    lengthenedBias: 5,
    shortenedBias: 7,
    stretchMediatedPotential: 4,
    variants: [
      ["rope-face-pull-to-external-rotation", "Rope Face Pull to External Rotation"],
      ["high-cable-face-pull", "High Cable Face Pull"],
      ["low-cable-face-pull", "Low Cable Face Pull"],
      ["band-face-pull", "Band Face Pull"],
      ["band-pull-apart-overhand", "Band Pull-Apart Overhand"],
      ["band-pull-apart-underhand", "Band Pull-Apart Underhand"],
      ["cable-reverse-fly-high-to-low", "Cable Reverse Fly High-to-Low"],
      ["cable-reverse-fly-low-to-high", "Cable Reverse Fly Low-to-High"],
      ["single-arm-cable-rear-delt-fly", "Single-Arm Cable Rear Delt Fly"],
      ["incline-dumbbell-reverse-fly", "Incline Dumbbell Reverse Fly"],
      ["seated-dumbbell-reverse-fly", "Seated Dumbbell Reverse Fly"],
      ["machine-reverse-fly-neutral-grip", "Machine Reverse Fly Neutral Grip"],
    ],
  },
  {
    family: "biceps",
    cueKind: "curl",
    movementPattern: "elbow_flexion",
    classification: "isolation",
    resistanceType: "dumbbell",
    primary: "biceps",
    secondary: ["brachialis"],
    stabilizers: ["forearms"],
    equipment: ["dumbbells"],
    defaultBodyPosition: "standing",
    fatigueCost: 2,
    technicalComplexity: 2,
    stabilityDemand: 3,
    jointStressElbow: 3,
    jointStressWrist: 2,
    lengthenedBias: 4,
    shortenedBias: 6,
    stretchMediatedPotential: 3,
    variants: [
      ["supinating-dumbbell-curl", "Supinating Dumbbell Curl"],
      ["seated-alternating-dumbbell-curl", "Seated Alternating Dumbbell Curl"],
      ["incline-hammer-curl", "Incline Hammer Curl"],
      ["incline-supinating-dumbbell-curl", "Incline Supinating Dumbbell Curl"],
      ["bayesian-cable-curl", "Bayesian Cable Curl"],
      ["single-arm-bayesian-cable-curl", "Single-Arm Bayesian Cable Curl"],
      ["lying-cable-curl", "Lying Cable Curl"],
      ["high-cable-curl", "High Cable Curl"],
      ["dual-cable-biceps-curl", "Dual Cable Biceps Curl"],
      ["rope-cable-curl", "Rope Cable Curl"],
      ["ez-bar-preacher-curl", "EZ-Bar Preacher Curl"],
      ["machine-preacher-curl", "Machine Preacher Curl"],
      ["single-arm-machine-curl", "Single-Arm Machine Curl"],
      ["lengthened-partial-incline-curl", "Lengthened-Partial Incline Curl"],
      ["spider-dumbbell-curl", "Spider Dumbbell Curl"],
      ["drag-curl-dumbbell", "Dumbbell Drag Curl"],
    ],
  },
  {
    family: "triceps",
    cueKind: "extension",
    movementPattern: "elbow_extension",
    classification: "isolation",
    resistanceType: "cable",
    primary: "triceps",
    stabilizers: ["forearms"],
    equipment: ["cable-station"],
    defaultBodyPosition: "standing",
    fatigueCost: 3,
    technicalComplexity: 2,
    stabilityDemand: 3,
    jointStressShoulder: 2,
    jointStressElbow: 4,
    jointStressWrist: 2,
    lengthenedBias: 5,
    shortenedBias: 7,
    stretchMediatedPotential: 5,
    variants: [
      ["v-bar-cable-triceps-pushdown", "V-Bar Cable Triceps Pushdown"],
      ["ez-bar-cable-triceps-pushdown", "EZ-Bar Cable Triceps Pushdown"],
      ["dual-rope-cable-triceps-pushdown", "Dual-Rope Cable Triceps Pushdown"],
      ["cuffed-cable-triceps-pushdown", "Cuffed Cable Triceps Pushdown"],
      ["single-arm-rope-triceps-pushdown", "Single-Arm Rope Triceps Pushdown"],
      ["single-arm-reverse-grip-cable-pushdown", "Single-Arm Reverse-Grip Cable Pushdown"],
      ["kneeling-overhead-cable-triceps-extension", "Kneeling Overhead Cable Triceps Extension"],
      ["rope-overhead-triceps-extension", "Rope Overhead Triceps Extension"],
      ["incline-dumbbell-triceps-extension", "Incline Dumbbell Triceps Extension"],
      ["seated-single-dumbbell-triceps-extension", "Seated Single-Dumbbell Triceps Extension"],
      ["cross-body-dumbbell-triceps-extension", "Cross-Body Dumbbell Triceps Extension"],
      ["single-arm-lying-dumbbell-triceps-extension", "Single-Arm Lying Dumbbell Triceps Extension"],
      ["machine-dip-triceps-focus", "Machine Dip Triceps Focus"],
      ["assisted-dip-triceps-focus", "Assisted Dip Triceps Focus"],
      ["close-grip-push-up-triceps-focus", "Close-Grip Push-Up Triceps Focus"],
      ["band-overhead-triceps-extension", "Band Overhead Triceps Extension"],
    ],
  },
  {
    family: "forearms-grip",
    cueKind: "curl",
    movementPattern: "elbow_flexion",
    classification: "isolation",
    resistanceType: "dumbbell",
    primary: "forearms",
    secondary: ["brachioradialis"],
    equipment: ["dumbbells"],
    defaultBodyPosition: "seated",
    fatigueCost: 2,
    technicalComplexity: 2,
    stabilityDemand: 2,
    jointStressElbow: 3,
    jointStressWrist: 4,
    lengthenedBias: 5,
    shortenedBias: 6,
    stretchMediatedPotential: 4,
    variants: [
      ["seated-dumbbell-wrist-curl", "Seated Dumbbell Wrist Curl"],
      ["seated-dumbbell-reverse-wrist-curl", "Seated Dumbbell Reverse Wrist Curl"],
      ["barbell-wrist-curl", "Barbell Wrist Curl"],
      ["barbell-reverse-wrist-curl", "Barbell Reverse Wrist Curl"],
      ["behind-the-back-barbell-wrist-curl", "Behind-the-Back Barbell Wrist Curl"],
      ["cable-wrist-curl", "Cable Wrist Curl"],
      ["cable-reverse-wrist-curl", "Cable Reverse Wrist Curl"],
      ["plate-pinch-hold", "Plate Pinch Hold"],
      ["dumbbell-pronation-supination", "Dumbbell Pronation-Supination"],
      ["wrist-roller", "Wrist Roller"],
      ["hammer-lever-pronation", "Hammer Lever Pronation"],
      ["hammer-lever-supination", "Hammer Lever Supination"],
    ],
  },
  {
    family: "quads",
    cueKind: "squat",
    movementPattern: "squat_bilateral",
    classification: "compound",
    resistanceType: "barbell",
    primary: "quadriceps",
    secondary: ["glutes", "adductors"],
    stabilizers: ["spinal_erectors"],
    equipment: ["barbell", "power-rack"],
    defaultBodyPosition: "standing",
    fatigueCost: 7,
    technicalComplexity: 5,
    stabilityDemand: 5,
    jointStressSpine: 5,
    jointStressHip: 5,
    jointStressKnee: 6,
    jointStressAnkle: 4,
    lengthenedBias: 8,
    shortenedBias: 4,
    stretchMediatedPotential: 8,
    variants: [
      ["heels-elevated-back-squat", "Heels-Elevated Back Squat"],
      ["narrow-stance-back-squat", "Narrow-Stance Back Squat"],
      ["tempo-back-squat", "Tempo Back Squat"],
      ["pin-squat", "Pin Squat"],
      ["anderson-squat", "Anderson Squat"],
      ["cyclist-squat", "Cyclist Squat"],
      ["dumbbell-front-squat", "Dumbbell Front Squat"],
      ["double-kettlebell-front-squat", "Double Kettlebell Front Squat"],
      ["smith-machine-front-squat", "Smith Machine Front Squat"],
      ["smith-machine-heel-elevated-squat", "Smith Machine Heel-Elevated Squat"],
      ["pendulum-squat", "Pendulum Squat"],
      ["machine-v-squat", "Machine V-Squat"],
      ["single-leg-hack-squat", "Single-Leg Hack Squat"],
      ["single-leg-leg-press-quad-bias", "Single-Leg Leg Press Quad Bias"],
      ["heel-elevated-leg-press", "Heel-Elevated Leg Press"],
      ["tempo-spanish-squat", "Tempo Spanish Squat"],
      ["band-terminal-knee-extension", "Band Terminal Knee Extension"],
      ["cable-terminal-knee-extension", "Cable Terminal Knee Extension"],
    ],
  },
  {
    family: "unilateral-quads",
    cueKind: "lunge",
    movementPattern: "squat_unilateral",
    classification: "compound",
    resistanceType: "dumbbell",
    primary: "quadriceps",
    secondary: ["glutes", "adductors"],
    stabilizers: ["abductors"],
    equipment: ["dumbbells"],
    unilateral: true,
    defaultBodyPosition: "split_stance",
    fatigueCost: 5,
    technicalComplexity: 4,
    stabilityDemand: 6,
    jointStressHip: 4,
    jointStressKnee: 5,
    jointStressAnkle: 4,
    lengthenedBias: 7,
    shortenedBias: 4,
    stretchMediatedPotential: 7,
    variants: [
      ["front-foot-elevated-split-squat", "Front-Foot-Elevated Split Squat"],
      ["rear-foot-elevated-split-squat-bodyweight", "Rear-Foot-Elevated Split Squat Bodyweight"],
      ["contralateral-dumbbell-split-squat", "Contralateral Dumbbell Split Squat"],
      ["ipsilateral-dumbbell-split-squat", "Ipsilateral Dumbbell Split Squat"],
      ["deficit-reverse-lunge", "Deficit Reverse Lunge"],
      ["front-foot-elevated-reverse-lunge", "Front-Foot-Elevated Reverse Lunge"],
      ["walking-lunge-dumbbell", "Dumbbell Walking Lunge"],
      ["alternating-forward-lunge-dumbbell", "Alternating Dumbbell Forward Lunge"],
      ["goblet-reverse-lunge", "Goblet Reverse Lunge"],
      ["slider-reverse-lunge", "Slider Reverse Lunge"],
      ["cable-step-up", "Cable Step-Up"],
      ["lateral-step-down", "Lateral Step-Down"],
      ["step-down-to-box", "Step-Down to Box"],
      ["skater-squat-to-box", "Skater Squat to Box"],
      ["assisted-pistol-squat", "Assisted Pistol Squat"],
      ["shrimp-squat", "Shrimp Squat"],
    ],
  },
  {
    family: "hamstrings",
    cueKind: "hinge",
    movementPattern: "hip_hinge",
    classification: "compound",
    resistanceType: "dumbbell",
    primary: "hamstrings",
    secondary: ["glutes", "spinal_erectors"],
    equipment: ["dumbbells"],
    defaultBodyPosition: "hinge_position",
    fatigueCost: 5,
    technicalComplexity: 4,
    stabilityDemand: 5,
    jointStressSpine: 4,
    jointStressHip: 5,
    jointStressKnee: 2,
    lengthenedBias: 8,
    shortenedBias: 4,
    stretchMediatedPotential: 8,
    variants: [
      ["staggered-stance-dumbbell-romanian-deadlift", "Staggered-Stance Dumbbell Romanian Deadlift"],
      ["contralateral-single-leg-romanian-deadlift", "Contralateral Single-Leg Romanian Deadlift"],
      ["ipsilateral-single-leg-romanian-deadlift", "Ipsilateral Single-Leg Romanian Deadlift"],
      ["slider-leg-curl", "Slider Leg Curl"],
      ["stability-ball-leg-curl", "Stability Ball Leg Curl"],
      ["single-leg-slider-leg-curl", "Single-Leg Slider Leg Curl"],
      ["single-leg-stability-ball-leg-curl", "Single-Leg Stability Ball Leg Curl"],
      ["banded-lying-leg-curl", "Banded Lying Leg Curl"],
      ["standing-cable-leg-curl", "Standing Cable Leg Curl"],
      ["single-leg-seated-leg-curl", "Single-Leg Seated Leg Curl"],
      ["single-leg-lying-leg-curl", "Single-Leg Lying Leg Curl"],
      ["nordic-curl-assisted-band", "Band-Assisted Nordic Curl"],
      ["razor-curl", "Razor Curl"],
      ["glute-ham-raise-hamstring-bias", "Glute-Ham Raise Hamstring Bias"],
      ["machine-hip-hinge-hamstring-bias", "Machine Hip Hinge Hamstring Bias"],
      ["cable-romanian-deadlift", "Cable Romanian Deadlift"],
    ],
  },
  {
    family: "glutes",
    cueKind: "hinge",
    movementPattern: "hip_extension",
    classification: "compound",
    resistanceType: "barbell",
    primary: "glutes",
    secondary: ["hamstrings"],
    stabilizers: ["quadriceps"],
    equipment: ["barbell", "flat-bench"],
    defaultBodyPosition: "lying_supine",
    fatigueCost: 5,
    technicalComplexity: 3,
    stabilityDemand: 4,
    jointStressSpine: 3,
    jointStressHip: 5,
    jointStressKnee: 2,
    lengthenedBias: 4,
    shortenedBias: 9,
    stretchMediatedPotential: 4,
    variants: [
      ["pause-barbell-hip-thrust", "Pause Barbell Hip Thrust"],
      ["tempo-barbell-hip-thrust", "Tempo Barbell Hip Thrust"],
      ["barbell-hip-thrust-1-and-1-4", "Barbell Hip Thrust 1-and-1/4 Rep"],
      ["b-stance-hip-thrust", "B-Stance Hip Thrust"],
      ["single-leg-bench-hip-thrust", "Single-Leg Bench Hip Thrust"],
      ["dumbbell-hip-thrust", "Dumbbell Hip Thrust"],
      ["banded-hip-thrust", "Banded Hip Thrust"],
      ["frog-pump", "Frog Pump"],
      ["banded-frog-pump", "Banded Frog Pump"],
      ["cable-glute-kickback", "Cable Glute Kickback"],
      ["standing-cable-hip-extension", "Standing Cable Hip Extension"],
      ["quadruped-cable-hip-extension", "Quadruped Cable Hip Extension"],
      ["machine-glute-kickback", "Machine Glute Kickback"],
      ["reverse-hyperextension-glute-bias", "Reverse Hyperextension Glute Bias"],
      ["45-degree-back-extension-glute-bias", "45-Degree Back Extension Glute Bias"],
      ["pull-through-glute-bias", "Cable Pull-Through Glute Bias"],
    ],
  },
  {
    family: "calves",
    cueKind: "raise",
    movementPattern: "gait",
    classification: "isolation",
    resistanceType: "machine",
    primary: "calves",
    stabilizers: ["tibialis"],
    equipment: ["machine-calf-raise"],
    defaultBodyPosition: "standing",
    fatigueCost: 3,
    technicalComplexity: 2,
    stabilityDemand: 2,
    jointStressKnee: 2,
    jointStressAnkle: 5,
    lengthenedBias: 7,
    shortenedBias: 8,
    stretchMediatedPotential: 6,
    variants: [
      ["pause-standing-calf-raise-machine", "Pause Standing Calf Raise Machine"],
      ["lengthened-partial-standing-calf-raise", "Lengthened-Partial Standing Calf Raise"],
      ["single-leg-machine-calf-raise", "Single-Leg Machine Calf Raise"],
      ["smith-machine-calf-raise", "Smith Machine Calf Raise"],
      ["donkey-calf-raise-machine", "Donkey Calf Raise Machine"],
      ["seated-calf-raise-pause", "Seated Calf Raise Pause"],
      ["single-leg-seated-calf-raise", "Single-Leg Seated Calf Raise"],
      ["leg-press-single-leg-calf-raise", "Leg Press Single-Leg Calf Raise"],
      ["dumbbell-single-leg-calf-raise", "Dumbbell Single-Leg Calf Raise"],
      ["bent-knee-bodyweight-calf-raise", "Bent-Knee Bodyweight Calf Raise"],
      ["farmer-carry-calf-raise", "Farmer Carry Calf Raise"],
      ["tibialis-raise", "Tibialis Raise"],
    ],
  },
  {
    family: "core",
    cueKind: "core",
    movementPattern: "anti_rotation",
    classification: "isolation",
    resistanceType: "bodyweight",
    primary: "transverse_abdominis",
    secondary: ["obliques", "rectus_abdominis"],
    defaultBodyPosition: "lying_supine",
    isTimeBased: true,
    fatigueCost: 2,
    technicalComplexity: 2,
    stabilityDemand: 5,
    jointStressShoulder: 1,
    jointStressSpine: 2,
    jointStressHip: 2,
    lengthenedBias: 1,
    shortenedBias: 4,
    stretchMediatedPotential: 0,
    variants: [
      ["dead-bug-heel-tap", "Dead Bug Heel Tap"],
      ["dead-bug-band-pulldown", "Dead Bug Band Pulldown"],
      ["dead-bug-wall-press", "Dead Bug Wall Press"],
      ["hollow-body-rock", "Hollow Body Rock"],
      ["hollow-body-dead-bug", "Hollow Body Dead Bug"],
      ["long-lever-plank", "Long-Lever Plank"],
      ["rkc-plank-bodyweight", "RKC Plank Bodyweight"],
      ["plank-shoulder-tap", "Plank Shoulder Tap"],
      ["side-plank-reach-through", "Side Plank Reach-Through"],
      ["side-plank-hip-lift", "Side Plank Hip Lift"],
      ["copenhagen-side-plank-short-lever", "Copenhagen Side Plank Short Lever"],
      ["copenhagen-side-plank-long-lever", "Copenhagen Side Plank Long Lever"],
      ["half-kneeling-pallof-hold", "Half-Kneeling Pallof Hold"],
      ["standing-pallof-hold", "Standing Pallof Hold"],
      ["tall-kneeling-pallof-press", "Tall-Kneeling Pallof Press"],
      ["cable-dead-bug-pullover", "Cable Dead Bug Pullover"],
      ["stability-ball-plank", "Stability Ball Plank"],
      ["stability-ball-body-saw", "Stability Ball Body Saw"],
      ["bear-crawl-hold", "Bear Crawl Hold"],
      ["bear-crawl-forward", "Bear Crawl Forward"],
    ],
  },
  {
    family: "hips-adductors-abductors",
    cueKind: "raise",
    movementPattern: "hip_flexion",
    classification: "isolation",
    resistanceType: "cable",
    primary: "hip_flexors",
    secondary: ["adductors", "abductors"],
    equipment: ["cable-station", "ankle-strap"],
    defaultBodyPosition: "standing",
    fatigueCost: 2,
    technicalComplexity: 2,
    stabilityDemand: 4,
    jointStressHip: 3,
    jointStressKnee: 1,
    jointStressAnkle: 1,
    lengthenedBias: 5,
    shortenedBias: 6,
    stretchMediatedPotential: 3,
    variants: [
      ["standing-cable-hip-flexion", "Standing Cable Hip Flexion"],
      ["hanging-march", "Hanging March"],
      ["supine-band-hip-flexion", "Supine Band Hip Flexion"],
      ["captains-chair-knee-raise-hold", "Captain's Chair Knee Raise Hold"],
      ["cable-hip-adduction", "Cable Hip Adduction"],
      ["single-leg-cable-hip-adduction", "Single-Leg Cable Hip Adduction"],
      ["machine-hip-adduction-exercise", "Machine Hip Adduction"],
      ["side-lying-hip-adduction", "Side-Lying Hip Adduction"],
      ["copenhagen-adduction-lift", "Copenhagen Adduction Lift"],
      ["cable-hip-abduction", "Cable Hip Abduction"],
      ["single-leg-cable-hip-abduction", "Single-Leg Cable Hip Abduction"],
      ["machine-hip-abduction-exercise", "Machine Hip Abduction"],
      ["side-lying-hip-abduction", "Side-Lying Hip Abduction"],
      ["mini-band-lateral-walk", "Mini-Band Lateral Walk"],
      ["mini-band-monster-walk", "Mini-Band Monster Walk"],
      ["standing-band-hip-abduction", "Standing Band Hip Abduction"],
      ["clamshell", "Clamshell"],
      ["banded-clamshell", "Banded Clamshell"],
    ],
  },
  {
    family: "olympic-power",
    cueKind: "power",
    movementPattern: "hip_hinge",
    classification: "power",
    resistanceType: "barbell",
    difficulty: "advanced",
    primary: "glutes",
    secondary: ["hamstrings", "quadriceps", "trapezius"],
    stabilizers: ["spinal_erectors"],
    equipment: ["barbell"],
    defaultBodyPosition: "standing",
    fatigueCost: 7,
    technicalComplexity: 8,
    stabilityDemand: 6,
    jointStressShoulder: 4,
    jointStressElbow: 3,
    jointStressWrist: 5,
    jointStressSpine: 5,
    jointStressHip: 5,
    jointStressKnee: 4,
    jointStressAnkle: 4,
    lengthenedBias: 5,
    shortenedBias: 6,
    stretchMediatedPotential: 2,
    variants: [
      ["hang-power-clean", "Hang Power Clean"],
      ["power-clean-from-blocks", "Power Clean from Blocks"],
      ["clean-pull", "Clean Pull"],
      ["hang-clean-pull", "Hang Clean Pull"],
      ["clean-high-pull", "Clean High Pull"],
      ["muscle-clean", "Muscle Clean"],
      ["tall-clean", "Tall Clean"],
      ["hang-power-snatch", "Hang Power Snatch"],
      ["power-snatch-from-blocks", "Power Snatch from Blocks"],
      ["snatch-pull", "Snatch Pull"],
      ["snatch-high-pull", "Snatch High Pull"],
      ["muscle-snatch", "Muscle Snatch"],
      ["tall-snatch", "Tall Snatch"],
      ["push-jerk", "Push Jerk"],
      ["split-jerk", "Split Jerk"],
      ["clean-grip-jump-shrug", "Clean-Grip Jump Shrug"],
    ],
  },
  {
    family: "carries",
    cueKind: "carry",
    movementPattern: "carry",
    classification: "compound",
    resistanceType: "dumbbell",
    primary: "forearms",
    secondary: ["trapezius", "transverse_abdominis", "obliques"],
    equipment: ["dumbbells"],
    defaultBodyPosition: "standing",
    isDistanceBased: true,
    fatigueCost: 4,
    technicalComplexity: 2,
    stabilityDemand: 5,
    jointStressShoulder: 3,
    jointStressElbow: 2,
    jointStressWrist: 4,
    jointStressSpine: 4,
    jointStressHip: 2,
    jointStressKnee: 2,
    jointStressAnkle: 2,
    lengthenedBias: 1,
    shortenedBias: 4,
    stretchMediatedPotential: 0,
    variants: [
      ["double-dumbbell-farmers-carry", "Double Dumbbell Farmer's Carry"],
      ["heavy-dumbbell-farmers-carry", "Heavy Dumbbell Farmer's Carry"],
      ["kettlebell-farmers-carry", "Kettlebell Farmer's Carry"],
      ["front-rack-kettlebell-carry", "Front-Rack Kettlebell Carry"],
      ["double-kettlebell-rack-carry", "Double Kettlebell Rack Carry"],
      ["cross-body-carry", "Cross-Body Carry"],
      ["bottoms-up-kettlebell-carry", "Bottoms-Up Kettlebell Carry"],
      ["overhead-dumbbell-carry", "Overhead Dumbbell Carry"],
      ["single-arm-overhead-kettlebell-carry", "Single-Arm Overhead Kettlebell Carry"],
      ["bear-hug-sandbag-carry", "Bear-Hug Sandbag Carry"],
      ["zercher-carry", "Zercher Carry"],
      ["plate-pinch-carry", "Plate Pinch Carry"],
      ["waiter-walk-dumbbell", "Dumbbell Waiter's Walk"],
      ["rack-and-suitcase-carry", "Rack-and-Suitcase Carry"],
    ],
  },
  {
    family: "mobility-warmup-rehab",
    cueKind: "mobility",
    movementPattern: "rotation",
    classification: "mobility",
    resistanceType: "bodyweight",
    primary: "spinal_erectors",
    secondary: ["obliques", "hip_flexors"],
    equipment: ["yoga-mat"],
    defaultBodyPosition: "quadruped",
    isMobility: true,
    fatigueCost: 1,
    technicalComplexity: 1,
    stabilityDemand: 2,
    jointStressShoulder: 1,
    jointStressWrist: 1,
    jointStressSpine: 1,
    jointStressHip: 2,
    jointStressKnee: 1,
    jointStressAnkle: 1,
    lengthenedBias: 0,
    shortenedBias: 0,
    stretchMediatedPotential: 0,
    variants: [
      ["worlds-greatest-stretch", "World's Greatest Stretch"],
      ["thread-the-needle", "Thread the Needle"],
      ["quadruped-thoracic-rotation", "Quadruped Thoracic Rotation"],
      ["thoracic-windmill", "Thoracic Windmill"],
      ["wall-ankle-mobilization", "Wall Ankle Mobilization"],
      ["half-kneeling-ankle-mobilization", "Half-Kneeling Ankle Mobilization"],
      ["couch-stretch", "Couch Stretch"],
      ["pigeon-stretch", "Pigeon Stretch"],
      ["90-90-hip-lift", "90/90 Hip Lift"],
      ["adductor-rock-back", "Adductor Rock Back"],
      ["frog-rock-back", "Frog Rock Back"],
      ["hamstring-floss", "Hamstring Floss"],
      ["banded-lat-stretch", "Banded Lat Stretch"],
      ["pec-doorway-stretch", "Pec Doorway Stretch"],
      ["band-dislocate", "Band Shoulder Dislocate"],
      ["wall-pec-minor-stretch", "Wall Pec Minor Stretch"],
      ["wrist-extension-rock", "Wrist Extension Rock"],
      ["wrist-flexion-rock", "Wrist Flexion Rock"],
      ["scapular-wall-slide-with-lift-off", "Scapular Wall Slide with Lift-Off"],
      ["serratus-wall-slide", "Serratus Wall Slide"],
      ["banded-ankle-distraction", "Banded Ankle Distraction"],
      ["glute-bridge-march-warmup", "Glute Bridge March Warmup"],
      ["mini-band-glute-bridge", "Mini-Band Glute Bridge"],
      ["bird-dog-row-reach", "Bird Dog Row Reach"],
    ],
  },
  {
    family: "cardio-conditioning",
    cueKind: "cardio",
    movementPattern: "gait",
    classification: "cardio",
    resistanceType: "machine",
    primary: "cardiovascular",
    secondary: ["quadriceps", "glutes", "calves"],
    equipment: ["treadmill"],
    defaultBodyPosition: "standing",
    isTimeBased: true,
    isDistanceBased: true,
    isCardio: true,
    fatigueCost: 4,
    technicalComplexity: 2,
    stabilityDemand: 2,
    jointStressHip: 3,
    jointStressKnee: 3,
    jointStressAnkle: 3,
    lengthenedBias: 0,
    shortenedBias: 0,
    stretchMediatedPotential: 0,
    variants: [
      ["treadmill-interval-run", "Treadmill Interval Run"],
      ["treadmill-recovery-walk", "Treadmill Recovery Walk"],
      ["treadmill-hill-walk", "Treadmill Hill Walk"],
      ["treadmill-tempo-run", "Treadmill Tempo Run"],
      ["stationary-bike-intervals", "Stationary Bike Intervals"],
      ["stationary-bike-recovery-ride", "Stationary Bike Recovery Ride"],
      ["recumbent-bike-recovery-ride", "Recumbent Bike Recovery Ride"],
      ["elliptical-steady-state", "Elliptical Steady State"],
      ["elliptical-intervals", "Elliptical Intervals"],
      ["rower-steady-state", "Rower Steady State"],
      ["rower-intervals", "Rower Intervals"],
      ["stair-climber-intervals", "Stair Climber Intervals"],
      ["stair-climber-steady-state", "Stair Climber Steady State"],
      ["assault-bike-intervals", "Assault Bike Intervals"],
      ["assault-bike-recovery-ride", "Assault Bike Recovery Ride"],
      ["ski-erg-intervals", "Ski Erg Intervals"],
      ["battle-rope-intervals", "Battle Rope Intervals"],
      ["jump-rope-basic-bounce", "Jump Rope Basic Bounce"],
      ["jump-rope-alternating-step", "Jump Rope Alternating Step"],
      ["sled-push-conditioning", "Sled Push Conditioning"],
    ],
  },
] as const;

export const EXERCISES = FAMILIES.flatMap((family) =>
  family.variants.map((variant) => exerciseFromFamily(family, variant)),
) satisfies readonly ReviewExercise[];

export const EXPANSION_FAMILY_COUNTS = Object.fromEntries(
  FAMILIES.map((family) => [family.family, family.variants.length]),
) as Record<string, number>;

export const MUSCLES: Array<[string, MuscleGroup, MuscleRole]> = EXERCISES.flatMap((exercise) => [
  [exercise.slug, exercise.primary, "primary"],
  ...(exercise.secondary ?? []).map((muscle) => [exercise.slug, muscle, "secondary"] as [string, MuscleGroup, MuscleRole]),
  ...(exercise.stabilizers ?? []).map((muscle) => [exercise.slug, muscle, "stabilizer"] as [string, MuscleGroup, MuscleRole]),
]);

export const EXERCISE_EQUIPMENT: Array<[string, string, EquipmentRequirement]> = EXERCISES.flatMap((exercise) =>
  (exercise.equipment ?? []).map((equipment) => [exercise.slug, equipment, "required"] as [string, string, EquipmentRequirement]),
);

const cueText = {
  press: {
    setup: "Set the body and implement so the wrists stack over the elbows and the shoulder blades stay controlled before the first rep.",
    execution: "Press smoothly through the full intended range, keeping the ribs down and finishing without shrugging or losing joint position.",
    common_error: "Letting the elbows flare or the torso shift turns a targeted press into compensation. Reduce load and keep the press path repeatable.",
    safety: "Use a pain-free shoulder range and choose a lower-stress substitute if the front of the shoulder pinches.",
  },
  pull: {
    setup: "Brace the trunk, set the shoulder blades, and start each rep from a controlled reach rather than a loose hang.",
    execution: "Pull by driving the elbows through the intended path, pause briefly in the contracted position, then return under control.",
    common_error: "Using torso momentum hides the target back stimulus. Keep the body angle stable and let the shoulder blades move deliberately.",
    safety: "Keep neck and shoulder tension low; reduce range or load if the shoulder rolls forward at the stretched end.",
  },
  hinge: {
    setup: "Start with feet planted, ribs stacked, and a soft knee bend before pushing the hips back.",
    execution: "Hinge from the hips until the target muscles are loaded, then drive the hips forward without rounding the low back.",
    common_error: "Squatting the hinge or chasing range with lumbar flexion changes the stimulus and raises back stress. Stop at owned range.",
    safety: "Keep load conservative until hamstring range and spinal position are consistent.",
  },
  squat: {
    setup: "Set stance and brace before descending, keeping pressure balanced through the whole foot.",
    execution: "Descend under control with knees tracking over the toes, then drive up without losing foot pressure or torso position.",
    common_error: "Knees collapsing inward or heels lifting shifts stress to the joints. Reduce load and use the range the athlete owns.",
    safety: "Select a lower-stress machine or unloaded variation when knee, hip, or spinal tolerance is limited.",
  },
  lunge: {
    setup: "Start in a stable split stance with the front foot planted and pelvis square.",
    execution: "Lower under control, keep the front knee tracking over the toes, and drive through the working leg to return.",
    common_error: "Pushing off the back leg or wobbling through the front foot hides the single-leg stimulus. Shorten range or load.",
    safety: "Use assistance or a machine substitute when balance limits safe knee tracking.",
  },
  curl: {
    setup: "Set the upper arms and wrists before curling so the target elbow-flexor muscles, not body swing, drive the rep.",
    execution: "Curl through a controlled arc, squeeze briefly, then lower slowly into the intended stretch.",
    common_error: "Swinging the torso or letting the elbows drift turns the set into momentum. Reduce load and keep the arm path strict.",
    safety: "Keep wrists neutral and avoid forcing painful elbow extension at the bottom.",
  },
  extension: {
    setup: "Set the upper arms and brace lightly so elbow extension is the only moving action.",
    execution: "Extend the elbows to full controlled lockout, pause briefly, then return through a smooth stretch.",
    common_error: "Moving the shoulders to chase reps removes triceps tension. Keep the upper arms quiet and lower the load.",
    safety: "Use a neutral grip or cable substitute if elbows or shoulders become irritated.",
  },
  raise: {
    setup: "Stand or sit tall with light bracing and start from a range that keeps the target joint quiet.",
    execution: "Raise under control, pause at the useful top position, then lower slowly without swinging.",
    common_error: "Using momentum or shrugging changes the target. Reduce load and keep the motion deliberate.",
    safety: "Stop short of pinching and use the lower-stress variation when joint position cannot be controlled.",
  },
  core: {
    setup: "Set the ribs down, pelvis neutral, and brace lightly before adding limb motion or load.",
    execution: "Maintain trunk position while breathing steadily, moving only as far as control allows.",
    common_error: "Arching the low back or rushing reps removes the intended trunk-control demand. Shorten the lever or range.",
    safety: "Regress immediately if the athlete cannot breathe or maintain spinal position.",
  },
  carry: {
    setup: "Pick up the load with a braced hinge and stand tall before beginning the carry.",
    execution: "Walk with quiet steps, level shoulders, and steady breathing while resisting leaning or twisting.",
    common_error: "Letting the load pull posture out of line turns the carry into compensation. Reduce distance or load.",
    safety: "Set the implement down before grip fails or posture breaks.",
  },
  mobility: {
    setup: "Start in a stable position that allows relaxed breathing and pain-free joint motion.",
    execution: "Move slowly through the intended range, pausing where control is available rather than forcing end range.",
    common_error: "Chasing range by compensating at another joint misses the mobility target. Slow down and reduce range.",
    safety: "Keep the drill gentle and symptom-free; mobility work should not create sharp pain or lingering irritation.",
  },
  cardio: {
    setup: "Set the machine or space to a conservative starting pace and confirm the athlete can maintain posture.",
    execution: "Work at the prescribed effort while keeping cadence, breathing, and mechanics consistent.",
    common_error: "Starting too hard turns steady conditioning into early fatigue. Adjust pace to match the intended energy-system target.",
    safety: "Stop for dizziness, chest pain, uncontrolled joint pain, or loss of machine control.",
  },
  power: {
    setup: "Start with the implement close, brace hard, and rehearse the receiving or finish position before adding speed.",
    execution: "Move explosively through the hips while keeping the bar path close and the catch or finish controlled.",
    common_error: "Muscling the lift with the arms instead of extending through the legs and hips reduces power and raises joint stress.",
    safety: "Use only with athletes who already own the prerequisite positions; stop when speed or technique degrades.",
  },
} satisfies Record<ReviewExercise["cueKind"], Record<ExerciseCueType & ("setup" | "execution" | "common_error" | "safety"), string>>;

export const CUES: Array<[string, ExerciseCueType, string, number]> = EXERCISES.flatMap((exercise) => {
  const cues = cueText[exercise.cueKind];
  return [
    [exercise.slug, "setup", `${exercise.name}: ${cues.setup}`, 1],
    [exercise.slug, "execution", `${exercise.name}: ${cues.execution}`, 2],
    [exercise.slug, "common_error", `${exercise.name}: ${cues.common_error}`, 3],
    [exercise.slug, "safety", `${exercise.name}: ${cues.safety}`, 4],
  ];
});

function relationPairsForFamily(family: FamilySeed): Array<[string, string, ExerciseRelationType, string]> {
  const slugs = family.variants.map(([slug]) => slug);
  const relations: Array<[string, string, ExerciseRelationType, string]> = [];
  for (let i = 0; i < slugs.length - 1; i += 1) {
    const current = slugs[i];
    const next = slugs[i + 1];
    relations.push([current, next, "progression", `${next} is a reviewed progression or adjacent pattern after ${current}.`]);
    relations.push([next, current, "regression", `${current} is the reviewed regression or simpler adjacent pattern for ${next}.`]);
  }
  if (slugs.length >= 3) {
    relations.push([slugs[0], slugs[2], "same_pattern", `${family.variants[0][1]} and ${family.variants[2][1]} share the same reviewed movement family.`]);
    relations.push([slugs[2], slugs[0], "same_pattern", `${family.variants[2][1]} and ${family.variants[0][1]} share the same reviewed movement family.`]);
  }
  return relations;
}

export const RELATIONS: Array<[string, string, ExerciseRelationType, string]> = FAMILIES.flatMap(relationPairsForFamily);
