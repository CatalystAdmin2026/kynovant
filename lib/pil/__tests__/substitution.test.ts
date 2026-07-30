import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock the database modules before importing the module under test
vi.mock("@/lib/db/client", () => ({
  getDb: vi.fn(),
}));

vi.mock("@/lib/db/schema-exercise", () => ({
  exerciseRelations: {
    sourceExerciseId: "source_exercise_id",
    targetExerciseId: "target_exercise_id",
    relationType: "relation_type",
    substitutionPolicy: "substitution_policy",
    suitabilityScore: "suitability_score",
  },
  exercises: {
    id: "id",
    name: "name",
    primaryMuscleGroup: "primary_muscle_group",
    movementPattern: "movement_pattern",
    status: "status",
  },
}));

import { getDb } from "@/lib/db/client";
import { getSubstitutes } from "../substitution";

// ─── DB mock helpers ──────────────────────────────────────────────────────────

function makeExerciseRow(
  id: string,
  name: string,
  primaryMuscleGroup: string,
  movementPattern: string,
) {
  return { id, name, primaryMuscleGroup, movementPattern };
}

function makeRelationRow(
  candidateId: string,
  relationType = "substitute",
  suitabilityScore: number | null = 80,
  substitutionPolicy: string | null = null,
) {
  return { candidateId, relationType, substitutionPolicy, suitabilityScore };
}

type MockDb = {
  select: ReturnType<typeof vi.fn>;
  from: ReturnType<typeof vi.fn>;
  where: ReturnType<typeof vi.fn>;
  limit: ReturnType<typeof vi.fn>;
};

function buildMockDb(
  sourceExercise: { primaryMuscleGroup: string; movementPattern: string } | null,
  outboundRows: ReturnType<typeof makeRelationRow>[],
  inboundRows: ReturnType<typeof makeRelationRow>[],
  candidateExercises: ReturnType<typeof makeExerciseRow>[],
) {
  // Track which select call we are on (indexed)
  let selectCallCount = 0;

  const chainBase: MockDb = {
    select: vi.fn().mockReturnThis(),
    from: vi.fn().mockReturnThis(),
    where: vi.fn(),
    limit: vi.fn(),
  };

  // Each .where() call resolves to the appropriate dataset
  chainBase.where.mockImplementation(() => {
    selectCallCount++;
    switch (selectCallCount) {
      case 1:
        // Source exercise lookup — returns array, with .limit() chained
        return {
          limit: vi.fn().mockResolvedValue(
            sourceExercise ? [{ ...sourceExercise }] : [],
          ),
        };
      case 2:
        // Outbound relations
        return Promise.resolve(outboundRows);
      case 3:
        // Inbound relations
        return Promise.resolve(inboundRows);
      case 4:
        // Candidate exercise details (with and(inArray(...), eq(...)))
        return Promise.resolve(candidateExercises);
      default:
        return Promise.resolve([]);
    }
  });

  return chainBase;
}

