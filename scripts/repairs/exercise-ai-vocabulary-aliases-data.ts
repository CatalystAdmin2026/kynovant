// ─────────────────────────────────────────────────────────────
// Kynovant — Exercise Library AI Vocabulary Alias Decisions
// ─────────────────────────────────────────────────────────────

export type AiVocabularyAliasRepair = {
  slug: string;
  aliases: readonly string[];
  reason: string;
};

export const AI_VOCABULARY_ALIAS_REPAIRS = [
  {
    slug: "barbell-bench-press",
    aliases: ["Bench Press", "Flat Barbell Bench Press", "Barbell Chest Press"],
    reason: "In conventional coaching language, unqualified bench press refers to the flat barbell bench press.",
  },
  {
    slug: "dumbbell-bench-press",
    aliases: ["DB Bench Press", "Flat Dumbbell Bench Press", "Dumbbell Chest Press"],
    reason: "DB shorthand and chest-press wording clearly identify the existing flat dumbbell bench press row.",
  },
  {
    slug: "push-up",
    aliases: ["Pushup", "Push Up", "Pushups", "Push Ups", "Press-Up", "Press Up"],
    reason: "Spelling and regional wording variants for the existing standard Push-Up row.",
  },
  {
    slug: "pull-up",
    aliases: ["Pullup", "Pull Up", "Pullups", "Pull Ups"],
    reason: "Spelling variants for the existing standard Pull-Up row.",
  },
  {
    slug: "chin-up",
    aliases: ["Chinup", "Chin Up", "Chinups", "Chin Ups"],
    reason: "Spelling variants for the existing standard Chin-Up row.",
  },
  {
    slug: "lat-pulldown",
    aliases: ["Lat Pull-Down", "Lat Pull Down", "Lat Pulldowns", "Cable Lat Pulldown"],
    reason: "Spacing/hyphenation variants and cable-equipment wording for the existing standard Lat Pulldown row.",
  },
  {
    slug: "back-squat",
    aliases: ["Barbell Back Squat", "High-Bar Back Squat"],
    reason: "Equipment-specific wording for the existing standard Back Squat row; low-bar remains a separate canonical row.",
  },
  {
    slug: "front-squat",
    aliases: ["Barbell Front Squat"],
    reason: "Equipment-specific wording for the existing Front Squat row.",
  },
  {
    slug: "goblet-squat",
    aliases: ["Dumbbell Goblet Squat"],
    reason: "The existing Goblet Squat row is the standard dumbbell-held goblet squat pattern.",
  },
  {
    slug: "bodyweight-squat",
    aliases: ["Air Squat", "Bodyweight Squats"],
    reason: "Common coaching vocabulary for the unloaded bodyweight squat.",
  },
  {
    slug: "leg-press",
    aliases: ["Machine Leg Press"],
    reason: "Equipment-specific wording for the existing Leg Press row.",
  },
  {
    slug: "barbell-romanian-deadlift",
    aliases: ["Barbell RDL"],
    reason: "RDL abbreviation is safe when the barbell implement is explicitly named.",
  },
  {
    slug: "dumbbell-romanian-deadlift",
    aliases: ["Dumbbell RDL", "DB RDL"],
    reason: "RDL abbreviation is safe when the dumbbell implement is explicitly named.",
  },
  {
    slug: "seated-leg-curl",
    aliases: ["Seated Hamstring Curl"],
    reason: "Common muscle-name phrasing for the existing seated leg curl.",
  },
  {
    slug: "lying-leg-curl",
    aliases: ["Lying Hamstring Curl", "Prone Leg Curl", "Prone Hamstring Curl"],
    reason: "Common prone/hamstring-curl phrasing for the existing lying leg curl.",
  },
  {
    slug: "barbell-curl",
    aliases: ["Barbell Bicep Curl", "Barbell Biceps Curl", "BB Curl"],
    reason: "Conventional phrasing for the existing Barbell Curl row.",
  },
  {
    slug: "standing-dumbbell-curl",
    aliases: ["Dumbbell Bicep Curl", "Dumbbell Biceps Curl", "DB Curl"],
    reason: "Generic dumbbell biceps curl conventionally points to the standing dumbbell curl when no seated/incline/preacher setup is named.",
  },
  {
    slug: "dumbbell-chest-fly",
    aliases: ["Dumbbell Fly", "Dumbbell Flye", "Dumbbell Flyes", "Flat Dumbbell Fly"],
    reason: "Generic dumbbell fly/flye wording conventionally points to the flat dumbbell chest fly when no incline/decline is named.",
  },
  {
    slug: "face-pull",
    aliases: ["Cable Face Pull"],
    reason: "The canonical Face Pull row is cable-station based; the equipment word removes ambiguity.",
  },
  {
    slug: "cable-curl-straight-bar",
    aliases: ["Cable Bicep Curl", "Cable Biceps Curl", "Straight-Bar Cable Curl"],
    reason: "Generic cable biceps curl maps to the straight-bar cable curl; rope hammer and single-arm variants remain specifically named.",
  },
  {
    slug: "treadmill-walk",
    aliases: ["Treadmill Walking", "Walk on Treadmill"],
    reason: "Clear walking-specific treadmill vocabulary for the existing treadmill walk row.",
  },
  {
    slug: "treadmill-run",
    aliases: ["Treadmill Running", "Run on Treadmill"],
    reason: "Clear running-specific treadmill vocabulary for the existing treadmill run row.",
  },
  {
    slug: "stationary-bike",
    aliases: ["Exercise Bike", "Upright Bike", "Stationary Cycling"],
    reason: "Common cardio-machine vocabulary for the existing upright stationary bike row.",
  },
  {
    slug: "rowing-machine",
    aliases: ["Rower", "Row Erg", "Erg Row"],
    reason: "Common cardio-machine vocabulary for the existing rowing machine row.",
  },
  {
    slug: "elliptical",
    aliases: ["Elliptical Trainer", "Elliptical Machine"],
    reason: "Common machine wording for the existing elliptical row.",
  },
  {
    slug: "stair-climber",
    aliases: ["Stair Climber", "Stair Machine", "StepMill"],
    reason: "Common cardio-machine vocabulary for the existing stair climber row.",
  },
] as const satisfies readonly AiVocabularyAliasRepair[];

export const INTENTIONALLY_AMBIGUOUS_AI_NAMES = [
  "Cable Tricep Pushdown",
  "Cable Triceps Pushdown",
  "Cable Seated Row",
  "Lateral Raise",
  "Single Leg Romanian Deadlift",
  "Single-Leg Romanian Deadlift",
  "Standing Calf Raise",
  "Dumbbell Tricep Extension",
  "Dumbbell Triceps Extension",
  "Dips",
  "Reverse Fly",
  "Front Raise",
  "Upright Row",
  "Leg Swings",
  "Shoulder Shrug",
  "Deadlift",
  "Romanian Deadlift",
  "RDL",
  "Row",
  "Cable Row",
  "Seated Row",
  "Squat",
  "Calf Raise",
  "Hamstring Curl",
] as const;

export const UNSUPPORTED_AI_NAMES = [
  {
    name: "Shoulder Shrug",
    reason: "The current movement_pattern enum has no scapular_elevation value; mapping shrugs to retraction, depression, or carry would be fabricated.",
  },
] as const;
