import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const source = (path: string) => readFileSync(resolve(process.cwd(), path), "utf8");
const schema = source("lib/db/schema-program.ts");
const migration = source("drizzle/0040_workout_release_policy.sql");
const sessionService = source("lib/db/workout-session-service.ts");
const coachAction = source("app/hq/clients/[clientId]/actions.ts");
const coachControl = source("components/hq/workspace/WorkoutReleaseScheduleControl.tsx");
const portalRoute = source("app/api/portal/today-workout/route.ts");

describe("workout release persistence", () => {
  it("defaults schema and migration to Daily for existing and new records", () => {
    expect(schema).toMatch(/workoutReleasePolicyEnum\("workout_release_policy"\)[\s\S]*?\.default\("daily"\)/);
    expect(migration).toContain("DEFAULT 'daily' NOT NULL");
  });

  it("supports both Weekly → Daily and Daily → Weekly writes", () => {
    expect(coachAction).toContain("WORKOUT_RELEASE_POLICIES.includes(data.policy)");
    expect(coachAction).toContain("workoutReleasePolicy: data.policy");
  });

  it("keeps coach writes behind ownership and assignment-client matching", () => {
    expect(coachAction).toContain("assertCoachOwnsClientAction(data.clientId)");
    expect(coachAction).toContain("eq(clientPrograms.id, data.assignmentId)");
    expect(coachAction).toContain("eq(clientPrograms.clientId, data.clientId)");
    expect(coachAction).toContain('eq(clientPrograms.status, "active")');
  });
});

describe("authoritative workout session boundary", () => {
  it("resolves Weekly requests by requested schedule date before insert", () => {
    expect(sessionService).toContain("getReleasedWorkoutByDate(input.clientId, input.scheduledDate, tx)");
    expect(sessionService).toContain("The requested workout is not currently released for this client.");
  });

  it("retains the legacy getTodayWorkout authorization path for Daily", () => {
    expect(sessionService).toContain("await getTodayWorkout(input.clientId, tx)");
  });

  it("uses the release-aware portal read path", () => {
    expect(portalRoute).toContain("getPortalWorkoutResult(guard.authUser.id)");
  });
});

describe("coach control", () => {
  it("offers exactly Daily and Weekly with the required explanation", () => {
    expect(coachControl).toContain('value: "daily"');
    expect(coachControl).toContain('value: "weekly"');
    expect(coachControl).toContain("Clients access workouts according to the current daily release behavior.");
    expect(coachControl).toContain("Every Sunday, clients can access all workouts scheduled through Saturday.");
    expect(coachControl).not.toContain("Full Program");
  });
});
