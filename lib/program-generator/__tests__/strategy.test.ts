// ─────────────────────────────────────────────────────────────
// Programming Intelligence — Phase A deterministic strategy layer.
// Pure unit suite, no DB, no provider, no fixtures beyond plain
// function calls — this whole module is required to be pure, and
// these tests are the proof.
// ─────────────────────────────────────────────────────────────

import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  PHASE_TYPES,
  EXERCISE_ROLES,
  PROGRESSION_STRATEGIES,
  ROTATION_POLICIES,
  EFFORT_BANDS,
  isPhaseBlockSupportedGoal,
  derivePhaseSequence,
  deriveBlockLength,
  selectProgressionStrategy,
  minimumRetentionBlocks,
  rotationPolicyFor,
  defaultPhaseDisplayName,
  effortBandFor,
  type TemplateCategory,
  type ExperienceLevel,
  type PhaseType,
  type RotationPolicy,
} from "../strategy";
import { MIN_PROGRAM_WEEKS, MAX_PROGRAM_WEEKS } from "../domain-enums";

const ALL_GOALS: TemplateCategory[] = [
  "fat_loss",
  "muscle_growth",
  "body_recomposition",
  "athletic_performance",
  "lifestyle",
  "competition_prep",
  "executive_performance",
];
const SUPPORTED_GOALS: TemplateCategory[] = ALL_GOALS.filter((g) => g !== "athletic_performance");
const ALL_EXPERIENCE: ExperienceLevel[] = ["beginner", "intermediate", "advanced", "competitive", "mixed"];
const PROGRAM_LENGTHS = [4, 6, 8, 12, 16];

