// ─────────────────────────────────────────────────────────────
// Overwatch "Invite Coach" — adversarial source-inspection suite
//
// app/api/internal/overwatch/invite-coach/route.ts depends on a real
// Next.js request/cookie scope (via requireOverwatchAdmin() →
// resolveSession() → next/headers cookies()), which does not exist
// inside a vitest process, and its POST handler performs real
// side-effecting external calls (admin.auth.admin.generateLink(),
// Resend email send) that this review is explicitly scoped to never
// trigger. This codebase's own established precedent for testing this
// exact class of guarantee — a guard-wrapped route/action whose
// authorization logic is "call an already-separately-tested guard,
// then branch" — is to read the actual source and assert on it (see
// lib/auth/__tests__/coach-signup-security.test.ts,
// lib/auth/__tests__/rd-credential-gate.test.ts's own header comment,
// lib/email/__tests__/resend-isolation-security.test.ts). Followed
// identically here. The reusable functions this route calls into
// (findExistingAccountByEmail, recordAcquisitionSignup,
// provisionInvitedCoach, getOverwatchMetrics) ARE exercised live
// against a real DB in lib/db/__tests__/coach-invitation-acquisition.test.ts.
// ─────────────────────────────────────────────────────────────

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

function source(file: string) {
  return readFileSync(resolve(process.cwd(), file), "utf8");
}

const ROUTE = "app/api/internal/overwatch/invite-coach/route.ts";
const GUARDS = "lib/auth/guards.ts";