describe("getSubstitutes", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns empty candidates when the source exercise is not found", async () => {
    const db = buildMockDb(null, [], [], []);
    (getDb as ReturnType<typeof vi.fn>).mockResolvedValue(db);

    const result = await getSubstitutes("missing-ex");
    expect(result.sourceExerciseId).toBe("missing-ex");
    expect(result.candidates).toHaveLength(0);
  });

  it("returns empty candidates when no outbound or inbound relations exist", async () => {
    const db = buildMockDb(
      { primaryMuscleGroup: "chest", movementPattern: "push_horizontal" },
      [],
      [],
      [],
    );
    (getDb as ReturnType<typeof vi.fn>).mockResolvedValue(db);

    const result = await getSubstitutes("ex-source");
    expect(result.candidates).toHaveLength(0);
  });

  it("returns outbound candidates with direction=outbound", async () => {
    const db = buildMockDb(
      { primaryMuscleGroup: "chest", movementPattern: "push_horizontal" },
      [makeRelationRow("ex-cand-1", "substitute", 85)],
      [],
      [makeExerciseRow("ex-cand-1", "Dumbbell Press", "chest", "push_horizontal")],
    );
    (getDb as ReturnType<typeof vi.fn>).mockResolvedValue(db);

    const result = await getSubstitutes("ex-source");
    expect(result.candidates).toHaveLength(1);
    expect(result.candidates[0].exerciseId).toBe("ex-cand-1");
    expect(result.candidates[0].relationDirection).toBe("outbound");
  });

  it("returns inbound candidates with direction=inbound", async () => {
    const db = buildMockDb(
      { primaryMuscleGroup: "lats", movementPattern: "pull_vertical" },
      [],
      [makeRelationRow("ex-cand-2", "substitute", 70)],
      [makeExerciseRow("ex-cand-2", "Cable Pulldown", "lats", "pull_vertical")],
    );
    (getDb as ReturnType<typeof vi.fn>).mockResolvedValue(db);

    const result = await getSubstitutes("ex-source");
    expect(result.candidates).toHaveLength(1);
    expect(result.candidates[0].relationDirection).toBe("inbound");
  });

  it("outbound wins when same candidate appears in both directions", async () => {
    const db = buildMockDb(
      { primaryMuscleGroup: "chest", movementPattern: "push_horizontal" },
      [makeRelationRow("ex-shared", "substitute", 90)],
      [makeRelationRow("ex-shared", "regression", 60)],
      [makeExerciseRow("ex-shared", "Machine Press", "chest", "push_horizontal")],
    );
    (getDb as ReturnType<typeof vi.fn>).mockResolvedValue(db);

    const result = await getSubstitutes("ex-source");
    expect(result.candidates).toHaveLength(1);
    expect(result.candidates[0].relationDirection).toBe("outbound");
    expect(result.candidates[0].relationType).toBe("substitute");
  });

  it("similarityScore is 100 when both muscleGroup and movementPattern match", async () => {
    const db = buildMockDb(
      { primaryMuscleGroup: "chest", movementPattern: "push_horizontal" },
      [makeRelationRow("ex-twin", "substitute", 80)],
      [],
      [makeExerciseRow("ex-twin", "Flat DB Press", "chest", "push_horizontal")],
    );
    (getDb as ReturnType<typeof vi.fn>).mockResolvedValue(db);

    const result = await getSubstitutes("ex-source");
    expect(result.candidates[0].similarityScore).toBe(100);
  });

  it("similarityScore is 50 when only muscleGroup matches", async () => {
    const db = buildMockDb(
      { primaryMuscleGroup: "chest", movementPattern: "push_horizontal" },
      [makeRelationRow("ex-partial", "substitute", 70)],
      [],
      [makeExerciseRow("ex-partial", "Cable Fly", "chest", "shoulder_adduction")],
    );
    (getDb as ReturnType<typeof vi.fn>).mockResolvedValue(db);

    const result = await getSubstitutes("ex-source");
    expect(result.candidates[0].similarityScore).toBe(50);
  });

  it("similarityScore is 0 when neither muscle nor pattern match", async () => {
    const db = buildMockDb(
      { primaryMuscleGroup: "chest", movementPattern: "push_horizontal" },
      [makeRelationRow("ex-diff", "substitute", 50)],
      [],
      [makeExerciseRow("ex-diff", "Leg Curl", "hamstrings", "knee_flexion")],
    );
    (getDb as ReturnType<typeof vi.fn>).mockResolvedValue(db);

    const result = await getSubstitutes("ex-source");
    expect(result.candidates[0].similarityScore).toBe(0);
  });

  it("sorts by suitabilityScore DESC, then similarityScore DESC", async () => {
    // Three candidates: low suitability but perfect similarity, high suitability but low similarity, middle
    const db = buildMockDb(
      { primaryMuscleGroup: "chest", movementPattern: "push_horizontal" },
      [
        makeRelationRow("ex-a", "substitute", 90), // high suit, will match on similarity=0
        makeRelationRow("ex-b", "substitute", 70), // mid suit
        makeRelationRow("ex-c", "substitute", 90), // same suit as a, higher similarity
      ],
      [],
      [
        makeExerciseRow("ex-a", "Exercise A", "lats", "pull_vertical"),       // sim=0
        makeExerciseRow("ex-b", "Exercise B", "chest", "push_horizontal"),   // sim=100
        makeExerciseRow("ex-c", "Exercise C", "chest", "push_horizontal"),   // sim=100
      ],
    );
    (getDb as ReturnType<typeof vi.fn>).mockResolvedValue(db);

    const result = await getSubstitutes("ex-source");
    // ex-c and ex-a both have suit=90, but ex-c sim=100 > ex-a sim=0 → ex-c first
    expect(result.candidates[0].exerciseId).toBe("ex-c");
    expect(result.candidates[1].exerciseId).toBe("ex-a");
    expect(result.candidates[2].exerciseId).toBe("ex-b");
  });

  it("treats null suitabilityScore as last in sort", async () => {
    const db = buildMockDb(
      { primaryMuscleGroup: "chest", movementPattern: "push_horizontal" },
      [
        makeRelationRow("ex-null-suit", "substitute", null),
        makeRelationRow("ex-scored", "substitute", 50),
      ],
      [],
      [
        makeExerciseRow("ex-null-suit", "No Score Ex", "chest", "push_horizontal"),
        makeExerciseRow("ex-scored", "Scored Ex", "chest", "push_horizontal"),
      ],
    );
    (getDb as ReturnType<typeof vi.fn>).mockResolvedValue(db);

    const result = await getSubstitutes("ex-source");
    expect(result.candidates[0].exerciseId).toBe("ex-scored");
    expect(result.candidates[1].exerciseId).toBe("ex-null-suit");
  });
});
