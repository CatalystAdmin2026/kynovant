import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

function source(file: string) {
  return readFileSync(resolve(process.cwd(), file), "utf8");
}

describe("production security release gates", () => {
  it("keeps the legacy admin route tree server-side admin-only", () => {
    const layout = source("app/admin/layout.tsx");

    expect(layout).toContain("requireAdminPage");
    expect(layout).not.toContain("requireCoachOrAdminPage");
  });

  it("does not ship a client-side admin password gate", () => {
    const gate = source("components/AdminGate.tsx");

    expect(gate).not.toContain("ADMIN_PASSWORD");
    expect(gate).not.toContain("Catalyst2026");
    expect(gate).not.toContain("sessionStorage");
    expect(gate).not.toContain("use client");
  });

  it.each([
    "app/api/calendly/events/route.ts",
    "app/api/sheets/[sheet]/route.ts",
    "app/api/docusign/debug-template/route.ts",
    "app/api/docusign/send-agreement/route.ts",
  ])("%s requires an admin session before doing external data or action work", (file) => {
    const route = source(file);

    expect(route).toContain("requireAdmin");
    expect(route).toContain("const guard = await requireAdmin()");
    expect(route).toContain("if (!guard.ok) return guard.response");
  });

  it("fails closed when the DocuSign webhook signing secret is missing", () => {
    const route = source("app/api/docusign/webhook/route.ts");

    expect(route).toContain("DOCUSIGN_WEBHOOK_SECRET is not configured");
    expect(route).toContain('status: 503');
    expect(route).not.toContain("accepting unauthenticated request");
  });

  it("object-authorizes client program detail reads and assignment updates", () => {
    const route = source("app/api/internal/client-programs/[id]/route.ts");

    expect(route).toContain("authorizeCoachClientAccess");
    expect(route).toContain("const deny = await authorizeCoachClientAccess(guard.dbUser, clientId)");
    expect(route).toContain("select({ clientId: clientPrograms.clientId })");
    expect(route).toContain("authorizeCoachClientAccess(guard.dbUser, assignmentOwner.clientId)");
  });

  it("restricts Exercise Library search to shared or coach-owned rows for coaches", () => {
    const service = source("lib/db/exercise-service.ts");
    const collectionRoute = source("app/api/internal/exercises/route.ts");
    const searchRoute = source("app/api/internal/exercises/search/route.ts");

    expect(service).toContain('eq(exercises.scope, "system")');
    expect(service).toContain('eq(exercises.scope, "organization")');
    expect(service).toContain('and(eq(exercises.scope, "coach"), eq(exercises.createdBy, coachId))');
    expect(collectionRoute).toContain('guard.dbUser.role === "admin" ? undefined : guard.dbUser.id');
    expect(searchRoute).toContain('guard.dbUser.role === "admin" ? undefined : guard.dbUser.id');
  });

  it("object-authorizes Exercise Library direct mutations and private-row reads", () => {
    const guards = source("lib/auth/guards.ts");

    expect(guards).toContain("authorizeExerciseView");
    expect(guards).toContain("authorizeExerciseMutation");
    expect(guards).toContain('eq(exercises.scope, "coach")');
    expect(guards).toContain("eq(exercises.createdBy, dbUser.id)");

    for (const file of [
      "app/api/internal/exercises/[id]/route.ts",
      "app/api/internal/exercises/[id]/muscles/route.ts",
      "app/api/internal/exercises/[id]/muscles/[muscleId]/route.ts",
      "app/api/internal/exercises/[id]/cues/route.ts",
      "app/api/internal/exercises/[id]/cues/[cueId]/route.ts",
      "app/api/internal/exercises/[id]/relations/route.ts",
      "app/api/internal/exercises/[id]/relations/[relationId]/route.ts",
    ]) {
      expect(source(file), `${file} mutation guard`).toContain("authorizeExerciseMutation");
    }

    for (const file of [
      "app/api/internal/exercises/[id]/muscles/route.ts",
      "app/api/internal/exercises/[id]/cues/route.ts",
      "app/api/internal/exercises/[id]/relations/route.ts",
      "app/api/internal/exercises/[id]/favorite/route.ts",
      "app/api/internal/exercises/[id]/override/route.ts",
    ]) {
      expect(source(file), `${file} view guard`).toContain("authorizeExerciseView");
    }
  });
});
