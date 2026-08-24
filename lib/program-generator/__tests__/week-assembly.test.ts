// ─────────────────────────────────────────────────────────────
// Regression suite — missing-day assembly escape (review finding on
// the day-level architecture v1). assembleWeekFromDays() previously
// threw before any surrounding try/catch could run; this proves the
// fixed version always returns a discriminated result instead, for
// both the missing-day case and the success case, without needing a
// database.
// ─────────────────────────────────────────────────────────────

import { describe, it, expect } from "vitest";
import { alignDayToShellDay, assembleWeekFromDays, assignCanonicalDayId, resolvePriorWeekContinuityFallback } from "../staged-generation";
import type { ModelDayDraft, ModelWeekDraft, ProgramShellDay } from "../contracts";

function day(dayOfWeek: number, label: string, id?: string): ModelDayDraft {
  return {
    id: id ?? `day-${dayOfWeek}`,
    dayOfWeek,
    label,
    notes: `notes for ${label}`,
    workout: {
      id: `workout-${dayOfWeek}`,
      name: label,
      sections: [
        {
          id: `section-${dayOfWeek}`,
          name: "Main",
          sectionType: "main_lift",
          orderIndex: 0,
          prescriptions: [{ id: `p-${dayOfWeek}`, exerciseName: "Back Squat", orderIndex: 0, isRequired: true }],
        },
      ],
    },
  };
}

const SHELL_DAYS: ProgramShellDay[] = [
  { dayOfWeek: 1, label: "Day A" },
  { dayOfWeek: 3, label: "Day B" },
  { dayOfWeek: 5, label: "Day C" },
];

