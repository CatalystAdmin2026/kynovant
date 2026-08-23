// ─────────────────────────────────────────────────────────────
// Kynovant — Dependency-Free Canonical Domain Enums
//
// PURE VALUES ONLY. Zero imports, always. This file exists specifically
// so pure logic modules (strategy.ts, and any future Programming
// Intelligence module with the same "no AI/DB/network" requirement)
// have exactly ONE place to get TemplateCategory/ExperienceLevel/
// program-length bounds from, instead of each hand-mirroring its own
// copy that could silently drift from the real database enum
// (lib/db/schema.ts's templateCategoryEnum/experienceLevelEnum) or the
// real brief schema (contracts.ts's ProgramGenerationBriefSchema).
//
// Review finding (independent review of Phase A, candidate 6df43c1):
// strategy.ts previously hand-mirrored these unions directly inside
// itself. That kept it import-free, but meant a change to the real DB
// enum wouldn't be caught anywhere. Fix: hoist the mirrored values into
// this one dedicated file, and prove — via
// lib/program-generator/__tests__/domain-enums.test.ts, which DOES
// import lib/db/schema.ts and contracts.ts for comparison, something
// this file itself must never do — that they stay byte-for-byte
// identical to the real source of truth. strategy.ts still doesn't
// import lib/db/schema.ts (directly or transitively) at all; this file
// is the one and only place the values are declared for pure-logic
// consumers, and the test is what catches drift immediately if the
// real DB enum ever changes without this file being updated to match.
//
// Deliberately NOT importing lib/db/schema.ts here even though that
// would remove the "two copies" concern in one sense — doing so would
// pull Drizzle table/enum construction (and everything schema.ts
// transitively references) into every consumer of this file, exactly
// the "runtime baggage" a dependency-free domain module exists to
// avoid. A cross-checking test is the correct fix for drift risk in a
// pure module, not an import.
// ─────────────────────────────────────────────────────────────

// Mirrors lib/db/schema.ts's templateCategoryEnum.enumValues exactly —
// verified, not assumed, by domain-enums.test.ts.
export const TEMPLATE_CATEGORY_VALUES = [
  "fat_loss",
  "muscle_growth",
  "body_recomposition",
  "athletic_performance",
  "lifestyle",
  "competition_prep",
  "executive_performance",
] as const;
export type TemplateCategory = (typeof TEMPLATE_CATEGORY_VALUES)[number];

// Mirrors lib/db/schema.ts's experienceLevelEnum.enumValues exactly —
// verified, not assumed, by domain-enums.test.ts.
export const EXPERIENCE_LEVEL_VALUES = ["beginner", "intermediate", "advanced", "competitive", "mixed"] as const;
export type ExperienceLevel = (typeof EXPERIENCE_LEVEL_VALUES)[number];

// Mirrors contracts.ts's ProgramGenerationBriefSchema `weeks: z.number()
// .int().min(1).max(16)` bound exactly — verified, not assumed, by
// domain-enums.test.ts. Any pure function accepting a whole-program
// week count (derivePhaseSequence) validates against these, so the
// number 16 exists in exactly one place a pure module can reach.
export const MIN_PROGRAM_WEEKS = 1;
export const MAX_PROGRAM_WEEKS = 16;
