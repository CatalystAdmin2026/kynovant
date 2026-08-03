import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/db/client", () => ({
  getDb: vi.fn(),
}));

import { getDb } from "@/lib/db/client";
import { getExerciseWithDetails } from "@/lib/db/exercise-service";
import type { Exercise } from "@/lib/db/schema-exercise";

const productionExerciseId = "cf80c77d-096d-4cb3-8412-1e3c82c33488";
const coachId = "11111111-1111-4111-8111-111111111111";
const otherCoachId = "22222222-2222-4222-8222-222222222222";

function makeExercise(overrides: Partial<Exercise> = {}): Exercise {
  return {
    id: productionExerciseId,
    slug: "back-squat",
    name: "Back Squat",
    alternateNames: [],
    movementPattern: "squat_bilateral",
    classification: "compound",
    difficulty: "intermediate",
    resistanceType: "barbell",
    status: "active",
    parentExerciseId: null,
    unilateral: false,
    alternating: false,
    isTimeBased: false,
    isDistanceBased: false,
    isCardio: false,
    isMobility: false,
    fatigueCost: 9,
    technicalComplexity: 7,
    stabilityDemand: 7,
    jointStressShoulder: 3,
    jointStressElbow: null,
    jointStressWrist: null,
    jointStressSpine: 7,
    jointStressHip: 6,
    jointStressKnee: 8,
    jointStressAnkle: null,
    lengthenedBias: 8,
    shortenedBias: null,
    stretchMediatedPotential: 9,
    defaultBodyPosition: null,
    defaultNotes: null,
    coachCreated: true,
    createdBy: null,
    scope: "system",
    primaryMuscleGroup: "quadriceps",
    tags: [],
    defaultPrescription: null,
    searchVector: null,
    createdAt: new Date("2026-01-01T00:00:00Z"),
    updatedAt: new Date("2026-01-01T00:00:00Z"),
    ...overrides,
  };
}

function createDbMock(responses: Array<unknown[] | Error>) {
  const queue = [...responses];

  function nextQuery() {
    const response = queue.shift() ?? [];
    if (response instanceof Error) {
      throw response;
    }
    const chain = {
      from: vi.fn(() => chain),
      where: vi.fn(() => chain),
      limit: vi.fn(() => Promise.resolve(response)),
      orderBy: vi.fn(() => Promise.resolve(response)),
      then: (resolve: (value: unknown[]) => unknown, reject: (reason?: unknown) => unknown) =>
        Promise.resolve(response).then(resolve, reject),
    };
    return chain;
  }

  return {
    select: vi.fn(() => nextQuery()),
  };
}

describe("getExerciseWithDetails", () => {
  beforeEach(() => {
    vi.mocked(getDb).mockReset();
  });

  it("loads a canonical exercise detail for a coach using a real production exercise ID", async () => {
    const exercise = makeExercise();
    const db = createDbMock([
      [exercise],
      [],
      [],
      [],
      [],
      [],
      [],
    ]);
    vi.mocked(getDb).mockReturnValue(db as never);

    const detail = await getExerciseWithDetails(productionExerciseId, {
      id: coachId,
      role: "coach",
    });

    expect(detail?.id).toBe(productionExerciseId);
    expect(detail?.scope).toBe("system");
    expect(detail?.isFavorited).toBe(false);
    expect(detail?.coachOverride).toBeNull();
    expect(db.select).toHaveBeenCalledTimes(7);
  });

  it("allows coaches to view their own coach-scoped exercises", async () => {
    const exercise = makeExercise({ scope: "coach", createdBy: coachId });
    const db = createDbMock([[exercise], [], [], [], [], [], []]);
    vi.mocked(getDb).mockReturnValue(db as never);

    const detail = await getExerciseWithDetails(productionExerciseId, {
      id: coachId,
      role: "coach",
    });

    expect(detail?.id).toBe(productionExerciseId);
  });

  it("returns null for true not found or unpermitted coach-scoped exercises", async () => {
    const db = createDbMock([[]]);
    vi.mocked(getDb).mockReturnValue(db as never);

    const detail = await getExerciseWithDetails(productionExerciseId, {
      id: otherCoachId,
      role: "coach",
    });

    expect(detail).toBeNull();
    expect(db.select).toHaveBeenCalledTimes(1);
  });

  it("surfaces detail query failures instead of converting them to not found", async () => {
    const db = createDbMock([
      [makeExercise()],
      [],
      [],
      [],
      [],
      [],
      new Error("relation exercise_coach_overrides does not exist"),
    ]);
    vi.mocked(getDb).mockReturnValue(db as never);

    await expect(
      getExerciseWithDetails(productionExerciseId, { id: coachId, role: "coach" }),
    ).rejects.toThrow("relation exercise_coach_overrides does not exist");
    expect(db.select).toHaveBeenCalledTimes(7);
  });
});
