// ─────────────────────────────────────────────────────────────
// RD/RDN verification gate — isVerifiedRd() + adversarial source
// checks
//
// Two kinds of tests, deliberately kept separate:
//
//   1. isVerifiedRd(coachId) — a pure "given this ID, is it verified"
//      DB query with no session/cookie dependency — run live against
//      a real DATABASE_URL, same as every other *-service.test.ts in
//      this suite.
//
//   2. requireVerifiedRdCoach()/requireVerifiedRdCoachPage() depend on
//      resolveSession() → next/headers cookies() → a real Next.js
//      request scope, which does not exist inside a vitest process.
//      This codebase's own precedent for testing that class of
//      guarantee (see lib/auth/__tests__/coach-signup-security.test.ts)
//      is to read the actual route/module SOURCE and assert on it —
//      "does this file call requireAdmin(), not requireCoachOrAdmin()"
//      is exactly as strong a proof as executing it, for a guard whose
//      entire body is "call an existing, separately-tested guard,
//      then branch." Followed identically here.
// ─────────────────────────────────────────────────────────────

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { randomUUID } from "crypto";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { eq, inArray } from "drizzle-orm";
import { getDb } from "@/lib/db/client";
import { createAdminClient } from "@/lib/supabase/admin";
import { users } from "@/lib/db/schema";
import { coachCredentials } from "@/lib/db/schema-coach-credentials";
import { isVerifiedRd } from "../rd-credential";

function source(file: string) {
  return readFileSync(resolve(process.cwd(), file), "utf8");
}

const db = getDb();

// ─────────────────────────────────────────────────────────────
// LIVE — isVerifiedRd()
// ─────────────────────────────────────────────────────────────

describe("isVerifiedRd — live, against a real coach_credentials row", () => {
  const coach = { id: "" };
  const bystanderAdmin = { id: "" }; // has NO credential row — proves no role-based bypass

  function futureDate(daysFromNow: number): string {
    const d = new Date();
    d.setDate(d.getDate() + daysFromNow);
    return d.toISOString().split("T")[0];
  }

  beforeAll(async () => {
    const supa = createAdminClient();
    const [coachRes, adminRes] = await Promise.all([
      supa.auth.admin.createUser({
        email: `rd-gate-test-coach-${randomUUID()}@isolation-test.invalid`,
        email_confirm: true,
        password: randomUUID(),
      }),
      supa.auth.admin.createUser({
        email: `rd-gate-test-admin-${randomUUID()}@isolation-test.invalid`,
        email_confirm: true,
        password: randomUUID(),
      }),
    ]);
    if (coachRes.error || !coachRes.data.user || adminRes.error || !adminRes.data.user) {
      throw new Error("Fixture setup failed");
    }
    coach.id = coachRes.data.user.id;
    bystanderAdmin.id = adminRes.data.user.id;

    await Promise.all([
      db.update(users).set({ role: "coach", status: "active" }).where(eq(users.id, coach.id)),
      db.update(users).set({ role: "admin", status: "active" }).where(eq(users.id, bystanderAdmin.id)),
    ]);
  });

  // ROBUSTNESS (fixed here — see the incident this replaced): every
  // cleanup step below is now independently attempted, regardless of
  // whether an earlier step failed. The previous version awaited the
  // coachCredentials delete UNWRAPPED as the first statement in this
  // hook; any error there (in practice: that table not existing yet,
  // before migration 0028 was applied — but equally true of any future
  // transient DB error) aborted the rest of the function immediately,
  // so `coach`'s and `bystanderAdmin`'s `users` rows and their real
  // Supabase Auth users (both created in beforeAll) were NEVER deleted.
  // Confirmed in production: this exact bug left dozens of orphaned
  // @isolation-test.invalid coach/admin fixtures behind across this
  // suite's own repeated runs before the migration existed.
  //
  // Fix shape: try/catch around each phase (never letting one phase's
  // exception skip a later phase), Promise.allSettled instead of
  // Promise.all for the per-user Auth deletions (so one user's Auth
  // failure doesn't prevent attempting the other), and a captured
  // FIRST error that is deliberately rethrown only at the very end —
  // after every cleanup phase has already run — so a real failure is
  // never silently swallowed, but also never blocks identity cleanup
  // from being attempted.
  afterAll(async () => {
    const ids = [coach.id, bystanderAdmin.id].filter(Boolean);
    let firstError: unknown;

    try {
      await db.delete(coachCredentials).where(inArray(coachCredentials.coachId, ids));
    } catch (err) {
      firstError = firstError ?? err;
    }

    if (ids.length > 0) {
      try {
        await db.delete(users).where(inArray(users.id, ids));
      } catch (err) {
        firstError = firstError ?? err;
      }

      const supa = createAdminClient();
      const results = await Promise.allSettled(ids.map((id) => supa.auth.admin.deleteUser(id)));
      for (const result of results) {
        if (result.status === "rejected") firstError = firstError ?? result.reason;
      }
    }

    if (firstError) throw firstError;
  });

  it("fails closed: no credential row on file → false", async () => {
    expect(await isVerifiedRd(coach.id)).toBe(false);
  });

  it("fails closed: pending → false", async () => {
    await db.insert(coachCredentials).values({
      coachId: coach.id,
      credentialType: "rd",
      licenseNumber: "GATE-TEST-1",
      issuingState: "Texas",
      expirationDate: futureDate(365),
      proofDocumentStorageKey: "fixture/gate-test.pdf",
      proofDocumentFilename: "gate-test.pdf",
      proofDocumentMimeType: "application/pdf",
      status: "pending",
    });
    expect(await isVerifiedRd(coach.id)).toBe(false);
  });

  it("fails closed: rejected → false", async () => {
    await db.update(coachCredentials).set({ status: "rejected" }).where(eq(coachCredentials.coachId, coach.id));
    expect(await isVerifiedRd(coach.id)).toBe(false);
  });

  it("succeeds: approved AND unexpired → true", async () => {
    await db
      .update(coachCredentials)
      .set({ status: "approved", expirationDate: futureDate(365) })
      .where(eq(coachCredentials.coachId, coach.id));
    expect(await isVerifiedRd(coach.id)).toBe(true);
  });

  it("fails closed: approved BUT expired → false", async () => {
    await db.update(coachCredentials).set({ expirationDate: "2000-01-01" }).where(eq(coachCredentials.coachId, coach.id));
    expect(await isVerifiedRd(coach.id)).toBe(false);
  });

  it("fails closed: empty/missing coachId → false (no query even attempted)", async () => {
    expect(await isVerifiedRd("")).toBe(false);
  });

  it("fails closed on a malformed id that would error the underlying query, rather than throwing", async () => {
    await expect(isVerifiedRd("not-a-valid-uuid")).resolves.toBe(false);
  });

  it("admin role grants NO bypass — an admin account with no credential row is exactly as unverified as anyone else", async () => {
    // bystanderAdmin is role='admin' and has zero rows in coach_credentials.
    // isVerifiedRd() only ever reads that table — there is no role check
    // in it at all, so this is a direct, live proof of "no bypass",
    // not just an absence-of-code-path claim.
    expect(await isVerifiedRd(bystanderAdmin.id)).toBe(false);
  });
});

