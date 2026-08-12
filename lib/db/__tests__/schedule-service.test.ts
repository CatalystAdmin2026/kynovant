import { describe, expect, it } from "vitest";
import {
  parseAppointmentInput,
  parseAppointmentPatch,
  validateAppointmentRange,
} from "../schedule-service";

describe("schedule service helpers", () => {
  it("normalizes appointment creation input", () => {
    const input = parseAppointmentInput({
      clientId: " client-1 ",
      title: " Strategy call ",
      category: "training",
      status: "completed",
      startsAt: "2026-08-11T15:00:00.000Z",
      endsAt: "2026-08-11T16:00:00.000Z",
      privateNotes: " Bring plan notes ",
    });

    expect(input.clientId).toBe("client-1");
    expect(input.title).toBe("Strategy call");
    expect(input.category).toBe("training");
    expect(input.status).toBe("completed");
    expect(input.privateNotes).toBe("Bring plan notes");
    expect(input.startsAt.toISOString()).toBe("2026-08-11T15:00:00.000Z");
  });

  it("defaults unsupported category and status values", () => {
    const input = parseAppointmentInput({
      category: "external_sync",
      status: "tentative",
      startsAt: "2026-08-11T15:00:00.000Z",
      endsAt: "2026-08-11T16:00:00.000Z",
    });

    expect(input.category).toBe("consultation");
    expect(input.status).toBe("scheduled");
  });

  it("keeps omitted patch fields undefined", () => {
    const patch = parseAppointmentPatch({ title: "" });
    expect(patch.title).toBeNull();
    expect(patch.status).toBeUndefined();
    expect(patch.startsAt).toBeUndefined();
  });

  it("rejects invalid appointment ranges", () => {
    expect(validateAppointmentRange(
      new Date("2026-08-11T16:00:00.000Z"),
      new Date("2026-08-11T15:00:00.000Z"),
    )).toBe("Appointment end time must be after the start time.");
  });
});