describe("assembleWeekFromDays — never throws, always a discriminated result", () => {
  it("succeeds when every shell day has a completed row", () => {
    const completed = new Map<number, ModelDayDraft>([
      [1, day(1, "Day A")],
      [2, day(3, "Day B")],
      [3, day(5, "Day C")],
    ]);
    const result = assembleWeekFromDays(1, SHELL_DAYS, completed);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.week.days).toHaveLength(3);
    expect(result.week.weekNumber).toBe(1);
  });

  it("returns ok:false (never throws) when a day is missing — the exact review finding", () => {
    const completed = new Map<number, ModelDayDraft>([
      [1, day(1, "Day A")],
      // day 2 missing
      [3, day(5, "Day C")],
    ]);
    expect(() => assembleWeekFromDays(2, SHELL_DAYS, completed)).not.toThrow();
    const result = assembleWeekFromDays(2, SHELL_DAYS, completed);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toContain("week 2 day 2");
  });

  it("returns ok:false for an empty completed-days map (nothing generated yet)", () => {
    const result = assembleWeekFromDays(1, SHELL_DAYS, new Map());
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toContain("day 1");
  });

  it("reasserts shell day metadata when a model-returned day drifts", () => {
    const completed = new Map<number, ModelDayDraft>([
      [1, day(1, "Day A")],
      [2, day(3, "Day B")],
      // Staging regression: the provider returned useful day-3 content
      // but echoed dayOfWeek 3 from the previous slot, which used to
      // fail week assembly with duplicate dayOfWeek values.
      [3, day(3, "Wrong Echoed Label")],
    ]);

    const result = assembleWeekFromDays(4, SHELL_DAYS, completed);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.week.days.map((d) => d.dayOfWeek)).toEqual([1, 3, 5]);
    expect(result.week.days.map((d) => d.label)).toEqual(["Day A", "Day B", "Day C"]);
  });

  it("alignDayToShellDay leaves workout content intact while replacing structural day metadata", () => {
    // [Expanded-week labeling remediation] No longer a reference-equality
    // check: alignDayToShellDay now also runs sanitizeGeneratedWorkoutName()
    // over workout.name (stripping a stale trailing "- Week N" the model
    // sometimes embeds in its own workout title — see staged-generation.ts's
    // own comment), which means it always returns a NEW workout object
    // (a shallow copy) rather than passing the original reference through
    // untouched. Content equality is the right bar here; this fixture's
    // name ("Wrong", from day(4, "Wrong")) has no week-reference suffix
    // to strip, so the CONTENT is unchanged either way — only the object
    // identity differs now, which is the deliberate, one-line cost of a
    // real fix, not a regression.
    const drifted = day(4, "Wrong");
    const aligned = alignDayToShellDay(drifted, { dayOfWeek: 6, label: "Correct" });
    expect(aligned.dayOfWeek).toBe(6);
    expect(aligned.label).toBe("Correct");
    expect(aligned.workout).toEqual(drifted.workout);
  });

  it("alignDayToShellDay does not touch id or notes — only dayOfWeek/label are shell-owned", () => {
    const drifted = day(4, "Wrong", "model-generated-day-id");
    const aligned = alignDayToShellDay(drifted, { dayOfWeek: 6, label: "Correct" });
    expect(aligned.id).toBe("model-generated-day-id");
    expect(aligned.notes).toBe(drifted.notes);
  });

  it("is a no-op on already-correct model metadata — the happy path changes nothing unexpected", () => {
    // Every field the model returned already matches the shell exactly
    // (the common case). Assembly must not perturb id, notes, or any
    // prescription content just by passing through alignDayToShellDay.
    const completed = new Map<number, ModelDayDraft>([
      [1, day(1, "Day A")],
      [2, day(3, "Day B")],
      [3, day(5, "Day C")],
    ]);
    const result = assembleWeekFromDays(1, SHELL_DAYS, completed);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.week.days.map((d) => d.id)).toEqual(["day-1", "day-3", "day-5"]);
    expect(result.week.days.map((d) => d.notes)).toEqual(["notes for Day A", "notes for Day B", "notes for Day C"]);
    // Not a reference check: ModelWeekDraftSchema.safeParse() rebuilds the
    // object graph during validation (Zod's normal behavior), so content
    // equality — not Object.is identity — is the right bar for anything
    // read back through assembleWeekFromDays's schema-validated result.
    // alignDayToShellDay's OWN reference-preservation is covered directly
    // by the dedicated test above, one level below this schema reparse.
    expect(result.week.days[0].workout).toEqual(completed.get(1)!.workout);
    expect(result.week.days[0].workout?.sections[0].prescriptions).toEqual(
      completed.get(1)!.workout!.sections[0].prescriptions,
    );
  });

  it("corrects only the label when dayOfWeek is already correct but the label drifted", () => {
    const completed = new Map<number, ModelDayDraft>([
      [1, day(1, "Day A")],
      // dayOfWeek is right (3, matching SHELL_DAYS[1]); only the label drifted.
      [2, day(3, "Totally Different Label")],
      [3, day(5, "Day C")],
    ]);
    const result = assembleWeekFromDays(2, SHELL_DAYS, completed);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.week.days.map((d) => d.dayOfWeek)).toEqual([1, 3, 5]);
    expect(result.week.days[1].label).toBe("Day B");
  });
});