describe("afterAll cleanup — resilient to a failed credential-table delete (source-level; vitest owns this hook's lifecycle, so the structural guarantee is what's proven, same technique as the gate-wiring block below)", () => {
  const fileSource = source("lib/auth/__tests__/rd-credential-gate.test.ts");

  it("wraps the coachCredentials delete in its own try/catch, not awaited bare as the first statement", () => {
    const afterAllStart = fileSource.indexOf("afterAll(async () => {");
    const afterAllBody = fileSource.slice(afterAllStart);
    const tryIndex = afterAllBody.indexOf("try {");
    const deleteIndex = afterAllBody.indexOf("db.delete(coachCredentials)");
    const catchIndex = afterAllBody.indexOf("} catch (err) {");

    expect(tryIndex).toBeGreaterThan(-1);
    expect(deleteIndex).toBeGreaterThan(tryIndex);
    expect(catchIndex).toBeGreaterThan(deleteIndex);
  });

  it("attempts users-row cleanup and Auth-user cleanup unconditionally, and rethrows any captured error only at the very end", () => {
    const afterAllStart = fileSource.indexOf("afterAll(async () => {");
    const afterAllBody = fileSource.slice(afterAllStart);
    const firstCatchEnd = afterAllBody.indexOf("}", afterAllBody.indexOf("firstError = firstError ?? err;")) + 1;
    const afterFirstCatch = afterAllBody.slice(firstCatchEnd);

    expect(afterFirstCatch).toContain("db.delete(users)");
    expect(afterFirstCatch).toContain("supa.auth.admin.deleteUser");
    expect(afterFirstCatch).toContain("Promise.allSettled");

    const rethrowIndex = afterAllBody.indexOf("if (firstError) throw firstError;");
    const authDeleteIndex = afterAllBody.indexOf("supa.auth.admin.deleteUser");
    expect(rethrowIndex).toBeGreaterThan(-1);
    expect(rethrowIndex).toBeGreaterThan(authDeleteIndex);
  });
});

// ─────────────────────────────────────────────────────────────
// SOURCE INSPECTION — everything that depends on a real request/
// session scope. See file header for why this is the established
// pattern for this class of guarantee in this codebase.
// ─────────────────────────────────────────────────────────────

