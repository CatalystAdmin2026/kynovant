import { describe, it, expect } from "vitest";
import { validatePrescriptions } from "../modules/validity";
import { makeBlueprint, makeExercise, makePrescription, makeSection } from "./helpers";

describe("validatePrescriptions — clean blueprint", () => {
  it("returns valid=true with no findings for a well-formed blueprint", () => {
    const result = validatePrescriptions(makeBlueprint());
    expect(result.valid).toBe(true);
    expect(result.errors).toHaveLength(0);
    expect(result.warnings).toHaveLength(0);
  });
});

describe("validatePrescriptions — VALIDITY_NO_PRESCRIPTIONS", () => {
  it("warns when blueprint has zero prescriptions", () => {
    const result = validatePrescriptions(makeBlueprint({ prescriptions: [] }));
    expect(result.valid).toBe(true); // warnings don't invalidate
    expect(result.warnings).toHaveLength(1);
    expect(result.warnings[0].code).toBe("VALIDITY_NO_PRESCRIPTIONS");
  });
});

describe("validatePrescriptions — VALIDITY_REPS_INVERTED", () => {
  it("errors when repsMin > repsMax", () => {
    const p = makePrescription({ repsMin: 10, repsMax: 6 });
    const result = validatePrescriptions(makeBlueprint({ prescriptions: [p] }));
    expect(result.valid).toBe(false);
    expect(result.errors[0].code).toBe("VALIDITY_REPS_INVERTED");
  });

  it("does not fire when repsMin === repsMax (equal is valid)", () => {
    const p = makePrescription({ repsMin: 8, repsMax: 8 });
    const result = validatePrescriptions(makeBlueprint({ prescriptions: [p] }));
    const codes = result.errors.map((f) => f.code);
    expect(codes).not.toContain("VALIDITY_REPS_INVERTED");
  });

  it("does not fire when either reps field is null", () => {
    const p = makePrescription({ repsMin: null, repsMax: 8 });
    const result = validatePrescriptions(makeBlueprint({ prescriptions: [p] }));
    const codes = result.errors.map((f) => f.code);
    expect(codes).not.toContain("VALIDITY_REPS_INVERTED");
  });
});

describe("validatePrescriptions — VALIDITY_EXERCISE_INACTIVE", () => {
  it("errors when exercise is missing (deleted from DB)", () => {
    const p = makePrescription({ exercise: null, missing: true });
    const result = validatePrescriptions(makeBlueprint({ prescriptions: [p] }));
    expect(result.valid).toBe(false);
    expect(result.errors[0].code).toBe("VALIDITY_EXERCISE_INACTIVE");
  });

  it("errors when exercise has status=archived", () => {
    const p = makePrescription({
      exercise: makeExercise({ status: "archived" }),
      missing: false,
    });
    const result = validatePrescriptions(makeBlueprint({ prescriptions: [p] }));
    expect(result.valid).toBe(false);
    expect(result.errors[0].code).toBe("VALIDITY_EXERCISE_INACTIVE");
  });

  it("errors when exercise has status=draft", () => {
    const p = makePrescription({
      exercise: makeExercise({ status: "draft" }),
      missing: false,
    });
    const result = validatePrescriptions(makeBlueprint({ prescriptions: [p] }));
    expect(result.valid).toBe(false);
    expect(result.errors[0].code).toBe("VALIDITY_EXERCISE_INACTIVE");
  });

  it("does not fire for active exercises", () => {
    const p = makePrescription({ exercise: makeExercise({ status: "active" }) });
    const result = validatePrescriptions(makeBlueprint({ prescriptions: [p] }));
    const codes = result.errors.map((f) => f.code);
    expect(codes).not.toContain("VALIDITY_EXERCISE_INACTIVE");
  });
});

describe("validatePrescriptions — VALIDITY_RPE_EXCEEDS_MAX", () => {
  it("errors when targetRpe > 10", () => {
    const p = makePrescription({ targetRpe: 10.5 });
    const result = validatePrescriptions(makeBlueprint({ prescriptions: [p] }));
    expect(result.valid).toBe(false);
    expect(result.errors[0].code).toBe("VALIDITY_RPE_EXCEEDS_MAX");
  });

  it("does not fire when targetRpe === 10 (boundary is valid)", () => {
    const p = makePrescription({ targetRpe: 10 });
    const result = validatePrescriptions(makeBlueprint({ prescriptions: [p] }));
    const codes = result.errors.map((f) => f.code);
    expect(codes).not.toContain("VALIDITY_RPE_EXCEEDS_MAX");
  });

  it("does not fire when targetRpe is null", () => {
    const p = makePrescription({ targetRpe: null });
    const result = validatePrescriptions(makeBlueprint({ prescriptions: [p] }));
    const codes = result.errors.map((f) => f.code);
    expect(codes).not.toContain("VALIDITY_RPE_EXCEEDS_MAX");
  });
});

describe("validatePrescriptions — VALIDITY_GROUP_SINGLE", () => {
  it("errors when a groupId has only one member", () => {
    const p = makePrescription({ groupId: "group-abc", groupPosition: 1 });
    const result = validatePrescriptions(makeBlueprint({ prescriptions: [p] }));
    expect(result.valid).toBe(false);
    expect(result.errors[0].code).toBe("VALIDITY_GROUP_SINGLE");
  });

  it("does not fire when a groupId has two members", () => {
    const p1 = makePrescription({ id: "pte-1", orderIndex: 0, groupId: "group-abc", groupPosition: 1 });
    const p2 = makePrescription({
      id: "pte-2",
      exerciseId: "ex-2",
      exercise: makeExercise({ id: "ex-2", name: "Barbell Row" }),
      orderIndex: 1,
      groupId: "group-abc",
      groupPosition: 2,
    });
    const result = validatePrescriptions(makeBlueprint({ prescriptions: [p1, p2] }));
    const codes = result.errors.map((f) => f.code);
    expect(codes).not.toContain("VALIDITY_GROUP_SINGLE");
  });
});

