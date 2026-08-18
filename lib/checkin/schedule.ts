// Pure check-in schedule and calendar helpers. Weekday values use the
// existing Sunday-first convention: 0=Sunday through 6=Saturday.

export const WEEKDAY_LABELS = [
  "Sunday",
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
] as const;

export const WEEKDAY_SHORT_LABELS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"] as const;
export type Weekday = 0 | 1 | 2 | 3 | 4 | 5 | 6;

export function normalizeWeekdays(weekdays: number[]): Weekday[] {
  return [...new Set(weekdays.filter((day): day is Weekday => Number.isInteger(day) && day >= 0 && day <= 6))]
    .sort((a, b) => a - b);
}

export type WeekdayValidationResult =
  | { ok: true; weekdays: Weekday[] }
  | { ok: false; error: string };

// Validates a raw, caller-supplied weekday list at the write boundary
// (a server action) BEFORE any DB or auth work — a malformed request
// fails fast with a clear, specific message instead of being silently
// coerced. normalizeWeekdays' own dedupe/range-filter is a defensive
// SECOND layer for already-trusted internal callers (tests, seed
// scripts), not a substitute for this explicit, user-facing check.
// [] is valid — "no required schedule" is a real, intentional,
// explicitly-settable state, not an error. Pure — no DB/session
// dependency, so it's fully unit-testable on its own.
export function validateScheduleWeekdays(weekdays: unknown): WeekdayValidationResult {
  if (!Array.isArray(weekdays)) {
    return { ok: false, error: "Invalid schedule." };
  }
  const seen = new Set<number>();
  for (const day of weekdays) {
    if (typeof day !== "number" || !Number.isInteger(day) || day < 0 || day > 6) {
      return { ok: false, error: "Invalid weekday value." };
    }
    if (seen.has(day)) {
      return { ok: false, error: "Duplicate weekday in schedule." };
    }
    seen.add(day);
  }
  return { ok: true, weekdays: weekdays as Weekday[] };
}

export function describeSchedule(weekdays: number[]): string {
  const labels = normalizeWeekdays(weekdays)
    .sort((a, b) => (a === 0 ? 7 : a) - (b === 0 ? 7 : b))
    .map((day) => WEEKDAY_LABELS[day]);
  if (labels.length === 0) return "No required schedule";
  if (labels.length === 1) return labels[0];
  if (labels.length === 2) return `${labels[0]} & ${labels[1]}`;
  return `${labels.slice(0, -1).join(", ")} & ${labels[labels.length - 1]}`;
}

export function getDateInTimezone(date: Date, timezone: string): string {
  try {
    const parts = new Intl.DateTimeFormat("en-CA", {
      timeZone: timezone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).formatToParts(date);
    const year = parts.find((part) => part.type === "year")?.value;
    const month = parts.find((part) => part.type === "month")?.value;
    const day = parts.find((part) => part.type === "day")?.value;
    if (year && month && day) return `${year}-${month}-${day}`;
  } catch {
    // Invalid stored timezones use the existing UTC fallback.
  }
  return date.toISOString().split("T")[0];
}

export function getWeekdayInTimezone(date: Date, timezone: string): Weekday {
  try {
    const label = new Intl.DateTimeFormat("en-US", { timeZone: timezone, weekday: "short" }).format(date);
    const index = WEEKDAY_SHORT_LABELS.indexOf(label as (typeof WEEKDAY_SHORT_LABELS)[number]);
    if (index >= 0) return index as Weekday;
  } catch {
    // Invalid stored timezones use the existing UTC fallback.
  }
  return date.getUTCDay() as Weekday;
}

export interface ScheduleStatus {
  requiredWeekdays: Weekday[];
  hasSchedule: boolean;
  todayWeekday: Weekday;
  isDueToday: boolean;
  nextRequiredWeekday: Weekday | null;
  daysUntilNext: number | null;
}

export function getScheduleStatus(
  weekdays: number[],
  timezone: string,
  now: Date = new Date(),
): ScheduleStatus {
  const requiredWeekdays = normalizeWeekdays(weekdays);
  const todayWeekday = getWeekdayInTimezone(now, timezone);
  if (requiredWeekdays.length === 0) {
    return { requiredWeekdays, hasSchedule: false, todayWeekday, isDueToday: false, nextRequiredWeekday: null, daysUntilNext: null };
  }
  for (let offset = 0; offset < 7; offset += 1) {
    const candidate = ((todayWeekday + offset) % 7) as Weekday;
    if (requiredWeekdays.includes(candidate)) {
      return {
        requiredWeekdays,
        hasSchedule: true,
        todayWeekday,
        isDueToday: offset === 0,
        nextRequiredWeekday: candidate,
        daysUntilNext: offset,
      };
    }
  }
  return { requiredWeekdays, hasSchedule: true, todayWeekday, isDueToday: false, nextRequiredWeekday: null, daysUntilNext: null };
}

export interface RequiredDayState {
  weekday: Weekday;
  label: string;
  satisfied: boolean;
}

export function getRequiredDayStates(
  requiredWeekdays: number[],
  submittedWeekdays: number[],
): RequiredDayState[] {
  const submitted = new Set(normalizeWeekdays(submittedWeekdays));
  return normalizeWeekdays(requiredWeekdays).map((weekday) => ({
    weekday,
    label: WEEKDAY_LABELS[weekday],
    satisfied: submitted.has(weekday),
  }));
}

export function isWeekFullyCompliant(
  requiredWeekdays: number[],
  submittedWeekdays: number[],
): boolean {
  return getRequiredDayStates(requiredWeekdays, submittedWeekdays).every((day) => day.satisfied);
}