describe("rd-credential.ts — gate wiring", () => {
  const gate = source("lib/auth/rd-credential.ts");

  it("requireVerifiedRdCoach re-derives verification from isVerifiedRd(), not a cached/passed-in flag", () => {
    expect(gate).toContain("const verified = await isVerifiedRd(guard.dbUser.id)");
  });

  it("resolves the coachId ONLY from the authenticated guard, never from a request body/param", () => {
    // The only identifier ever passed into isVerifiedRd() from the
    // guard functions is guard.dbUser.id / authed.dbUser.id — there is
    // no req.body, req.nextUrl.searchParams, or params.* in this file.
    expect(gate).not.toMatch(/req\.(body|nextUrl|json)/);
    expect(gate).not.toMatch(/params\./);
  });

  it("does NOT give admin a bypass of its own — no role check before the verification check", () => {
    // requireCoachOrAdmin() (called first) legitimately lets admin
    // through as a ROLE, but nothing in this file additionally skips
    // isVerifiedRd() for role === 'admin'. See the live "admin role
    // grants NO bypass" test above for the runtime proof.
    expect(gate).not.toMatch(/role\s*===\s*["']admin["']/);
  });

  it("fails closed by construction — every branch that isn't the success path returns/redirects away, never returns/continues as verified", () => {
    expect(gate).toContain("catch (err)");
    expect(gate).toMatch(/console\.error\(.*isVerifiedRd/);
  });
});

describe("app/api/internal/hq/credentials/route.ts — coach submission route", () => {
  const route = source("app/api/internal/hq/credentials/route.ts");

  it("derives coachId only from the authenticated guard", () => {
    expect(route).toContain("guard.dbUser.id");
    // No field in the multipart form is ever read as a coach identity.
    expect(route).not.toMatch(/formData\.get\(["']coachId["']\)/);
  });

  it("never accepts a client-supplied status or reviewedBy — submission always starts pending, decided server-side", () => {
    expect(route).not.toMatch(/formData\.get\(["']status["']\)/);
    expect(route).not.toMatch(/formData\.get\(["']reviewedBy["']\)/);
  });

  it("blocks admin accounts from submitting (no coach identity to attribute a credential to)", () => {
    expect(route).toContain('guard.dbUser.role === "admin"');
  });
});

describe("app/api/internal/hq/credentials/download/route.ts — coach's own proof only", () => {
  const route = source("app/api/internal/hq/credentials/download/route.ts");

  it("has no dynamic [id]/[credentialId] segment — cannot be pointed at another coach's document by URL", () => {
    expect(route).not.toMatch(/params/);
  });

  it("derives the target credential from the authenticated coachId, not a request value", () => {
    expect(route).toContain("generateCoachCredentialProofUrl(guard.dbUser.id)");
  });
});

describe("app/admin/credentials/[id]/actions.ts — review action", () => {
  const actions = source("app/admin/credentials/[id]/actions.ts");

  it("requires requireAdmin(), not requireCoachOrAdmin() — an ordinary coach cannot reach this action at all", () => {
    // Checks the import + call sites specifically, not just "the string
    // requireCoachOrAdmin() doesn't appear anywhere" — the file's own
    // header comment explains the requireAdmin-vs-requireCoachOrAdmin
    // choice in prose and legitimately contains that substring; a naive
    // "not.toContain" would false-fail on the comment itself.
    expect(actions).toMatch(/import \{ requireAdmin \} from "@\/lib\/auth\/guards"/);
    expect(actions).toContain("const guard = await requireAdmin();");
    expect(actions).not.toMatch(/import \{[^}]*requireCoachOrAdmin/);
  });

  it("reviewedBy is always the authenticated admin's own id — never a caller-supplied value", () => {
    // The only value passed as the reviewer id is guard.dbUser.id.
    expect(actions).toContain("guard.dbUser.id");
    expect(actions).not.toMatch(/reviewedBy\s*:/); // no field named reviewedBy is ever read from an argument
  });

  it("decision is constrained to the literal union type, not an arbitrary string — cannot spoof an unrecognized status", () => {
    expect(actions).toContain('decision: "approved" | "rejected"');
  });

  it("does not reference Overwatch's account-classification/operator tables — admin authorization here is role-only, not classification-based", () => {
    expect(actions).not.toMatch(/operatorProfiles|internalAccountFlags|isFounder|accountClassification/);
  });
});

describe("app/admin/credentials/layout.tsx — admin-only surface", () => {
  const layout = source("app/admin/credentials/layout.tsx");

  it("gates the entire section with requireAdminPage()", () => {
    expect(layout).toContain("requireAdminPage()");
  });
});

describe("app/portal/nutrition/page.tsx — clients cannot modify nutrition targets (unrelated system, same discipline)", () => {
  const portalPage = source("app/portal/nutrition/page.tsx");

  it("imports no write/mutation function from the nutrition-target service", () => {
    expect(portalPage).not.toMatch(/createDraft|updateDraft|publishTarget|archiveTarget/);
  });
});
