import { describe, expect, it } from "vitest";
import {
  describeSchedule,
  getDateInTimezone,
  getRequiredDayStates,
  getScheduleStatus,
  getWeekdayInTimezone,
  isWeekFullyCompliant,
  normalizeWeekdays,
} from "../schedule";

describe("check-in schedule semantics", () => {
  it("normalizes and describes a multi-day schedule", () => {
    expect(normalizeWeekdays([3, 0, 3, 9])).toEqual([0, 3]);
    expect(describeSchedule([3, 0])).toBe("Wednesday & Sunday");
  });

  it("uses the client's local date across a UTC boundary", () => {
    const instant = new Date("2026-08-20T04:30:00Z");
    expect(getDateInTimezone(instant, "America/Chicago")).toBe("2026-08-19");
    expect(getWeekdayInTimezone(instant, "America/Chicago")).toBe(3);
  });

  it("fails safely for an invalid timezone", () => {
    const instant = new Date("2026-08-19T12:00:00Z");
    expect(getWeekdayInTimezone(instant, "Not/AZone")).toBe(instant.getUTCDay());
  });

  it("finds the next required day and handles no schedule", () => {
    const status = getScheduleStatus([0, 3], "America/Chicago", new Date("2026-08-20T18:00:00Z"));
    expect(status.nextRequiredWeekday).toBe(0);
    expect(status.daysUntilNext).toBe(3);
    expect(getScheduleStatus([], "America/Chicago").hasSchedule).toBe(false);
  });

  it("requires every scheduled day for full compliance", () => {
    expect(getRequiredDayStates([3, 0], [0])).toEqual([
      { weekday: 0, label: "Sunday", satisfied: true },
      { weekday: 3, label: "Wednesday", satisfied: false },
    ]);
    expect(isWeekFullyCompliant([3, 0], [0])).toBe(false);
    expect(isWeekFullyCompliant([3, 0], [3, 0])).toBe(true);
    expect(isWeekFullyCompliant([], [])).toBe(true);
  });
});