// ─────────────────────────────────────────────────────────────
// assignCanonicalDayId — day.id review finding. Each day comes from an
// independent provider call with no visibility into ids used by other
// weeks/days, so the model can echo the same id for two unrelated
// days. This is the application-owned replacement, called exactly once
// per day slot at first persistence (see staged-generation.ts's own
// comment on the one real call site).
// ─────────────────────────────────────────────────────────────
describe("assignCanonicalDayId", () => {
  it("[A] two days that echo the SAME model id get different canonical ids", () => {
    const dayA = day(1, "Day A", "same-model-id");
    const dayB = day(3, "Day B", "same-model-id");
    const canonicalA = assignCanonicalDayId(dayA);
    const canonicalB = assignCanonicalDayId(dayB);
    expect(canonicalA.id).not.toBe(canonicalB.id);
    expect(canonicalA.id).not.toBe("same-model-id");
    expect(canonicalB.id).not.toBe("same-model-id");
  });

  it("[B] the same colliding model id echoed across independent WEEKS still yields unique canonical ids", () => {
    // Simulates week 1 day 1 and week 5 day 1 — same shell day-slot,
    // completely independent provider calls — both echoing the exact
    // same id, exactly the scenario edit-ops.ts's cross-week findSection
    // search is vulnerable to if left uncorrected.
    const week1Day1 = assignCanonicalDayId(day(1, "Day A", "push-day-id"));
    const week5Day1 = assignCanonicalDayId(day(1, "Day A", "push-day-id"));
    expect(week1Day1.id).not.toBe(week5Day1.id);
  });

  it("[C] wrong dayOfWeek + duplicate id are both corrected when composed the same way runStagedGeneration does", () => {
    const drifted = day(3, "Wrong Echoed Label", "colliding-id");
    const alreadyUsed = assignCanonicalDayId(day(1, "Day A", "colliding-id"));
    const fixed = assignCanonicalDayId(alignDayToShellDay(drifted, SHELL_DAYS[1]));
    expect(fixed.dayOfWeek).toBe(SHELL_DAYS[1].dayOfWeek);
    expect(fixed.label).toBe(SHELL_DAYS[1].label);
    expect(fixed.id).not.toBe("colliding-id");
    expect(fixed.id).not.toBe(alreadyUsed.id);
  });

  it("[D] content survives normalization unchanged — only id changes", () => {
    const original = day(4, "Some Day", "model-id");
    const canonical = assignCanonicalDayId(original);
    expect(canonical.id).not.toBe(original.id);
    expect(canonical.dayOfWeek).toBe(original.dayOfWeek);
    expect(canonical.label).toBe(original.label);
    expect(canonical.notes).toBe(original.notes);
    expect(canonical.workout).toBe(original.workout);
  });

  it("[E] a day's canonical id, once assembled, does not change on a later re-assembly of the same completed-days map", () => {
    // Simulates "assembled once, then read again on a later
    // resume/re-assembly call" — assembleWeekFromDays itself never
    // calls assignCanonicalDayId (only the ONE call site in
    // runStagedGeneration does, at first persistence), so re-running
    // assembly against the SAME already-completed days must be a
    // pure, id-stable read, never a re-mint.
    const completed = new Map<number, ModelDayDraft>([
      [1, assignCanonicalDayId(day(1, "Day A"))],
      [2, assignCanonicalDayId(day(3, "Day B"))],
      [3, assignCanonicalDayId(day(5, "Day C"))],
    ]);
    const first = assembleWeekFromDays(1, SHELL_DAYS, completed);
    const second = assembleWeekFromDays(1, SHELL_DAYS, completed);
    expect(first.ok).toBe(true);
    expect(second.ok).toBe(true);
    if (!first.ok || !second.ok) return;
    expect(first.week.days.map((d) => d.id)).toEqual(second.week.days.map((d) => d.id));
  });

  it("[H] happy path — a day whose model id was already fine still gets replaced with a real canonical id", () => {
    // Not a regression in behavior (assignCanonicalDayId always
    // replaces id, whether or not the original looked fine) but proves
    // the happy path doesn't throw or corrupt content just because
    // nothing was actually wrong.
    const fine = day(1, "Day A", "already-unique-id");
    const result = assignCanonicalDayId(fine);
    expect(result.id).toEqual(expect.any(String));
    expect(result.id.length).toBeGreaterThan(0);
    expect(result.dayOfWeek).toBe(1);
    expect(result.label).toBe("Day A");
  });
});

