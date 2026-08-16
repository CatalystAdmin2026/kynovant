// ─────────────────────────────────────────────────────────────
// Complimentary Coach Access — adversarial source-inspection suite
//
// The two new routes (app/api/internal/overwatch/coaches/[coachId]/
// complimentary/{grant,revoke}/route.ts) depend on a real Next.js
// request/cookie scope (requireOverwatchAdmin() → resolveSession() →
// next/headers cookies()) that does not exist inside a vitest process
// — the same constraint documented in
// overwatch-invite-coach-security.test.ts, and the same established
// precedent this codebase uses for it: read the actual source and
// assert on it. The DB-backed decision logic itself (grant/revoke
// behavior, precedence over coach_subscriptions, expiry) is proven
// live in lib/db/__tests__/coach-complimentary-access.test.ts.
// ─────────────────────────────────────────────────────────────

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

function source(file: string) {
  return readFileSync(resolve(process.cwd(), file), "utf8");
}

const GRANT_ROUTE = "app/api/internal/overwatch/coaches/[coachId]/complimentary/grant/route.ts";
const REVOKE_ROUTE = "app/api/internal/overwatch/coaches/[coachId]/complimentary/revoke/route.ts";
const SERVICE = "lib/db/coach-complimentary-access-service.ts";
const ENTITLEMENT = "lib/db/coach-subscription-service.ts";

describe.each([
  ["grant", GRANT_ROUTE],
  ["revoke", REVOKE_ROUTE],
])("%s route — authorization", (_label, path) => {
  const route = source(path);

  it("guards POST with requireOverwatchAdmin() — active-admin-only, not requireAdmin() or requireCoachOrAdmin()", () => {
    expect(route).toMatch(/import \{ requireOverwatchAdmin \} from "@\/lib\/auth\/guards"/);
    expect(route).toContain("const guard = await requireOverwatchAdmin();");
    expect(route).not.toMatch(/import \{[^}]*\brequireCoachOrAdmin\b/);
    expect(route).not.toMatch(/import \{[^}]*\brequireAdmin\b(?!Config)/);
  });

  it("returns the guard's own response immediately on failure — no fallthrough", () => {
    expect(route).toContain("if (!guard.ok) return guard.response;");
  });

  it("derives the acting admin's identity ONLY from the authenticated guard, never from request input", () => {
    expect(route).toContain("guard.dbUser.id");
    expect(route).not.toMatch(/body\.(grantedBy|revokedBy|adminId|actorId)/);
  });

  it("the target coachId comes from the URL path param, not the request body — cross-coach mutation via body is structurally impossible", () => {
    expect(route).toMatch(/const \{ coachId \} = \(await params\) as/);
    expect(route).not.toMatch(/body\.coachId/);
  });
});

describe("grant route — target validation and input bounds", () => {
  const route = source(GRANT_ROUTE);

  it("looks up the target user server-side and refuses to grant to a non-coach role", () => {
    expect(route).toContain('target.role !== "coach"');
    expect(route).toContain('status: 400');
  });

  it("404s on a nonexistent target rather than silently no-op'ing", () => {
    expect(route).toContain("if (!target) {");
    expect(route).toMatch(/status: 404/);
  });

  it("rejects an expiresAt that is already in the past — cannot grant something already expired", () => {
    expect(route).toContain("parsed.getTime() <= Date.now()");
  });

  it("bounds the reason field length rather than accepting unbounded text", () => {
    expect(route).toContain("MAX_REASON_LENGTH");
  });
});

describe("revoke route — fails closed on a coach with no active grant", () => {
  const route = source(REVOKE_ROUTE);

  it("surfaces revokeComplimentaryAccess's own ok:false without pretending success", () => {
    expect(route).toContain("if (!result.ok) {");
    expect(route).toMatch(/status: 409/);
  });
});

describe("coach-complimentary-access-service.ts — grant/revoke never touch coach_subscriptions or anything Stripe-shaped", () => {
  const service = source(SERVICE);

  it("imports only coachComplimentaryAccess from schema-billing — not coachSubscriptions", () => {
    expect(service).toMatch(/import \{[^}]*coachComplimentaryAccess[^}]*\} from "\.\/schema-billing"/);
    expect(service).not.toMatch(/coachSubscriptions/);
  });

  it("never references Stripe directly — this is a pure entitlement-grant table, not a billing integration", () => {
    expect(service).not.toMatch(/stripe|Stripe/);
  });

  it("grantComplimentaryAccess requires grantedBy as an explicit argument — it is never defaulted or inferred", () => {
    expect(service).toMatch(/grantedBy: string;/);
  });
});

describe("coach-subscription-service.ts — complimentary precedence is checked first and short-circuits", () => {
  const entitlement = source(ENTITLEMENT);

  it("getCoachEntitlement calls getActiveComplimentaryAccess before querying coach_subscriptions", () => {
    const fnStart = entitlement.indexOf("export async function getCoachEntitlement(");
    const complimentaryCallIndex = entitlement.indexOf("getActiveComplimentaryAccess(coachId)", fnStart);
    const subscriptionQueryIndex = entitlement.indexOf("from(coachSubscriptions)", fnStart);
    expect(fnStart).toBeGreaterThan(-1);
    expect(complimentaryCallIndex).toBeGreaterThan(fnStart);
    expect(subscriptionQueryIndex).toBeGreaterThan(complimentaryCallIndex);
  });

  it("returns immediately (short-circuits) when complimentary access is active — coach_subscriptions is never reached for that request", () => {
    const fnStart = entitlement.indexOf("export async function getCoachEntitlement(");
    const complimentaryBlock = entitlement.slice(
      entitlement.indexOf("if (complimentary) {", fnStart),
      entitlement.indexOf("const db = getDb();", fnStart),
    );
    expect(complimentaryBlock).toContain('status: "complimentary", allowed: true');
    expect(complimentaryBlock).toContain("return");
  });
});
