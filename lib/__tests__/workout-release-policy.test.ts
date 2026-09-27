import { describe, expect, it } from "vitest";
import {
  canClientAccessScheduledWorkout,
  getSundayReleaseWindow,
  isWorkoutReleased,
} from "@/lib/workout-release-policy";
import { getDateInTimezone } from "@/lib/checkin/schedule";

describe("weekly workout release policy", () => {
  it("releases the full Sunday-Saturday window at the Sunday boundary", () => {
    expect(getSundayReleaseWindow("2026-09-27")).toEqual({
      startDate: "2026-09-27",
      endDate: "2026-10-03",
    });
    expect(isWorkoutReleased("weekly", "2026-09-27", "2026-09-27")).toBe(true);
    expect(isWorkoutReleased("weekly", "2026-10-03", "2026-09-27")).toBe(true);
  });

  it("advances at midnight Sunday in the authoritative client timezone", () => {
    const timezone = "America/Chicago";
    const beforeBoundary = getDateInTimezone(new Date("2026-09-27T04:59:59Z"), timezone);
    const atBoundary = getDateInTimezone(new Date("2026-09-27T05:00:00Z"), timezone);

    expect(beforeBoundary).toBe("2026-09-26");
    expect(atBoundary).toBe("2026-09-27");
    expect(isWorkoutReleased("weekly", "2026-10-03", beforeBoundary)).toBe(false);
    expect(isWorkoutReleased("weekly", "2026-10-03", atBoundary)).toBe(true);
  });

  it("keeps that same window released through Saturday", () => {
    expect(isWorkoutReleased("weekly", "2026-09-27", "2026-10-03")).toBe(true);
    expect(isWorkoutReleased("weekly", "2026-10-03", "2026-10-03")).toBe(true);
  });

  it("does not release next Sunday while it is Saturday", () => {
    expect(isWorkoutReleased("weekly", "2026-10-04", "2026-10-03")).toBe(false);
  });

  it("releases the next Sunday-Saturday window once Sunday begins", () => {
    expect(isWorkoutReleased("weekly", "2026-10-04", "2026-10-04")).toBe(true);
    expect(isWorkoutReleased("weekly", "2026-10-10", "2026-10-04")).toBe(true);
    expect(isWorkoutReleased("weekly", "2026-10-03", "2026-10-04")).toBe(false);
  });

  it("handles month boundaries", () => {
    expect(getSundayReleaseWindow("2026-02-01")).toEqual({
      startDate: "2026-02-01",
      endDate: "2026-02-07",
    });
    expect(isWorkoutReleased("weekly", "2026-03-01", "2026-02-28")).toBe(false);
  });

  it("handles year boundaries", () => {
    expect(getSundayReleaseWindow("2027-01-01")).toEqual({
      startDate: "2026-12-27",
      endDate: "2027-01-02",
    });
    expect(isWorkoutReleased("weekly", "2027-01-02", "2027-01-01")).toBe(true);
    expect(isWorkoutReleased("weekly", "2027-01-03", "2027-01-01")).toBe(false);
  });
});

describe("daily compatibility and access composition", () => {
  it("preserves Daily as same-calendar-date access only", () => {
    expect(isWorkoutReleased("daily", "2026-09-27", "2026-09-27")).toBe(true);
    expect(isWorkoutReleased("daily", "2026-09-28", "2026-09-27")).toBe(false);
  });

  it("denies direct access to an unreleased workout", () => {
    expect(
      canClientAccessScheduledWorkout({
        policy: "weekly",
        scheduledDate: "2026-10-04",
        todayDate: "2026-10-03",
        assignmentClientId: "client-a",
        requestingClientId: "client-a",
      }),
    ).toBe(false);
  });

  it("allows direct access to a released weekly workout when ownership matches", () => {
    expect(
      canClientAccessScheduledWorkout({
        policy: "weekly",
        scheduledDate: "2026-10-03",
        todayDate: "2026-09-28",
        assignmentClientId: "client-a",
        requestingClientId: "client-a",
      }),
    ).toBe(true);
  });

  it("never lets release policy bypass client isolation", () => {
    expect(
      canClientAccessScheduledWorkout({
        policy: "weekly",
        scheduledDate: "2026-10-03",
        todayDate: "2026-09-28",
        assignmentClientId: "client-b",
        requestingClientId: "client-a",
      }),
    ).toBe(false);
  });

  it("rejects malformed direct-access dates", () => {
    expect(isWorkoutReleased("weekly", "2026-09-28x", "2026-09-28")).toBe(false);
    expect(isWorkoutReleased("weekly", "2026-02-30", "2026-02-28")).toBe(false);
  });
});