describe("validatePrescriptions — VALIDITY_GROUP_POSITION_GAP", () => {
  it("errors when group positions are non-sequential [1, 3]", () => {
    const p1 = makePrescription({ id: "pte-1", orderIndex: 0, groupId: "group-abc", groupPosition: 1 });
    const p2 = makePrescription({
      id: "pte-2",
      exerciseId: "ex-2",
      exercise: makeExercise({ id: "ex-2", name: "Barbell Row" }),
      orderIndex: 1,
      groupId: "group-abc",
      groupPosition: 3,
    });
    const result = validatePrescriptions(makeBlueprint({ prescriptions: [p1, p2] }));
    expect(result.valid).toBe(false);
    expect(result.errors.some((f) => f.code === "VALIDITY_GROUP_POSITION_GAP")).toBe(true);
  });

  it("does not fire for sequential positions [1, 2, 3]", () => {
    const shared = { groupId: "group-abc", sectionId: "section-1" };
    const p1 = makePrescription({ id: "pte-1", orderIndex: 0, groupPosition: 1, ...shared });
    const p2 = makePrescription({
      id: "pte-2",
      exerciseId: "ex-2",
      exercise: makeExercise({ id: "ex-2", name: "Barbell Row" }),
      orderIndex: 1,
      groupPosition: 2,
      ...shared,
    });
    const p3 = makePrescription({
      id: "pte-3",
      exerciseId: "ex-3",
      exercise: makeExercise({ id: "ex-3", name: "Cable Fly" }),
      orderIndex: 2,
      groupPosition: 3,
      ...shared,
    });
    const result = validatePrescriptions(makeBlueprint({ prescriptions: [p1, p2, p3] }));
    const codes = result.errors.map((f) => f.code);
    expect(codes).not.toContain("VALIDITY_GROUP_POSITION_GAP");
  });
});

describe("validatePrescriptions — VALIDITY_DUPLICATE_ORDER", () => {
  it("errors when two prescriptions share orderIndex in the same section", () => {
    const p1 = makePrescription({ id: "pte-1", orderIndex: 0, sectionId: "section-1" });
    const p2 = makePrescription({
      id: "pte-2",
      exerciseId: "ex-2",
      exercise: makeExercise({ id: "ex-2", name: "Barbell Row" }),
      orderIndex: 0,
      sectionId: "section-1",
    });
    const result = validatePrescriptions(makeBlueprint({ prescriptions: [p1, p2] }));
    expect(result.valid).toBe(false);
    expect(result.errors[0].code).toBe("VALIDITY_DUPLICATE_ORDER");
  });

  it("does not fire when same orderIndex is in different sections", () => {
    const sections = [
      makeSection({ id: "section-1", orderIndex: 0 }),
      makeSection({ id: "section-2", sectionType: "accessory", orderIndex: 1 }),
    ];
    const p1 = makePrescription({ id: "pte-1", orderIndex: 0, sectionId: "section-1", sectionType: "main_lift" });
    const p2 = makePrescription({
      id: "pte-2",
      exerciseId: "ex-2",
      exercise: makeExercise({ id: "ex-2", name: "Barbell Row" }),
      orderIndex: 0,
      sectionId: "section-2",
      sectionType: "accessory",
    });
    const result = validatePrescriptions(makeBlueprint({ sections, prescriptions: [p1, p2] }));
    const codes = result.errors.map((f) => f.code);
    expect(codes).not.toContain("VALIDITY_DUPLICATE_ORDER");
  });
});

describe("validatePrescriptions — VALIDITY_ORPHANED_SECTION", () => {
  it("errors when a prescription references a sectionId not in blueprint.sections", () => {
    const p = makePrescription({ sectionId: "nonexistent-section" });
    // Blueprint has section-1, but prescription references nonexistent-section
    const result = validatePrescriptions(makeBlueprint({ prescriptions: [p] }));
    expect(result.valid).toBe(false);
    expect(result.errors[0].code).toBe("VALIDITY_ORPHANED_SECTION");
  });

  it("does not fire when prescription has no sectionId (null)", () => {
    const p = makePrescription({ sectionId: null, sectionType: null });
    const result = validatePrescriptions(makeBlueprint({ prescriptions: [p] }));
    const codes = result.errors.map((f) => f.code);
    expect(codes).not.toContain("VALIDITY_ORPHANED_SECTION");
  });
});

describe("validatePrescriptions — multiple simultaneous violations", () => {
  it("reports all violations in a single pass", () => {
    const p1 = makePrescription({ id: "pte-1", repsMin: 12, repsMax: 6 });
    const p2 = makePrescription({
      id: "pte-2",
      exerciseId: "ex-2",
      exercise: makeExercise({ id: "ex-2", status: "archived" }),
      orderIndex: 1,
      targetRpe: 11,
    });
    const result = validatePrescriptions(makeBlueprint({ prescriptions: [p1, p2] }));
    expect(result.valid).toBe(false);
    const codes = result.errors.map((f) => f.code);
    expect(codes).toContain("VALIDITY_REPS_INVERTED");
    expect(codes).toContain("VALIDITY_EXERCISE_INACTIVE");
    expect(codes).toContain("VALIDITY_RPE_EXCEEDS_MAX");
  });
});