// ─────────────────────────────────────────────────────────────
// Section 12 — architectural boundary. Read this module's own source
// and prove it imports nothing from the AI/DB surface. A static text
// check, not a runtime mock — same "real repo-wide grep, not just
// asserting the known-good shape" discipline as program-generation-
// quota.test.ts's "full model-invocation coverage" test.
// ─────────────────────────────────────────────────────────────
describe("architectural boundary — pure logic only", () => {
  const source = readFileSync(resolve(process.cwd(), "lib/program-generator/strategy.ts"), "utf8");

  it("imports nothing from lib/db, provider.ts, the AI SDK, or any network/fs module", () => {
    const forbidden = [
      "@/lib/db",
      "from \"./provider\"",
      "from \"ai\"",
      "@ai-sdk",
      "postgres",
      "drizzle",
      "server-only",
      "node:fs",
      "node:http",
      "node:net",
      "fetch(",
    ];
    for (const pattern of forbidden) {
      expect(source, `strategy.ts must not reference "${pattern}"`).not.toContain(pattern);
    }
  });

  it("imports exactly one thing — domain-enums.ts — and nothing else", () => {
    // Review finding on Phase A candidate 6df43c1 (canonical-enum drift):
    // strategy.ts used to hand-mirror TemplateCategory/ExperienceLevel and
    // have zero imports at all. It now imports the canonical values from
    // ./domain-enums, which is itself dependency-free (see that file's own
    // header and domain-enums.test.ts) — so this file is still fully
    // isolated from the AI/DB/network surface, just no longer duplicating
    // values that could drift. Assert there is exactly this one import line,
    // and that it points at domain-enums specifically, so a future edit
    // can't quietly reintroduce a real dependency alongside it.
    const importLines = source.split("\n").filter((l) => /^\s*import\s/.test(l));
    expect(importLines).toEqual([importLines[0]]);
    expect(importLines).toHaveLength(1);
    expect(importLines[0]).toMatch(/from\s+["']\.\/domain-enums["']/);
  });
});

// ─────────────────────────────────────────────────────────────
// derivePhaseSequence
// ─────────────────────────────────────────────────────────────
describe("derivePhaseSequence", () => {
  it("[I] athletic_performance never silently enters this architecture, for any experience/length", () => {
    for (const experienceLevel of ALL_EXPERIENCE) {
      for (const weeks of PROGRAM_LENGTHS) {
        const result = derivePhaseSequence("athletic_performance", experienceLevel, weeks);
        expect(result.ok).toBe(false);
        if (result.ok) continue;
        expect(result.error).toMatch(/athletic_performance/);
        expect(result.error).toMatch(/not supported/i);
      }
    }
  });

  it("isPhaseBlockSupportedGoal agrees with derivePhaseSequence's own gate", () => {
    for (const goal of ALL_GOALS) {
      const supported = isPhaseBlockSupportedGoal(goal);
      const result = derivePhaseSequence(goal, "intermediate", 8);
      expect(supported).toBe(result.ok);
    }
  });

  it("[A] beginner muscle_growth, 8 weeks -> foundation then accumulation", () => {
    const result = derivePhaseSequence("muscle_growth", "beginner", 8);
    expect(result).toEqual({ ok: true, phases: ["foundation", "accumulation"] });
  });

  it("[B] intermediate muscle_growth, 8 weeks -> accumulation then intensification, no foundation", () => {
    const result = derivePhaseSequence("muscle_growth", "intermediate", 8);
    expect(result).toEqual({ ok: true, phases: ["accumulation", "intensification"] });
  });

  it("[C] advanced muscle_growth, 12 weeks -> three phases, realization included", () => {
    const result = derivePhaseSequence("muscle_growth", "advanced", 12);
    expect(result).toEqual({ ok: true, phases: ["accumulation", "intensification", "realization"] });
  });

  it("[D] intermediate body_recomposition, 6 weeks -> same shape as muscle_growth at that length", () => {
    const recomp = derivePhaseSequence("body_recomposition", "intermediate", 6);
    const growth = derivePhaseSequence("muscle_growth", "intermediate", 6);
    expect(recomp).toEqual(growth);
  });

  it("[E] advanced fat_loss, 8 weeks -> flat, single accumulation phase (goal-flattened, not experience-driven)", () => {
    const result = derivePhaseSequence("fat_loss", "advanced", 8);
    expect(result).toEqual({ ok: true, phases: ["accumulation"] });
  });

  it("[F] lifestyle, 16 weeks, non-beginner -> still just one phase (flat regardless of length)", () => {
    const result = derivePhaseSequence("lifestyle", "intermediate", 16);
    expect(result).toEqual({ ok: true, phases: ["accumulation"] });
  });

  it("[G] executive_performance never exceeds two phases, short or long", () => {
    for (const weeks of PROGRAM_LENGTHS) {
      for (const experienceLevel of ALL_EXPERIENCE) {
        const result = derivePhaseSequence("executive_performance", experienceLevel, weeks);
        expect(result.ok).toBe(true);
        if (!result.ok) continue;
        expect(result.phases.length).toBeLessThanOrEqual(2);
      }
    }
  });

  it("[H] competitive competition_prep, 10-12 weeks -> ends in taper, includes intensification", () => {
    const result = derivePhaseSequence("competition_prep", "competitive", 11);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.phases[result.phases.length - 1]).toBe("taper");
    expect(result.phases).toContain("intensification");
  });

  it("physique competition_prep ALWAYS ends in taper, even for a pathologically short program (the goal's defining feature, never collapsed away)", () => {
    // Range extended down to 1 through the full supported domain per the
    // Phase A remediation's pathological-length coverage requirement — the
    // existing weeks<=8 branch already returns ["accumulation","taper"] all
    // the way down to 1 week, so this proves that rather than just assuming
    // it from the 4-8 range that was previously tested.
    for (const weeks of [1, 2, 3, 4, 5, 6, 7, 8]) {
      for (const experienceLevel of ALL_EXPERIENCE) {
        const result = derivePhaseSequence("competition_prep", experienceLevel, weeks);
        expect(result.ok).toBe(true);
        if (!result.ok) continue;
        expect(result.phases[result.phases.length - 1]).toBe("taper");
        expect(result.phases.length).toBeGreaterThanOrEqual(2);
      }
    }
  });

  it("[P] short programs collapse — a 4-week muscle_growth program never fragments into multiple phases", () => {
    const beginner = derivePhaseSequence("muscle_growth", "beginner", 4);
    const advanced = derivePhaseSequence("muscle_growth", "advanced", 4);
    expect(beginner).toEqual({ ok: true, phases: ["foundation"] });
    expect(advanced).toEqual({ ok: true, phases: ["accumulation"] });
  });

  it("is deterministic — identical inputs always produce identical output", () => {
    for (const goal of SUPPORTED_GOALS) {
      for (const experienceLevel of ALL_EXPERIENCE) {
        for (const weeks of PROGRAM_LENGTHS) {
          const first = derivePhaseSequence(goal, experienceLevel, weeks);
          const second = derivePhaseSequence(goal, experienceLevel, weeks);
          expect(second).toEqual(first);
        }
      }
    }
  });

  it("every supported goal x experience x length combination succeeds with a non-empty phase list", () => {
    for (const goal of SUPPORTED_GOALS) {
      for (const experienceLevel of ALL_EXPERIENCE) {
        for (const weeks of PROGRAM_LENGTHS) {
          const result = derivePhaseSequence(goal, experienceLevel, weeks);
          expect(result.ok).toBe(true);
          if (!result.ok) continue;
          expect(result.phases.length).toBeGreaterThan(0);
          for (const phase of result.phases) {
            expect(PHASE_TYPES).toContain(phase);
          }
        }
      }
    }
  });
});

// ─────────────────────────────────────────────────────────────
// Pathological program lengths — Phase A remediation, Sections 4 & 5.
// derivePhaseSequence's weeks parameter must fail closed outside the
// real generator's own supported domain (ProgramGenerationBriefSchema:
// integer, 1-16 — see domain-enums.ts) rather than silently guessing
// what an out-of-domain program length should look like, and every
// IN-domain pathological length (very short, or the max) must still
// produce a sensible, deterministic, non-fragmented sequence.
// ─────────────────────────────────────────────────────────────
describe("derivePhaseSequence — pathological lengths", () => {
  const IN_DOMAIN_PATHOLOGICAL = [1, 2, 3, 5, 7, 10, 16];
  const OUT_OF_DOMAIN = [0, -1, 17, 20, 52];

  it(`out-of-domain weeks values (${OUT_OF_DOMAIN.join(", ")}) fail explicitly, for every goal and experience level`, () => {
    for (const goal of ALL_GOALS) {
      for (const experienceLevel of ALL_EXPERIENCE) {
        for (const weeks of OUT_OF_DOMAIN) {
          const result = derivePhaseSequence(goal, experienceLevel, weeks);
          expect(result.ok, `expected weeks=${weeks} (${goal}/${experienceLevel}) to fail closed`).toBe(false);
          if (result.ok) continue;
          expect(result.error).toMatch(/weeks/i);
          expect(result.error).toContain(String(MIN_PROGRAM_WEEKS));
          expect(result.error).toContain(String(MAX_PROGRAM_WEEKS));
        }
      }
    }
  });

  it("a non-integer weeks value also fails closed, not just out-of-range integers", () => {
    const result = derivePhaseSequence("muscle_growth", "intermediate", 8.5);
    expect(result.ok).toBe(false);
  });

  it(`every in-domain pathological length (${IN_DOMAIN_PATHOLOGICAL.join(", ")}) succeeds, deterministically, for every supported goal`, () => {
    for (const goal of SUPPORTED_GOALS) {
      for (const experienceLevel of ALL_EXPERIENCE) {
        for (const weeks of IN_DOMAIN_PATHOLOGICAL) {
          const first = derivePhaseSequence(goal, experienceLevel, weeks);
          const second = derivePhaseSequence(goal, experienceLevel, weeks);
          expect(first.ok, `expected weeks=${weeks} (${goal}/${experienceLevel}) to succeed`).toBe(true);
          expect(second).toEqual(first);
          if (!first.ok) continue;
          expect(first.phases.length).toBeGreaterThan(0);
        }
      }
    }
  });

  it("very short in-domain programs (1-3 weeks) collapse to a single phase for every supported goal", () => {
    for (const goal of SUPPORTED_GOALS) {
      for (const experienceLevel of ALL_EXPERIENCE) {
        for (const weeks of [1, 2, 3]) {
          const result = derivePhaseSequence(goal, experienceLevel, weeks);
          expect(result.ok).toBe(true);
          if (!result.ok) continue;
          // competition_prep is the sole goal that structurally needs 2
          // phases even at minimum length, to preserve its defining taper —
          // see the dedicated "physique competition_prep ALWAYS ends in
          // taper" test above. Every other supported goal collapses to one.
          const expectedMax = goal === "competition_prep" ? 2 : 1;
          expect(result.phases.length).toBeLessThanOrEqual(expectedMax);
        }
      }
    }
  });

  it("no non-competition_prep goal accidentally gains a taper phase at any in-domain length", () => {
    for (const goal of SUPPORTED_GOALS.filter((g) => g !== "competition_prep")) {
      for (const experienceLevel of ALL_EXPERIENCE) {
        for (const weeks of [...IN_DOMAIN_PATHOLOGICAL, ...PROGRAM_LENGTHS]) {
          const result = derivePhaseSequence(goal, experienceLevel, weeks);
          expect(result.ok).toBe(true);
          if (!result.ok) continue;
          expect(result.phases).not.toContain("taper");
        }
      }
    }
  });

  it("the maximum in-domain length (16 weeks) still succeeds for every supported goal, and 17 does not", () => {
    for (const goal of SUPPORTED_GOALS) {
      for (const experienceLevel of ALL_EXPERIENCE) {
        expect(derivePhaseSequence(goal, experienceLevel, MAX_PROGRAM_WEEKS).ok).toBe(true);
        expect(derivePhaseSequence(goal, experienceLevel, MAX_PROGRAM_WEEKS + 1).ok).toBe(false);
      }
    }
  });
});

// ─────────────────────────────────────────────────────────────
// deriveBlockLength
// ─────────────────────────────────────────────────────────────
describe("deriveBlockLength", () => {
  it("[K] advanced does NOT automatically imply a shorter block than intermediate, for the same phase", () => {
    for (const phaseType of PHASE_TYPES) {
      const intermediateLen = deriveBlockLength(phaseType, "intermediate", 10);
      const advancedLen = deriveBlockLength(phaseType, "advanced", 10);
      expect(advancedLen).toBeGreaterThanOrEqual(intermediateLen);
    }
  });

  it("[L] fat_loss does not imply shorter strength-training blocks — deriveBlockLength has no goal parameter, so an accumulation block is IDENTICAL length regardless of which goal produced it", () => {
    const fatLossPhases = derivePhaseSequence("fat_loss", "intermediate", 12);
    const growthPhases = derivePhaseSequence("muscle_growth", "intermediate", 12);
    expect(fatLossPhases.ok && growthPhases.ok).toBe(true);
    if (!fatLossPhases.ok || !growthPhases.ok) return;
    // Both include an "accumulation" phase at intermediate — block
    // length for that phase type must be identical no matter which
    // goal's phase sequence it came from.
    const lenForFatLoss = deriveBlockLength("accumulation", "intermediate", 10);
    const lenForGrowth = deriveBlockLength("accumulation", "intermediate", 10);
    expect(lenForFatLoss).toBe(lenForGrowth);
  });

  it("[J] never produces a 1-week orphan for phases whose bounds require at least 2 weeks, even at pathological total lengths (up to 52)", () => {
    const phasesRequiringAtLeast2: PhaseType[] = ["foundation", "accumulation", "intensification", "realization", "resensitization"];
    for (const phaseType of phasesRequiringAtLeast2) {
      for (const experienceLevel of ALL_EXPERIENCE) {
        for (let totalWeeks = 2; totalWeeks <= 52; totalWeeks++) {
          // Simulate carving the whole phase into blocks, exactly how a
          // future caller would.
          let remaining = totalWeeks;
          const blocks: number[] = [];
          let guard = 0;
          while (remaining > 0 && guard++ < 50) {
            const len = deriveBlockLength(phaseType, experienceLevel, remaining);
            expect(len).toBeGreaterThan(0);
            blocks.push(len);
            remaining -= len;
          }
          expect(remaining).toBe(0);
          for (const block of blocks) {
            expect(block).toBeGreaterThanOrEqual(2);
          }
        }
      }
    }
  });

  it("deload is always exactly 1 week, taper never exceeds 2", () => {
    for (const experienceLevel of ALL_EXPERIENCE) {
      expect(deriveBlockLength("deload", experienceLevel, 10)).toBe(1);
      expect(deriveBlockLength("taper", experienceLevel, 10)).toBeLessThanOrEqual(2);
      expect(deriveBlockLength("taper", experienceLevel, 10)).toBeGreaterThanOrEqual(1);
    }
  });

  it("returns 0 (not a fabricated positive length) when nothing remains in the phase", () => {
    expect(deriveBlockLength("accumulation", "intermediate", 0)).toBe(0);
    expect(deriveBlockLength("accumulation", "intermediate", -1)).toBe(0);
  });

  it("[invariant] never exceeds weeksRemainingInPhase", () => {
    for (const phaseType of PHASE_TYPES) {
      for (const experienceLevel of ALL_EXPERIENCE) {
        for (let remaining = 1; remaining <= 12; remaining++) {
          expect(deriveBlockLength(phaseType, experienceLevel, remaining)).toBeLessThanOrEqual(remaining);
        }
      }
    }
  });

  it("[invariant] is deterministic", () => {
    for (const phaseType of PHASE_TYPES) {
      for (const experienceLevel of ALL_EXPERIENCE) {
        expect(deriveBlockLength(phaseType, experienceLevel, 8)).toBe(deriveBlockLength(phaseType, experienceLevel, 8));
      }
    }
  });

  it("foundation is generally longer than intensification, for the same experience", () => {
    for (const experienceLevel of ALL_EXPERIENCE) {
      expect(deriveBlockLength("foundation", experienceLevel, 20)).toBeGreaterThan(
        deriveBlockLength("intensification", experienceLevel, 20),
      );
    }
  });
});

// ─────────────────────────────────────────────────────────────
// selectProgressionStrategy
// ─────────────────────────────────────────────────────────────
describe("selectProgressionStrategy", () => {
  it("beginner -> rep, intermediate/mixed -> double, advanced/competitive -> rir, in an ordinary accumulation phase", () => {
    expect(selectProgressionStrategy("muscle_growth", "beginner", "accumulation")).toBe("rep");
    expect(selectProgressionStrategy("muscle_growth", "intermediate", "intensification")).toBe("double");
    expect(selectProgressionStrategy("muscle_growth", "mixed", "intensification")).toBe("double");
    expect(selectProgressionStrategy("muscle_growth", "advanced", "intensification")).toBe("rir");
    expect(selectProgressionStrategy("muscle_growth", "competitive", "intensification")).toBe("rir");
  });

  it("[O] taper phase always selects the taper strategy, regardless of goal or experience", () => {
    for (const goal of SUPPORTED_GOALS) {
      for (const experienceLevel of ALL_EXPERIENCE) {
        expect(selectProgressionStrategy(goal, experienceLevel, "taper")).toBe("taper");
      }
    }
  });

  it("deload phase always selects volume_density, regardless of goal or experience", () => {
    for (const goal of SUPPORTED_GOALS) {
      for (const experienceLevel of ALL_EXPERIENCE) {
        expect(selectProgressionStrategy(goal, experienceLevel, "deload")).toBe("volume_density");
      }
    }
  });

  it("fat_loss selects volume_density specifically in accumulation, but reverts to the experience-driven default in every other phase", () => {
    // Review finding on Phase A candidate 6df43c1: fat_loss previously
    // mapped EVERY non-taper/deload phase to volume_density unconditionally,
    // flattening phase objective into a single strategy for this goal's
    // entire program. That's fixed now — fat_loss gets the SAME
    // accumulation-only density override as body_recomposition/
    // executive_performance, and nothing else.
    for (const experienceLevel of ALL_EXPERIENCE) {
      expect(selectProgressionStrategy("fat_loss", experienceLevel, "accumulation")).toBe("volume_density");
    }
    expect(selectProgressionStrategy("fat_loss", "beginner", "foundation")).toBe("rep");
    expect(selectProgressionStrategy("fat_loss", "intermediate", "intensification")).toBe("double");
    expect(selectProgressionStrategy("fat_loss", "mixed", "intensification")).toBe("double");
    expect(selectProgressionStrategy("fat_loss", "advanced", "intensification")).toBe("rir");
    expect(selectProgressionStrategy("fat_loss", "competitive", "realization")).toBe("rir");
  });

  it("[fat_loss does not flatten all phases] fat_loss produces more than one distinct progression strategy across its own phase graph", () => {
    // Explicit proof, not just an absence of the old assertion: a real
    // fat_loss program (advanced, enough weeks to reach intensification)
    // must NOT collapse to a single repeated strategy across its phases —
    // phase objective remains a meaningful, distinguishing concept for this
    // goal, exactly as it is for every other goal. accumulation legitimately
    // gets the density override; foundation/intensification/realization do
    // NOT, and must all revert to the experience-driven default (rir, for
    // "advanced") instead of also being volume_density.
    const byPhase = Object.fromEntries(
      (["foundation", "accumulation", "intensification", "realization"] as const).map((phaseType) => [
        phaseType,
        selectProgressionStrategy("fat_loss", "advanced", phaseType),
      ]),
    );
    const strategies = new Set(Object.values(byPhase));
    expect(strategies.size).toBeGreaterThan(1);
    expect(byPhase.accumulation).toBe("volume_density");
    expect(byPhase.foundation).toBe("rir");
    expect(byPhase.intensification).toBe("rir");
    expect(byPhase.realization).toBe("rir");
  });

  it("body_recomposition/executive_performance select volume_density specifically in accumulation, but revert to the experience-driven default in intensification", () => {
    expect(selectProgressionStrategy("body_recomposition", "advanced", "accumulation")).toBe("volume_density");
    expect(selectProgressionStrategy("body_recomposition", "advanced", "intensification")).toBe("rir");
    expect(selectProgressionStrategy("executive_performance", "beginner", "accumulation")).toBe("volume_density");
    expect(selectProgressionStrategy("executive_performance", "beginner", "intensification")).toBe("rep");
  });

  it("[invariant] no strategy depends SOLELY on experienceLevel — goal/phase can always change the result for a fixed experience", () => {
    const experienceLevel: ExperienceLevel = "advanced";
    // accumulation, not intensification: since the Phase A remediation
    // fix to goalCallsForVolumeDensity (fat_loss no longer overrides every
    // phase), fat_loss and muscle_growth legitimately agree at
    // intensification ("rir" for both) — accumulation is where fat_loss's
    // narrower, correct override actually still diverges from muscle_growth's
    // unoverridden default.
    const baseline = selectProgressionStrategy("muscle_growth", experienceLevel, "accumulation");
    const goalOverridden = selectProgressionStrategy("fat_loss", experienceLevel, "accumulation");
    const phaseOverridden = selectProgressionStrategy("muscle_growth", experienceLevel, "taper");
    expect(goalOverridden).not.toBe(baseline);
    expect(phaseOverridden).not.toBe(baseline);
  });

  it("[invariant] is deterministic", () => {
    for (const goal of SUPPORTED_GOALS) {
      for (const experienceLevel of ALL_EXPERIENCE) {
        for (const phaseType of PHASE_TYPES) {
          expect(selectProgressionStrategy(goal, experienceLevel, phaseType)).toBe(
            selectProgressionStrategy(goal, experienceLevel, phaseType),
          );
        }
      }
    }
  });

  it("never returns a numeric-looking value — always one of the five named strategies", () => {
    for (const goal of SUPPORTED_GOALS) {
      for (const experienceLevel of ALL_EXPERIENCE) {
        for (const phaseType of PHASE_TYPES) {
          expect(PROGRESSION_STRATEGIES).toContain(selectProgressionStrategy(goal, experienceLevel, phaseType));
        }
      }
    }
  });
});

// ─────────────────────────────────────────────────────────────
// Exercise-role retention
// ─────────────────────────────────────────────────────────────
describe("exercise-role retention", () => {
  it("[M] staple retains by default at a block transition (never an unconditional rotate signal), and has the highest minimum retention among finite-retention roles", () => {
    // Review finding on Phase A candidate 6df43c1: the old boolean API name,
    // rotatesAtBlockTransitionByDefault(role): boolean, could be misread as
    // "must rotate" rather than "eligible to consider rotating." Replaced
    // with a three-value RotationPolicy that can't express an unconditional
    // mutation command. CRITICAL INVARIANT: block transition ≠ exercise
    // rotation — retain_by_default means a transition alone is never
    // sufficient reason to rotate this role.
    expect(rotationPolicyFor("staple")).toBe("retain_by_default");
    expect(minimumRetentionBlocks("staple")).toBe(2);
  });

  it("[N] accessory is eligible (not mandated) to rotate at a block transition; isolation/conditioning are freely rotatable; secondary_compound/corrective retain by default", () => {
    expect(rotationPolicyFor("accessory")).toBe("eligible_at_transition");
    expect(rotationPolicyFor("isolation")).toBe("freely_rotatable");
    expect(rotationPolicyFor("conditioning")).toBe("freely_rotatable");
    expect(rotationPolicyFor("secondary_compound")).toBe("retain_by_default");
    expect(rotationPolicyFor("corrective")).toBe("retain_by_default");
  });

  it("corrective/mobility has no elapsed-time-based retention requirement at all (Infinity, not a large finite number)", () => {
    expect(minimumRetentionBlocks("corrective")).toBe(Number.POSITIVE_INFINITY);
  });

  it("isolation and conditioning have no minimum retention floor", () => {
    expect(minimumRetentionBlocks("isolation")).toBe(0);
    expect(minimumRetentionBlocks("conditioning")).toBe(0);
  });

  it("every role produces a defined, finite-or-Infinity retention value and a named RotationPolicy — never a bare boolean", () => {
    for (const role of EXERCISE_ROLES) {
      expect(typeof minimumRetentionBlocks(role)).toBe("number");
      const policy: RotationPolicy = rotationPolicyFor(role);
      expect(ROTATION_POLICIES).toContain(policy);
      expect(typeof policy).toBe("string");
    }
  });

  it("[invariant] neither retention function accepts an experienceLevel parameter at all — enforced by the exported function signatures themselves, not just by convention", () => {
    expect(minimumRetentionBlocks.length).toBe(1);
    expect(rotationPolicyFor.length).toBe(1);
  });
});

// ─────────────────────────────────────────────────────────────
// Phase display names
// ─────────────────────────────────────────────────────────────
describe("defaultPhaseDisplayName", () => {
  it("returns a non-empty, human-readable string for every phaseType x goal combination", () => {
    for (const goal of SUPPORTED_GOALS) {
      for (const phaseType of PHASE_TYPES) {
        const name = defaultPhaseDisplayName(phaseType, goal);
        expect(typeof name).toBe("string");
        expect(name.length).toBeGreaterThan(0);
      }
    }
  });

  it("never returns the raw internal phaseType string itself as the display name", () => {
    for (const goal of SUPPORTED_GOALS) {
      for (const phaseType of PHASE_TYPES) {
        expect(defaultPhaseDisplayName(phaseType, goal)).not.toBe(phaseType);
      }
    }
  });

  it("applies a goal-specific override where one is defined", () => {
    expect(defaultPhaseDisplayName("accumulation", "muscle_growth")).toBe("Hypertrophy Block");
    expect(defaultPhaseDisplayName("taper", "competition_prep")).toBe("Peak Week");
  });

  it("falls back to the generic default where no goal-specific override exists", () => {
    expect(defaultPhaseDisplayName("deload", "muscle_growth")).toBe("Recovery Week");
    expect(defaultPhaseDisplayName("resensitization", "fat_loss")).toBe("Reset Phase");
  });
});

// ─────────────────────────────────────────────────────────────
// Beginner effort — internal band only, never a client-facing number
// ─────────────────────────────────────────────────────────────
describe("effortBandFor", () => {
  it("beginner -> conservative, intermediate/mixed -> moderate, advanced/competitive -> aggressive", () => {
    expect(effortBandFor("beginner")).toBe("conservative");
    expect(effortBandFor("intermediate")).toBe("moderate");
    expect(effortBandFor("mixed")).toBe("moderate");
    expect(effortBandFor("advanced")).toBe("aggressive");
    expect(effortBandFor("competitive")).toBe("aggressive");
  });

  it("[beginner effort contract] never produces a numeric value — always one of the three named bands", () => {
    for (const experienceLevel of ALL_EXPERIENCE) {
      const band = effortBandFor(experienceLevel);
      expect(EFFORT_BANDS).toContain(band);
      expect(Number.isNaN(Number(band))).toBe(true); // confirms it isn't secretly a numeric string like "4"
    }
  });
});
