// ─────────────────────────────────────────────────────────────
// Catalyst OS — Canonical Seeded Exercise Slugs
//
// The reviewed, canonical set of exercise slugs the bulk Exercise
// Library seed pipeline (scripts/seed-exercises.ts and
// scripts/seeds/001-upper-push.ts through 010-ai-vocabulary-coverage.ts)
// inserts as shared library content — never a coach's private data.
//
// This is the second half of orphaned-system-exercises.ts's safety
// predicate: scope='coach' AND created_by IS NULL alone can't
// distinguish "this seed pipeline's known defect" from "a real coach's
// exercise, orphaned by some future account-deletion feature" — slug
// membership in this set can, since only the seed pipeline could ever
// have produced a row with one of these exact slugs AND no owner.
//
// Slugs are read directly from each seed file's own reviewed source
// text — never hand-copied into a second, driftable list — using the
// same slug-extraction approach already established in this codebase
// by lib/db/__tests__/exercise-library-p0-remediation.test.ts's
// exerciseSlugsFromSource(). Three files (008, 009, 010) already have a
// pure, side-effect-free "-data.ts" companion built for exactly this
// kind of reuse (see that same test file for precedent) — those are
// imported directly. The remaining eight files define their EXERCISES
// array inline, alongside a live-database-connecting seed runner (they
// import scripts/seeds/_shared.ts, which opens a real
// DATABASE_URL_DIRECT connection as a side effect of module
// evaluation) — this repair reads their source text instead of
// importing them as modules, so it never needs a database connection
// just to learn exercise names, and never risks the process exiting if
// DATABASE_URL_DIRECT happens not to be set.
//
// Assumes the process runs from the repository root — the same
// assumption every script in this repo already documents
// (`npx tsx scripts/...`) and how vitest itself runs.
// ─────────────────────────────────────────────────────────────

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { EXERCISES as KNEE_FLEXION_EXERCISES } from "../seeds/008-knee-flexion-data";
import { EXERCISES as LAUNCH_CRITICAL_EXERCISES } from "../seeds/009-launch-critical-families-data";
import { EXERCISES as AI_VOCAB_EXERCISES } from "../seeds/010-ai-vocabulary-coverage-data";

// Files whose EXERCISES array is defined inline (no pure data-only
// companion) — read as plain source text, never imported as a module.
const TEXT_SOURCED_SEED_FILES = [
  "scripts/seed-exercises.ts",
  "scripts/seeds/001-upper-push.ts",
  "scripts/seeds/002-upper-pull.ts",
  "scripts/seeds/003-lower-quad.ts",
  "scripts/seeds/004-hip-hinge.ts",
  "scripts/seeds/005-core-carries.ts",
  "scripts/seeds/006-arms.ts",
  "scripts/seeds/007-shoulders.ts",
];

// Several of these files ALSO define a local EQUIPMENT array with its
// own `slug: "..."` fields (equipment catalog entries, not exercises) —
// a plain whole-file regex would wrongly pick those up too. This walks
// bracket depth (respecting quoted strings, so a note field containing
// a literal "[" or "]" can't desync it) to extract exactly the
// top-level `const EXERCISES = [ ... ]` array's own source text before
// any slug extraction happens.
function extractTopLevelArraySource(source: string, constName: string): string {
  const declPattern = new RegExp(`(?:export\\s+)?const\\s+${constName}\\s*(?::[^=]+)?=\\s*\\[`);
  const match = declPattern.exec(source);
  if (!match) {
    throw new Error(`Could not find "const ${constName} = [" in seed source.`);
  }
  const openBracketIndex = match.index + match[0].length - 1;

  let depth = 0;
  let inString: '"' | "'" | "`" | null = null;
  for (let i = openBracketIndex; i < source.length; i++) {
    const ch = source[i];
    if (inString) {
      if (ch === inString && source[i - 1] !== "\\") inString = null;
      continue;
    }
    if (ch === '"' || ch === "'" || ch === "`") {
      inString = ch;
      continue;
    }
    if (ch === "[") depth++;
    else if (ch === "]") {
      depth--;
      if (depth === 0) return source.slice(openBracketIndex, i + 1);
    }
  }
  throw new Error(`Unterminated array literal for "${constName}" in seed source.`);
}

function exerciseSlugsFromSeedFile(repoRelativePath: string): string[] {
  const absolutePath = join(process.cwd(), repoRelativePath);
  const source = readFileSync(absolutePath, "utf8");
  const exercisesBlock = extractTopLevelArraySource(source, "EXERCISES");
  return Array.from(exercisesBlock.matchAll(/slug:\s*"([^"]+)"/g), (m) => m[1]);
}

let cached: Set<string> | null = null;

// Lazily computed and cached — the eight text-sourced files are only
// read from disk once per process, regardless of how many times the
// repair (or its tests) call this.
export function getCanonicalSeedExerciseSlugs(): Set<string> {
  if (cached) return cached;

  const fromDataModules = [
    ...KNEE_FLEXION_EXERCISES,
    ...LAUNCH_CRITICAL_EXERCISES,
    ...AI_VOCAB_EXERCISES,
  ].map((e) => e.slug);

  const fromTextSourcedFiles = TEXT_SOURCED_SEED_FILES.flatMap(exerciseSlugsFromSeedFile);

  cached = new Set([...fromDataModules, ...fromTextSourcedFiles]);
  return cached;
}
