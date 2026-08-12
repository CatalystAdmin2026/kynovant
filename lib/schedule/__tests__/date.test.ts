import { describe, expect, it } from "vitest";
import {
  buildMonthGrid,
  endOfWeek,
  isValidAppointmentRange,
  startOfWeek,
  toDateInputValue,
  toDateTimeLocalValue,
} from "../date";

describe("schedule date helpers", () => {
  it("formats date and local datetime input values", () => {
    const date = new Date(2026, 7, 11, 9, 5);
    expect(toDateInputValue(date)).toBe("2026-08-11");
    expect(toDateTimeLocalValue(date)).toBe("2026-08-11T09:05");
  });

  it("builds a full Sunday-start month grid", () => {
    const grid = buildMonthGrid(new Date(2026, 7, 11));
    expect(grid.length % 7).toBe(0);
    expect(grid[0].getDay()).toBe(0);
    expect(grid[grid.length - 1].getDay()).toBe(6);
    expect(toDateInputValue(grid[0])).toBe("2026-07-26");
    expect(toDateInputValue(grid[grid.length - 1])).toBe("2026-09-05");
  });

  it("calculates Sunday-to-Saturday week bounds", () => {
    const start = startOfWeek(new Date(2026, 7, 12, 14, 30));
    const end = endOfWeek(new Date(2026, 7, 12, 14, 30));
    expect(toDateTimeLocalValue(start)).toBe("2026-08-09T00:00");
    expect(toDateTimeLocalValue(end)).toBe("2026-08-15T23:59");
  });

  it("validates appointment ranges", () => {
    expect(isValidAppointmentRange(new Date("2026-08-11T10:00:00Z"), new Date("2026-08-11T11:00:00Z"))).toBe(true);
    expect(isValidAppointmentRange(new Date("2026-08-11T10:00:00Z"), new Date("2026-08-11T10:00:00Z"))).toBe(false);
    expect(isValidAppointmentRange(new Date("bad-date"), new Date("2026-08-11T10:00:00Z"))).toBe(false);
  });
});