// ─────────────────────────────────────────────────────────────
// resolvePriorWeekContinuityFallback — Phase C review finding (candidate
// 5bfc4bc): a deterministically expanded week (Phase B) persists a
// single program_generation_weeks row and ZERO program_generation_days
// rows, so the real per-day-row continuity lookup finds nothing for it.
// This is the fallback: locate each day-slot's content directly from
// the prior week's own persisted ModelWeekDraft instead, by structural
// dayOfWeek (never array position).
// ─────────────────────────────────────────────────────────────
describe("resolvePriorWeekContinuityFallback", () => {
  function week(days: ModelDayDraft[]): ModelWeekDraft {
    return { id: "week-id", weekNumber: 1, days };
  }

  it("[fallback B] prior week has completed week JSON but no day rows — produces a summary for every matching slot", () => {
    const priorWeek = week([day(1, "Push"), day(3, "Pull"), day(5, "Legs")]);
    const result = resolvePriorWeekContinuityFallback(priorWeek, SHELL_DAYS);
    expect(result.size).toBe(3);
    expect(result.get(1)?.label).toBe("Push");
    expect(result.get(2)?.label).toBe("Pull");
    expect(result.get(3)?.label).toBe("Legs");
  });

  it("[fallback C] targets the correct SAME-day slot by dayOfWeek, never by array position", () => {
    // Deliberately out of order and with an extra, unrelated day —
    // proves the match is structural (dayOfWeek), not positional.
    const priorWeek = week([day(5, "Legs"), day(1, "Push"), day(9, "Unrelated Extra Day"), day(3, "Pull")]);
    const result = resolvePriorWeekContinuityFallback(priorWeek, SHELL_DAYS);
    expect(result.get(1)?.label).toBe("Push"); // dayOfWeek 1
    expect(result.get(2)?.label).toBe("Pull"); // dayOfWeek 3
    expect(result.get(3)?.label).toBe("Legs"); // dayOfWeek 5
    expect([...result.values()].some((d) => d.label === "Unrelated Extra Day")).toBe(false);
  });

  it("[fallback F/G] no prior week content (undefined) produces an empty map — never fabricated continuity", () => {
    const result = resolvePriorWeekContinuityFallback(undefined, SHELL_DAYS);
    expect(result.size).toBe(0);
  });

  it("a slot with no matching dayOfWeek in the prior week is simply absent from the result, not fabricated", () => {
    const priorWeek = week([day(1, "Push")]); // missing dayOfWeek 3 and 5
    const result = resolvePriorWeekContinuityFallback(priorWeek, SHELL_DAYS);
    expect(result.size).toBe(1);
    expect(result.has(2)).toBe(false);
    expect(result.has(3)).toBe(false);
  });

  it("[fallback H] reflects the expanded week's OWN progression-adjusted content, not a generic/original copy", () => {
    // The critical distinction: this must summarize whatever the prior
    // week's PERSISTED content actually is — which, for an expanded
    // week, already has Phase B's progression fields (e.g. a narrowed
    // rep floor, a lower targetRir) baked in — never re-derive or
    // reach past it to some other, earlier source.
    const progressedDay: ModelDayDraft = {
      id: "d1",
      dayOfWeek: 1,
      label: "Push",
      workout: {
        id: "w1",
        name: "Push",
        sections: [
          {
            id: "s1",
            name: "Main",
            sectionType: "main_lift",
            orderIndex: 0,
            prescriptions: [
              { id: "p1", exerciseName: "Bench Press", orderIndex: 0, isRequired: true, repsMin: 11, repsMax: 12, targetRir: 1 },
            ],
          },
        ],
      },
    };
    const priorWeek = week([progressedDay, day(3, "Pull"), day(5, "Legs")]);
    const result = resolvePriorWeekContinuityFallback(priorWeek, SHELL_DAYS);
    const prescription = result.get(1)?.workout?.sections[0].prescriptions[0];
    expect(prescription?.repsMin).toBe(11);
    expect(prescription?.targetRir).toBe(1);
  });

  it("is a pure function — never mutates the prior week content it reads from", () => {
    const priorWeek = week([day(1, "Push"), day(3, "Pull"), day(5, "Legs")]);
    const snapshot = structuredClone(priorWeek);
    resolvePriorWeekContinuityFallback(priorWeek, SHELL_DAYS);
    expect(priorWeek).toEqual(snapshot);
  });
});
