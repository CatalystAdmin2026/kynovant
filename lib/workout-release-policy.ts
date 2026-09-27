export const WORKOUT_RELEASE_POLICIES = ["daily", "weekly"] as const;

export type WorkoutReleasePolicy = (typeof WORKOUT_RELEASE_POLICIES)[number];

export interface ReleaseWindow {
  startDate: string;
  endDate: string;
}

function parseDateOnly(value: string): Date {
  return new Date(`${value}T00:00:00Z`);
}

function isValidDateOnly(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const parsed = parseDateOnly(value);
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
}

export function addCalendarDays(value: string, days: number): string {
  const date = parseDateOnly(value);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

export function getSundayReleaseWindow(todayDate: string): ReleaseWindow {
  const today = parseDateOnly(todayDate);
  const startDate = addCalendarDays(todayDate, -today.getUTCDay());
  return { startDate, endDate: addCalendarDays(startDate, 6) };
}

/**
 * Daily intentionally means exactly the legacy rule: only the workout
 * scheduled for the client's current calendar date is released. Weekly
 * expands that boundary to the Sunday-Saturday window containing today.
 */
export function isWorkoutReleased(
  policy: WorkoutReleasePolicy,
  scheduledDate: string,
  todayDate: string,
): boolean {
  if (!isValidDateOnly(scheduledDate) || !isValidDateOnly(todayDate)) return false;
  if (policy === "daily") return scheduledDate === todayDate;
  const window = getSundayReleaseWindow(todayDate);
  return scheduledDate >= window.startDate && scheduledDate <= window.endDate;
}

/** Release never substitutes for ownership; both conditions must pass. */
export function canClientAccessScheduledWorkout(input: {
  policy: WorkoutReleasePolicy;
  scheduledDate: string;
  todayDate: string;
  assignmentClientId: string;
  requestingClientId: string;
}): boolean {
  return (
    input.assignmentClientId === input.requestingClientId &&
    isWorkoutReleased(input.policy, input.scheduledDate, input.todayDate)
  );
}
