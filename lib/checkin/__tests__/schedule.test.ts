import { describe, expect, it } from "vitest";
import {
  describeSchedule,
  getDateInTimezone,
  getRequiredDayStates,
  getScheduleStatus,
  getWeekdayInTimezone,
  isWeekFullyCompliant,
  normalizeWeekdays,
  validateScheduleWeekdays,
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

// ─────────────────────────────────────────────────────────────
// validateScheduleWeekdays — the Coach HQ Check-In Schedule action's
// write-boundary gate (app/hq/clients/[clientId]/actions.ts's
// setCheckInScheduleAction calls this before any DB/auth work). Pure,
// so every input case is a real behavior test, not a source-string
// assertion — and none of it depends on drizzle/0031 or 0032 being
// applied, since it never touches the database.
// ─────────────────────────────────────────────────────────────

describe("validateScheduleWeekdays — Coach HQ schedule action input gate", () => {
  it("accepts a valid multi-day schedule, preserving input order (caller normalizes for display)", () => {
    const result = validateScheduleWeekdays([3, 0]);
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.weekdays).toEqual([3, 0]);
  });

  it("[] is accepted — 'no required schedule' is an intentional, valid state, not an error", () => {
    const result = validateScheduleWeekdays([]);
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.weekdays).toEqual([]);
  });

  it("rejects a non-array payload", () => {
    expect(validateScheduleWeekdays(null).ok).toBe(false);
    expect(validateScheduleWeekdays(undefined).ok).toBe(false);
    expect(validateScheduleWeekdays("Sunday").ok).toBe(false);
    expect(validateScheduleWeekdays({ 0: 0 }).ok).toBe(false);
  });

  it("rejects weekday values outside 0-6", () => {
    expect(validateScheduleWeekdays([7]).ok).toBe(false);
    expect(validateScheduleWeekdays([-1]).ok).toBe(false);
    expect(validateScheduleWeekdays([0, 3, 9]).ok).toBe(false);
  });

  it("rejects non-integer weekday values", () => {
    expect(validateScheduleWeekdays([2.5]).ok).toBe(false);
    expect(validateScheduleWeekdays([NaN]).ok).toBe(false);
    expect(validateScheduleWeekdays(["3"] as unknown as number[]).ok).toBe(false);
  });

  it("rejects a duplicate weekday rather than silently deduping it — the action layer surfaces a clear error instead of coercing bad input", () => {
    const result = validateScheduleWeekdays([0, 3, 0]);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toMatch(/duplicate/i);
  });

  it("a single malformed entry rejects the whole payload — no partial application of a half-valid schedule", () => {
    const result = validateScheduleWeekdays([0, 3, 8]);
    expect(result.ok).toBe(false);
  });
});