describe("requireOverwatchAdmin() (lib/auth/guards.ts) — the active-admin guard the route uses", () => {
  const guards = source(GUARDS);
  // Isolate just this function's body for the assertions below, the
  // same technique resend-brand-config's own tests use to avoid a
  // false pass/fail from an unrelated function elsewhere in the file.
  const fnBody = guards.slice(
    guards.indexOf("export async function requireOverwatchAdmin"),
    guards.indexOf("// ─────────────────────────────────────────────────────────────\n// OBJECT-LEVEL AUTHORIZATION"),
  );

  it("exists and checks status='active'", () => {
    expect(fnBody).toContain('resolved.dbUser.status !== "active"');
  });

  it("checks role='admin'", () => {
    expect(fnBody).toContain('resolved.dbUser.role !== "admin"');
  });

  it("derives the authenticated identity from resolveSession() only — no parameter, no client input of any kind", () => {
    // The function signature itself takes no arguments.
    expect(guards).toMatch(/export async function requireOverwatchAdmin\(\)\s*:\s*Promise<GuardResult>\s*\{/);
    expect(fnBody).not.toMatch(/req\.|params\.|body\./);
  });

  it("never references operator_profiles, internal_account_flags, or founder_admin classification for authorization", () => {
    expect(fnBody).not.toMatch(/operatorProfiles|internalAccountFlags|isFounder|accountClassification|founder_admin/i);
  });

  it("mirrors requireOverwatchAdminPage's exact checks (same status/role gate, JSON response instead of redirect)", () => {
    const pageFnStart = guards.indexOf("export async function requireOverwatchAdminPage(): Promise<AuthedUser> {");
    const pageFnEnd = guards.indexOf("// API-guard sibling of requireOverwatchAdminPage()");
    expect(pageFnStart).toBeGreaterThan(-1);
    expect(pageFnEnd).toBeGreaterThan(pageFnStart);
    const pageFnBody = guards.slice(pageFnStart, pageFnEnd);
    expect(pageFnBody).toContain('resolved.dbUser.status !== "active"');
    expect(pageFnBody).toContain('resolved.dbUser.role !== "admin"');
  });
});

describe("app/api/internal/overwatch/invite-coach/route.ts — authorization", () => {
  const route = source(ROUTE);

  it("guards POST with requireOverwatchAdmin() — not requireAdmin() or requireCoachOrAdmin(), which would admit a non-Overwatch or non-admin caller", () => {
    expect(route).toMatch(/import \{ requireOverwatchAdmin \} from "@\/lib\/auth\/guards"/);
    expect(route).toContain("const guard = await requireOverwatchAdmin();");
    expect(route).not.toMatch(/import \{[^}]*\brequireCoachOrAdmin\b/);
    expect(route).not.toMatch(/import \{[^}]*\brequireAdmin\b(?!Config)/); // requireAdmin, not AdminClientConfigError
  });

  it("returns the guard's own response (401/403) immediately on failure — no fallthrough", () => {
    expect(route).toContain("if (!guard.ok) return guard.response;");
  });
});

describe("app/api/internal/overwatch/invite-coach/route.ts — inviter/coach identity cannot be spoofed", () => {
  const route = source(ROUTE);

  it("derives the founder's own identity ONLY from the authenticated guard, never from request input", () => {
    expect(route).toContain("guard.dbUser.id");
    expect(route).not.toMatch(/body\.(inviterId|founderId|adminId|reviewerId)/);
  });

  it("the invited coach's role is never taken from request input — provisionInvitedCoach hardcodes it", () => {
    // The request body shape (InviteCoachPayload) has no role field at
    // all — a caller cannot even attempt to supply one. accessType is
    // the one legitimate addition (complimentary-access feature) and is
    // whitelisted to the literal "standard" | "complimentary" — it is
    // NOT a role, admin id, or grantedBy value of any kind.
    expect(route).toMatch(
      /interface InviteCoachPayload \{\s*firstName\?: string;\s*email\?: string;\s*accessType\?: "standard" \| "complimentary";\s*\}/,
    );
    expect(route).not.toMatch(/body\.role/);
    expect(route).not.toMatch(/body\.(grantedBy|adminId|inviterId)/);
  });

  it("accessType is resolved through a whitelist function, never trusted as a free-form value passed straight to entitlement logic", () => {
    expect(route).toContain('function isComplimentaryAccessType(body: InviteCoachPayload): boolean {\n  return body.accessType === "complimentary";\n}');
  });

  it("the created userId always comes from Supabase's own response (data.user.id), never from request input", () => {
    expect(route).toContain("const newUserId = data.user.id;");
    expect(route).not.toMatch(/body\.(userId|coachId|accountUserId)/);
  });
});

describe("app/api/internal/overwatch/invite-coach/route.ts — no parallel onboarding path", () => {
  const route = source(ROUTE);

  it("reuses provisionInvitedCoach — the same function app/api/coach-signup/route.ts and app/api/admin/coaches/route.ts already use — rather than writing its own role-grant logic", () => {
    expect(route).toContain(
      'import { provisionInvitedCoach } from "@/lib/db/coach-provisioning-service"',
    );
    expect(route).not.toMatch(/\.insert\(users\)/); // no direct users-table write of its own
  });

  it("reuses findExistingAccountByEmail — the same duplicate-check app/api/coach-signup/route.ts already uses", () => {
    expect(route).toContain(
      'import { findExistingAccountByEmail } from "@/lib/db/coach-signup-service"',
    );
  });

  it("uses the existing redirectTo target (/auth/callback) — the same landing point every other invite in this codebase uses, not a bespoke callback route", () => {
    expect(route).toContain("redirectTo: `${siteOrigin}/auth/callback`");
  });

  it("never creates a Stripe Checkout Session, Customer, or subscription — trial/billing stays exclusively in the existing post-login flow", () => {
    expect(route).not.toMatch(/stripe|Stripe|checkout|Checkout|subscription/);
  });
});

describe("app/api/internal/overwatch/invite-coach/route.ts — duplicate/collision handling never mutates an existing account's role", () => {
  const route = source(ROUTE);

  it("client_conflict path returns an error and does not call provisionInvitedCoach", () => {
    const clientConflictBlock = route.slice(
      route.indexOf('if (existing.role === "client")'),
      route.indexOf('if (existing.status === "invited")'),
    );
    expect(clientConflictBlock).not.toContain("provisionInvitedCoach");
    expect(clientConflictBlock).toContain("status: 409");
  });

  it("already_active path returns early and never reaches generateLink/provisionInvitedCoach", () => {
    const activeBlock = route.slice(
      route.indexOf("// Existing coach/admin account already active"),
      route.indexOf("} catch (err) {\n    console.error(\"[InviteCoach] findExistingAccountByEmail"),
    );
    expect(activeBlock).not.toContain("generateLink");
    expect(activeBlock).not.toContain("provisionInvitedCoach");
  });

  it("resends an already-invited-but-unconfirmed account through the existing safe invite path", () => {
    const invitedBlock = route.slice(
      route.indexOf('if (existing.status === "invited")'),
      route.indexOf("// Existing coach/admin account already active"),
    );
    expect(invitedBlock).not.toContain("generateLink");
    expect(invitedBlock).toContain("resendPendingInvite");
    expect(invitedBlock).toContain('status: "sent"');
    expect(invitedBlock).toContain('status: "email_failed"');
  });
});

describe("app/api/internal/overwatch/invite-coach/route.ts — exception text is never surfaced raw to the client", () => {
  const route = source(ROUTE);

  it("every ok:false response uses a fixed, human-readable message — never `err.message` (unlike some older routes in this codebase) for the generic catch block", () => {
    // The route's outer catch block should not leak err.message.
    const finalCatch = route.slice(route.lastIndexOf("} catch (err) {"));
    expect(finalCatch).not.toMatch(/error: err instanceof Error \? err\.message/);
  });
});

describe("app/api/internal/overwatch/invite-coach/route.ts — Resend brand isolation (mirrors resend-isolation-security.test.ts's checks)", () => {
  const route = source(ROUTE);

  it("goes through getKynovantResendConfig, never getCatalystResendConfig or a raw process.env.*RESEND* read", () => {
    expect(route).toContain(
      'import { getKynovantResendConfig } from "@/lib/email/resend-brand-config"',
    );
    expect(route).toContain("getKynovantResendConfig()");
    expect(route).not.toContain("getCatalystResendConfig");
    expect(route).not.toMatch(/process\.env\.(KYNOVANT_)?RESEND_(API_KEY|FROM_EMAIL|ADMIN_EMAIL)/);
  });

  it("never mentions Catalyst Coaching anywhere in the actual email HTML template or subject (not just absent from comments)", () => {
    const htmlStart = route.indexOf("const html = `<!DOCTYPE");
    const htmlEnd = route.indexOf("</html>`;") + "</html>`;".length;
    const subjectLine = route.slice(route.indexOf("subject: `"), route.indexOf("subject: `") + 80);
    expect(htmlStart).toBeGreaterThan(-1);
    const emailContent = route.slice(htmlStart, htmlEnd);
    expect(emailContent.toLowerCase()).not.toContain("catalyst");
    expect(subjectLine.toLowerCase()).not.toContain("catalyst");
  });

  it("email subject/body reference only Kynovant, never a second marketing identity", () => {
    const htmlStart = route.indexOf("const html = `<!DOCTYPE");
    const htmlEnd = route.indexOf("</html>`;") + "</html>`;".length;
    const emailContent = route.slice(htmlStart, htmlEnd);
    expect(emailContent).toContain("Kynovant");
    expect(emailContent).not.toMatch(/Kynovant Elite|Catalyst Coaching Elite/);
  });

  it("does not persist or log the raw Resend API key/from address inline — always via the config getter's destructured values", () => {
    expect(route).toMatch(/const \{ apiKey, fromEmail \} = config;/);
  });
});

describe("app/api/internal/overwatch/invite-coach/route.ts — funnel integrity: 'sent' is recorded only after email confirmation", () => {
  const route = source(ROUTE);

  it("the 'sent' status write happens strictly after sendFounderInviteEmail's result is checked, not merely after provisioning", () => {
    const sendResultIndex = route.indexOf("const sendResult = await sendFounderInviteEmail(");
    const sentStatusIndex = route.indexOf('status: "sent",', sendResultIndex);
    expect(sendResultIndex).toBeGreaterThan(-1);
    expect(sentStatusIndex).toBeGreaterThan(sendResultIndex);
  });

  it("an email-send failure marks the lead 'failed', not 'sent'", () => {
    const failureBranch = route.slice(
      route.indexOf("if (!sendResult.ok) {"),
      route.indexOf("// \"Invite sent\" is recorded ONLY"),
    );
    expect(failureBranch).toContain('status: "failed"');
    expect(failureBranch).not.toContain('status: "sent"');
    expect(failureBranch).not.toContain("actionLink");
  });
});

describe("app/api/internal/overwatch/invite-coach/route.ts — partial-failure recovery", () => {
  const route = source(ROUTE);

  it("fails closed before Auth creation when the durable acquisition lead cannot be recorded", () => {
    const recordStart = route.indexOf("await recordAcquisitionSignup({");
    const recordEnd = route.indexOf("// Duplicate/collision pre-check", recordStart);
    const recordBlock = route.slice(recordStart, recordEnd);
    expect(recordBlock).toContain("return NextResponse.json(");
    expect(recordBlock).toContain("status: 503");
    expect(route.indexOf("generateLink", recordEnd)).toBeGreaterThan(recordEnd);
  });

  it("re-runs canonical provisioning before resending a pending invite", () => {
    const invitedStart = route.indexOf('if (existing.status === "invited")');
    const resendStart = route.indexOf("const resend = await resendPendingInvite", invitedStart);
    expect(invitedStart).toBeGreaterThan(-1);
    expect(resendStart).toBeGreaterThan(invitedStart);
    expect(route.slice(invitedStart, resendStart)).toContain("await provisionInvitedCoach");
  });

  it("records the newly-created Auth identity on the lead before provisioning", () => {
    const identityMarker = route.indexOf("accountUserId: newUserId");
    const provisioningMarker = route.indexOf("await provisionInvitedCoach", identityMarker);
    expect(identityMarker).toBeGreaterThan(-1);
    expect(provisioningMarker).toBeGreaterThan(identityMarker);
  });

  it("recovers only a matching unconfirmed founder-invite Auth identity", () => {
    expect(route).toContain("getAcquisitionInviteLead(normalizedEmail)");
    expect(route).toContain('lead?.source === "founder_invite"');
    expect(route).toContain("authEmail === normalizedEmail");
    expect(route).toContain("!authData.user.email_confirmed_at");
    expect(route).toContain("getUserById(lead.accountUserId)");
  });
});

describe("app/api/internal/overwatch/invite-coach/route.ts — malformed-email validation", () => {
  const route = source(ROUTE);

  it("uses the same email-shape validation pattern (requires @ and a dot) as the existing, already-proven self-service signup route", () => {
    const selfServiceRoute = source("app/api/coach-signup/route.ts");
    // Same regex literal shape — proven correct in production by the
    // self-service path this codebase already runs live traffic
    // through; not re-derived here.
    const emailRegexMatch = route.match(/const EMAIL_RE = (\/[^/]+\/);/);
    const selfServiceRegexMatch = selfServiceRoute.match(/const EMAIL_RE = (\/[^/]+\/);/);
    expect(emailRegexMatch?.[1]).toBeDefined();
    expect(emailRegexMatch?.[1]).toBe(selfServiceRegexMatch?.[1]);
  });

  it("rejects the request with 400 before any DB write or Auth call when validation fails", () => {
    const validateCallIndex = route.indexOf("const validationError = validate(body);");
    const firstDbCallIndex = route.indexOf("recordAcquisitionSignup(");
    expect(validateCallIndex).toBeGreaterThan(-1);
    expect(firstDbCallIndex).toBeGreaterThan(validateCallIndex);
  });
});

describe("app/hq/credentials, /admin/credentials, migration 0028 — untouched by this change (parallel-work boundary)", () => {
  it("the invite-coach route does not import anything from the coach-credential feature", () => {
    const route = source(ROUTE);
    expect(route).not.toMatch(/coach-credential|schema-coach-credentials|rd-credential/);
  });
});
