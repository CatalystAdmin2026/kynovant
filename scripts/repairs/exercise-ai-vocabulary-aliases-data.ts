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
    slug: "barbell-curl",
    aliases: ["Barbell Bicep Curl", "Barbell Biceps Curl"],
    reason: "Conventional phrasing for the existing Barbell Curl row.",
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
] as const;

export const UNSUPPORTED_AI_NAMES = [
  {
    name: "Shoulder Shrug",
    reason: "The current movement_pattern enum has no scapular_elevation value; mapping shrugs to retraction, depression, or carry would be fabricated.",
  },
] as const;
