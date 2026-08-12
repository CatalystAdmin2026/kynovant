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
    aliases: ["Bench Press", "BB Bench Press", "Flat Bench Press", "Flat Barbell Bench Press", "Barbell Chest Press"],
    reason: "In conventional coaching language, unqualified bench press refers to the flat barbell bench press.",
  },
  {
    slug: "incline-barbell-bench-press",
    aliases: ["Incline BB Bench Press", "Incline Barbell Press", "BB Incline Bench Press"],
    reason: "Barbell/BB incline bench wording clearly identifies the existing incline barbell bench press row.",
  },
  {
    slug: "decline-barbell-bench-press",
    aliases: ["Decline BB Bench Press", "Decline Barbell Press", "BB Decline Bench Press"],
    reason: "Barbell/BB decline bench wording clearly identifies the existing decline barbell bench press row.",
  },
  {
    slug: "dumbbell-bench-press",
    aliases: ["DB Bench Press", "DB Chest Press", "Flat DB Bench Press", "Flat Dumbbell Bench Press", "Dumbbell Chest Press"],
    reason: "DB shorthand and chest-press wording clearly identify the existing flat dumbbell bench press row.",
  },
  {
    slug: "incline-dumbbell-bench-press",
    aliases: ["Incline DB Bench Press", "Incline DB Press", "Incline Dumbbell Press", "DB Incline Bench Press"],
    reason: "DB incline press phrasing clearly identifies the existing incline dumbbell bench press row.",
  },
  {
    slug: "decline-dumbbell-bench-press",
    aliases: ["Decline DB Bench Press", "Decline DB Press", "Decline Dumbbell Press", "DB Decline Bench Press"],
    reason: "DB decline press phrasing clearly identifies the existing decline dumbbell bench press row.",
  },
  {
    slug: "neutral-grip-dumbbell-press",
    aliases: ["Neutral Grip DB Press", "Neutral Grip Dumbbell Bench Press", "Neutral-Grip DB Bench Press"],
    reason: "Neutral-grip dumbbell pressing variants name the grip and implement explicitly.",
  },
  {
    slug: "cable-chest-fly",
    aliases: ["Cable Fly", "Cable Flye", "Cable Chest Flye"],
    reason: "In gym programming, unqualified cable fly/flye is the chest fly pattern, distinct from reverse-fly rows.",
  },
  {
    slug: "pec-deck-fly",
    aliases: ["Pec Deck", "Pec Deck Flye", "Machine Chest Fly", "Machine Chest Flye"],
    reason: "Common machine and flye wording for the existing pec deck fly.",
  },
  {
    slug: "machine-chest-press",
    aliases: ["Chest Press Machine", "Machine Chest Presses"],
    reason: "Machine-name ordering and plural variants for the existing machine chest press.",
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
    aliases: ["Lat Pull-Down", "Lat Pull Down", "Lat Pulldowns", "Lat Pull Downs", "Cable Lat Pulldown"],
    reason: "Spacing/hyphenation variants and cable-equipment wording for the existing standard Lat Pulldown row.",
  },
  {
    slug: "bent-over-barbell-row",
    aliases: ["Barbell Row", "BB Row", "Bent Over Row", "Bent-Over BB Row"],
    reason: "Barbell/BB wording keeps this row distinct from dumbbell, cable, machine, and chest-supported rows.",
  },
  {
    slug: "single-arm-dumbbell-row",
    aliases: ["One-Arm Dumbbell Row", "One Arm Dumbbell Row", "One-Arm DB Row", "Single-Arm DB Row"],
    reason: "One-arm and DB shorthand identify the existing single-arm dumbbell row.",
  },
  {
    slug: "incline-dumbbell-row",
    aliases: ["Incline DB Row", "Chest-Supported DB Row", "Chest Supported Dumbbell Row"],
    reason: "The existing incline dumbbell row is the chest-supported dumbbell row pattern.",
  },
  {
    slug: "seated-cable-row",
    aliases: ["Seated Cable Rows", "Seated Cable Row Machine"],
    reason: "Seated/plural machine wording avoids the intentionally ambiguous generic cable row phrase.",
  },
  {
    slug: "t-bar-row",
    aliases: ["T Bar Row", "T-Bar Rows"],
    reason: "Spacing and plural variants for the existing T-bar row.",
  },
  {
    slug: "barbell-overhead-press",
    aliases: ["BB Overhead Press", "Barbell Shoulder Press", "BB Shoulder Press", "Standing Barbell Press"],
    reason: "Barbell/BB shoulder-press wording identifies the standing barbell overhead press.",
  },
  {
    slug: "dumbbell-overhead-press",
    aliases: ["DB Overhead Press", "Dumbbell Shoulder Press", "DB Shoulder Press", "Standing DB Shoulder Press"],
    reason: "DB shoulder-press wording identifies the standing dumbbell overhead press.",
  },
  {
    slug: "standing-dumbbell-lateral-raise",
    aliases: ["DB Lateral Raise", "Dumbbell Side Raise", "DB Side Raise", "Side Lateral Raise"],
    reason: "The implement is explicit or the conventional bodybuilding term identifies the dumbbell lateral raise row.",
  },
  {
    slug: "cable-lateral-raise",
    aliases: ["Cable Side Raise", "Cable Side Lateral Raise"],
    reason: "Cable-specific side raise wording avoids the generic lateral raise ambiguity.",
  },
  {
    slug: "machine-lateral-raise",
    aliases: ["Machine Side Raise", "Lateral Raise Machine"],
    reason: "Machine-specific side raise wording avoids the generic lateral raise ambiguity.",
  },
  {
    slug: "dumbbell-rear-delt-fly",
    aliases: ["DB Rear Delt Fly", "Dumbbell Rear Delt Flye", "DB Rear Delt Flye"],
    reason: "Dumbbell/DB rear-delt flye wording identifies the existing dumbbell rear delt fly row.",
  },
  {
    slug: "face-pull",
    aliases: ["Cable Face Pull", "Face Pulls", "Rope Face Pull"],
    reason: "The canonical Face Pull row is cable-station based; cable/rope wording removes ambiguity.",
  },
  {
    slug: "back-squat",
    aliases: ["Barbell Back Squat", "BB Back Squat", "High-Bar Back Squat"],
    reason: "Equipment-specific wording for the existing standard Back Squat row; low-bar remains a separate canonical row.",
  },
  {
    slug: "front-squat",
    aliases: ["Barbell Front Squat", "BB Front Squat"],
    reason: "Equipment-specific wording for the existing Front Squat row.",
  },
  {
    slug: "goblet-squat",
    aliases: ["Dumbbell Goblet Squat", "DB Goblet Squat"],
    reason: "The existing Goblet Squat row is the standard dumbbell-held goblet squat pattern.",
  },
  {
    slug: "bodyweight-squat",
    aliases: ["Air Squat", "Bodyweight Squats"],
    reason: "Common coaching vocabulary for the unloaded bodyweight squat.",
  },
  {
    slug: "leg-press",
    aliases: ["Machine Leg Press", "45-Degree Leg Press", "Forty-Five Degree Leg Press"],
    reason: "Equipment-specific wording for the existing Leg Press row.",
  },
  {
    slug: "hack-squat",
    aliases: ["Machine Hack Squat", "Hack Squat Machine"],
    reason: "Machine-specific wording identifies the existing hack squat row.",
  },
  {
    slug: "smith-machine-squat",
    aliases: ["Smith Squat", "Smith Machine Back Squat"],
    reason: "Smith-machine wording distinguishes this from free-bar squat rows.",
  },
  {
    slug: "leg-extension",
    aliases: ["Leg Extensions", "Machine Leg Extension", "Quad Extension", "Knee Extension Machine"],
    reason: "Common plural, machine, and muscle-name phrasing for the existing leg extension row.",
  },
  {
    slug: "barbell-romanian-deadlift",
    aliases: ["Barbell RDL", "BB RDL", "BB Romanian Deadlift"],
    reason: "RDL abbreviation is safe when the barbell implement is explicitly named.",
  },
  {
    slug: "dumbbell-romanian-deadlift",
    aliases: ["Dumbbell RDL", "DB RDL", "DB Romanian Deadlift"],
    reason: "RDL abbreviation is safe when the dumbbell implement is explicitly named.",
  },
  {
    slug: "seated-leg-curl",
    aliases: ["Seated Hamstring Curl", "Seated Leg Curls", "Machine Seated Leg Curl"],
    reason: "Common muscle-name phrasing for the existing seated leg curl.",
  },
  {
    slug: "lying-leg-curl",
    aliases: ["Lying Hamstring Curl", "Lying Leg Curls", "Prone Leg Curl", "Prone Hamstring Curl"],
    reason: "Common prone/hamstring-curl phrasing for the existing lying leg curl.",
  },
  {
    slug: "nordic-curl",
    aliases: ["Nordic Hamstring Curl", "Nordics"],
    reason: "Common short and muscle-specific phrasing for the existing Nordic curl.",
  },
  {
    slug: "barbell-hip-thrust",
    aliases: ["BB Hip Thrust", "Barbell Hip Thrusts"],
    reason: "BB abbreviation and plural wording for the existing barbell hip thrust.",
  },
  {
    slug: "glute-bridge",
    aliases: ["Floor Glute Bridge", "Bodyweight Glute Bridge"],
    reason: "Common unloaded bridge wording for the existing glute bridge.",
  },
  {
    slug: "cable-glute-kickback",
    aliases: ["Cable Kickback", "Cable Glute Kickbacks", "Cable Donkey Kickback"],
    reason: "Common cable kickback wording identifies the existing cable glute kickback.",
  },
  {
    slug: "standing-calf-raise-machine",
    aliases: ["Machine Standing Calf Raise"],
    reason: "Machine-specific wording preserves the intended ambiguity of unqualified standing calf raise.",
  },
  {
    slug: "seated-calf-raise",
    aliases: ["Seated Calf Raises", "Machine Seated Calf Raise"],
    reason: "Plural and machine wording for the existing seated calf raise.",
  },
  {
    slug: "barbell-curl",
    aliases: ["Barbell Bicep Curl", "Barbell Biceps Curl", "BB Curl", "BB Bicep Curl"],
    reason: "Conventional phrasing for the existing Barbell Curl row.",
  },
  {
    slug: "ez-bar-curl",
    aliases: ["EZ Curl", "EZ-Bar Bicep Curl", "EZ Bar Curl", "EZ Bar Biceps Curl"],
    reason: "EZ-bar spacing and biceps phrasing for the existing EZ-bar curl.",
  },
  {
    slug: "standing-dumbbell-curl",
    aliases: ["Dumbbell Bicep Curl", "Dumbbell Biceps Curl", "DB Curl", "DB Bicep Curl", "Standing DB Curl"],
    reason: "Generic dumbbell biceps curl conventionally points to the standing dumbbell curl when no seated/incline/preacher setup is named.",
  },
  {
    slug: "hammer-curl",
    aliases: ["DB Hammer Curl", "Dumbbell Hammer Curl", "Hammer Curls"],
    reason: "Dumbbell and plural wording for the existing hammer curl.",
  },
  {
    slug: "dumbbell-chest-fly",
    aliases: ["Dumbbell Fly", "Dumbbell Flye", "Dumbbell Flyes", "DB Fly", "DB Flye", "Flat Dumbbell Fly", "Flat DB Fly"],
    reason: "Generic dumbbell fly/flye wording conventionally points to the flat dumbbell chest fly when no incline/decline is named.",
  },
  {
    slug: "cable-curl-straight-bar",
    aliases: ["Cable Bicep Curl", "Cable Biceps Curl", "Straight-Bar Cable Curl", "Straight Bar Cable Curl", "Cable Bar Curl"],
    reason: "Generic cable biceps curl maps to the straight-bar cable curl; rope hammer and single-arm variants remain specifically named.",
  },
  {
    slug: "cable-triceps-pressdown",
    aliases: ["Cable Tricep Pressdown", "Cable Triceps Press Down", "Straight-Bar Cable Triceps Pressdown"],
    reason: "Pressdown spelling and straight-bar wording identify the existing cable triceps pressdown while pushdown remains intentionally ambiguous.",
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
    aliases: ["Exercise Bike", "Upright Bike", "Stationary Cycling", "Upright Stationary Bike"],
    reason: "Common cardio-machine vocabulary for the existing upright stationary bike row.",
  },
  {
    slug: "recumbent-bike",
    aliases: ["Recumbent Bike Ride", "Recumbent Cycling", "Recumbent Stationary Bike"],
    reason: "Recumbent-specific cycling phrases identify the existing recumbent bike row.",
  },
  {
    slug: "rowing-machine",
    aliases: ["Rower", "Row Erg", "Erg Row", "Rowing Ergometer", "Concept2 Row"],
    reason: "Common cardio-machine vocabulary for the existing rowing machine row.",
  },
  {
    slug: "elliptical",
    aliases: ["Elliptical Trainer", "Elliptical Machine", "Cross Trainer"],
    reason: "Common machine wording for the existing elliptical row.",
  },
  {
    slug: "stair-climber",
    aliases: ["Stair Machine", "StepMill", "StairMaster"],
    reason: "Common cardio-machine vocabulary for the existing stair climber row.",
  },
  {
    slug: "assault-bike-intervals",
    aliases: ["Air Bike Intervals", "Fan Bike Intervals"],
    reason: "Air/fan bike interval wording identifies the existing assault bike interval row.",
  },
  {
    slug: "ski-erg-intervals",
    aliases: ["SkiErg Intervals", "Ski Ergometer Intervals"],
    reason: "Spacing and machine-name variants for the existing Ski Erg intervals row.",
  },
  {
    slug: "jump-rope-basic-bounce",
    aliases: ["Jump Rope", "Skipping Rope", "Basic Jump Rope"],
    reason: "Basic unqualified jump-rope wording identifies the foundational jump rope row.",
  },
  {
    slug: "worlds-greatest-stretch",
    aliases: ["Worlds Greatest Stretch", "World's Greatest", "Greatest Stretch"],
    reason: "Apostrophe and shorthand variants for the existing World's Greatest Stretch.",
  },
  {
    slug: "thread-the-needle",
    aliases: ["Thread the Needle Stretch", "Thread-the-Needle Stretch"],
    reason: "Stretch wording and hyphenation for the existing thread-the-needle mobility row.",
  },
  {
    slug: "open-book-thoracic-rotation",
    aliases: ["Open Book Stretch", "Open-Book Rotation", "Open Book Rotation"],
    reason: "Common open-book mobility phrasing for the existing thoracic rotation row.",
  },
  {
    slug: "thoracic-extension-on-foam-roller",
    aliases: ["Foam Roller T-Spine Extension", "Foam Roller Thoracic Extension"],
    reason: "T-spine and foam roller ordering variants for the existing thoracic extension row.",
  },
  {
    slug: "half-kneeling-hip-flexor-mobilization",
    aliases: ["Half-Kneeling Hip Flexor Stretch", "Half Kneeling Hip Flexor Mobilization"],
    reason: "Stretch and spacing variants for the existing hip flexor mobilization.",
  },
  {
    slug: "ninety-ninety-hip-switch",
    aliases: ["90-90 Hip Switch", "90 90 Hip Switch", "90/90 Hip Switches"],
    reason: "Numeric formatting and plural variants for the existing 90/90 hip switch.",
  },
  {
    slug: "ankle-dorsiflexion-rock",
    aliases: ["Ankle Rock", "Knee-to-Wall Ankle Rock", "Ankle Dorsiflexion Mobilization"],
    reason: "Common ankle-mobility wording for the existing dorsiflexion rock.",
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
