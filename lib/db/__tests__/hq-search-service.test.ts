import { describe, expect, it } from "vitest";
import {
  canCoachSeeExerciseSearchResult,
  hqSearchHref,
  isSearchableHqQuery,
  normalizeHqSearchQuery,
} from "../hq-search-service";

describe("HQ search helpers", () => {
  it("normalizes query whitespace and enforces the minimum searchable length", () => {
    expect(normalizeHqSearchQuery("  chest   press  ")).toBe("chest press");
    expect(isSearchableHqQuery(" a ")).toBe(false);
    expect(isSearchableHqQuery(" ab ")).toBe(true);
  });

  it("maps result kinds to HQ routes", () => {
    expect(hqSearchHref("client", "client-1")).toBe("/hq/clients/client-1");
    expect(hqSearchHref("program", "program-1")).toBe("/hq/programs/program-1");
    expect(hqSearchHref("exercise", "exercise-1")).toBe("/hq/exercises/exercise-1");
  });

  it("allows only active shared or requesting-coach exercises", () => {
    expect(canCoachSeeExerciseSearchResult({
      scope: "system",
      createdBy: null,
      status: "active",
    }, "coach-1")).toBe(true);

    expect(canCoachSeeExerciseSearchResult({
      scope: "organization",
      createdBy: null,
      status: "active",
    }, "coach-1")).toBe(true);

    expect(canCoachSeeExerciseSearchResult({
      scope: "coach",
      createdBy: "coach-1",
      status: "active",
    }, "coach-1")).toBe(true);

    expect(canCoachSeeExerciseSearchResult({
      scope: "coach",
      createdBy: "coach-2",
      status: "active",
    }, "coach-1")).toBe(false);

    expect(canCoachSeeExerciseSearchResult({
      scope: "system",
      createdBy: null,
      status: "draft",
    }, "coach-1")).toBe(false);
  });
});
