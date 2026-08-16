// ─────────────────────────────────────────────────────────────
// Client invitation email — source-inspection suite
//
// app/api/internal/clients/route.ts depends on a real Next.js request/
// cookie scope (requireCoachOrAdmin() -> resolveSession() ->
// next/headers cookies()) and performs real side-effecting external
// calls (admin.auth.admin.generateLink()/inviteUserByEmail(), Resend
// email send) that this suite is explicitly scoped to never trigger.
// Same "read the source, assert on it" style already established for
// this exact class of guard-wrapped, side-effecting route — see
// lib/auth/__tests__/overwatch-invite-coach-security.test.ts (the
// closest sibling: the coach-invite version of the same
// generateLink + custom Resend email pattern this route now also uses)
// and lib/email/__tests__/resend-isolation-security.test.ts.
// ─────────────────────────────────────────────────────────────

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

function source(file: string) {
  return readFileSync(resolve(process.cwd(), file), "utf8");
}

const ROUTE = "app/api/internal/clients/route.ts";

describe("app/api/internal/clients/route.ts — authorization unchanged", () => {
  const route = source(ROUTE);

  it("still guards both GET and POST with requireCoachOrAdmin()", () => {
    expect(route).toMatch(/import \{ requireCoachOrAdmin, resolveTenantScope \} from "@\/lib\/auth\/guards"/);
    const guardCalls = route.match(/const guard = await requireCoachOrAdmin\(\);/g) ?? [];
    expect(guardCalls.length).toBe(2); // GET and POST each guard independently
    expect(route).toContain("if (!guard.ok) return guard.response;");
  });

  it("the invited client's role is never taken from request input", () => {
    // Request body shape has no role field — role comes from the
    // on_auth_user_created trigger's default, exactly as before.
    expect(route).toMatch(/let body: \{ fullName\?: string; email\?: string \};/);
    expect(route).not.toMatch(/body\.role/);
  });

  it("rejects malformed or oversized email input before invoking Auth", () => {
    expect(route).toContain("EMAIL_RE");
    expect(route).toContain("MAX_EMAIL_LENGTH");
    expect(route).toContain("A valid email address is required");
  });

  it("the inviting coach's identity is derived only from the authenticated guard, never request input", () => {
    expect(route).toContain("guard.dbUser.id");
    expect(route).not.toMatch(/body\.(coachId|inviterId)/);
  });
});

describe("app/api/internal/clients/route.ts — invite mechanism and redirect target", () => {
  const route = source(ROUTE);

  it("creates brand-new clients via generateLink (not inviteUserByEmail), same redirectTo as before", () => {
    expect(route).toContain('type: "invite"');
    expect(route).toContain("admin.auth.admin.generateLink({");
    expect(route).toContain("redirectTo: `${siteOrigin}/auth/callback`");
    expect(route).toContain(
      'const siteOrigin = process.env.NEXT_PUBLIC_SITE_URL ?? "https://www.kynovant.com";',
    );
  });

  it("resends a still-pending invite via inviteUserByEmail (the proven-safe fallback), never a second generateLink for an existing user", () => {
    const pendingBranchStart = route.indexOf('if (existing.status !== "invited")');
    const pendingBranchEnd = route.indexOf("// generateLink (not inviteUserByEmail)");
    expect(pendingBranchStart).toBeGreaterThan(-1);
    const pendingBranch = route.slice(pendingBranchStart, pendingBranchEnd);
    expect(pendingBranch).toContain("admin.auth.admin.inviteUserByEmail(email, {");
    expect(pendingBranch).not.toContain("generateLink");
  });

  it("rejects re-inviting an email that already belongs to a non-pending account, never silently reuses or promotes it", () => {
    expect(route).toContain('error: "An account with this email already exists."');
  });

  it("rejects an invited coach/admin before the pending-client resend path", () => {
    const existingStart = route.indexOf("if (existing) {");
    const statusStart = route.indexOf('if (existing.status !== "invited")', existingStart);
    const collisionGuard = route.slice(existingStart, statusStart);
    expect(collisionGuard).toContain('existing.role !== "client"');
    expect(collisionGuard).toContain("status: 409");
  });

  it("never derives redirectTo, action link, or invited email from client-supplied input beyond the validated email field", () => {
    expect(route).not.toMatch(/redirectTo:\s*body\./);
    expect(route).not.toMatch(/redirectTo:\s*req\./);
  });

  it("does not return raw Auth/provider exception text to the coach", () => {
    const postRoute = route.slice(route.indexOf("export async function POST"));
    expect(postRoute).not.toContain("error: error?.message");
    expect(postRoute).not.toContain("err instanceof Error ? err.message");
  });
});

describe("app/api/internal/clients/route.ts — Kynovant-branded email, no Catalyst leakage", () => {
  const route = source(ROUTE);
  const htmlStart = route.indexOf("const html = `<!DOCTYPE");
  const htmlEnd = route.indexOf("</html>`;") + "</html>`;".length;
  const emailContent = route.slice(htmlStart, htmlEnd);

  it("goes through getKynovantResendConfig, never getCatalystResendConfig or a raw process.env.*RESEND* read", () => {
    expect(route).toContain('import { getKynovantResendConfig } from "@/lib/email/resend-brand-config"');
    expect(route).toContain("getKynovantResendConfig()");
    expect(route).not.toContain("getCatalystResendConfig");
    expect(route).not.toMatch(/process\.env\.RESEND_API_KEY/);
    expect(route).not.toMatch(/process\.env\.KYNOVANT_RESEND_API_KEY/);
  });

  it("has an actual email HTML template to inspect", () => {
    expect(htmlStart).toBeGreaterThan(-1);
    expect(emailContent.length).toBeGreaterThan(100);
  });

  it("never mentions Catalyst Coaching anywhere in the actual email HTML template or subject", () => {
    expect(emailContent).not.toMatch(/Catalyst/i);
    expect(route).not.toMatch(/subject:\s*"[^"]*Catalyst[^"]*"/i);
  });

  it("sends from a Kynovant-branded address with a Kynovant-only subject", () => {
    expect(route).toContain("from: `Kynovant <${fromEmail}>`");
    expect(route).toContain('subject: "You\'re invited to Kynovant"');
  });

  it("email failure is non-fatal to account creation — the account is already provisioned before the send is attempted", () => {
    const sendCallIndex = route.indexOf("const sendResult = await sendClientInviteEmail(");
    const provisionIndex = route.indexOf("await upsertClientRecords({ userId: newUserId");
    expect(provisionIndex).toBeGreaterThan(-1);
    expect(sendCallIndex).toBeGreaterThan(provisionIndex);
  });
});

describe("app/api/internal/clients/route.ts — PWA copy is factually accurate and secondary", () => {
  const route = source(ROUTE);
  const htmlStart = route.indexOf("const html = `<!DOCTYPE");
  const htmlEnd = route.indexOf("</html>`;") + "</html>`;".length;
  const emailContent = route.slice(htmlStart, htmlEnd);

  it("mentions Home Screen installation, not App Store download or offline capability", () => {
    expect(emailContent).toMatch(/Home Screen/);
    expect(emailContent).toContain("no App Store download needed");
    expect(emailContent).not.toMatch(/[Dd]ownload (it |Kynovant )?from the App Store/);
    expect(emailContent).not.toMatch(/offline/i);
    expect(emailContent).not.toMatch(/install automatically/i);
  });

  it("the PWA line appears after the primary Accept Invitation CTA, not before it — secondary, not the email's focus", () => {
    const ctaIndex = emailContent.indexOf("Accept Invitation");
    const pwaLineIndex = emailContent.indexOf("Home Screen so it works like an app");
    expect(ctaIndex).toBeGreaterThan(-1);
    expect(pwaLineIndex).toBeGreaterThan(ctaIndex);
  });

  it("the primary CTA links to the real action link, not a placeholder", () => {
    expect(emailContent).toContain('href="${input.actionLink}"');
  });

  it("never exposes a raw Supabase service-role key or API key in the email body", () => {
    expect(emailContent).not.toMatch(/service_role/i);
    expect(emailContent).not.toMatch(/\$\{apiKey\}/);
  });
});

describe("app/api/internal/clients/route.ts — AddClientModal's response contract is preserved", () => {
  const route = source(ROUTE);

  it("still returns { ok, client: { id, name, email } } on success, matching AddClientModal's existing parsing", () => {
    expect(route).toMatch(/ok: true, client: \{ id: \w+, name: fullName, email \}/);
  });

  it("still returns { ok: false, error } on failure, matching AddClientModal's existing error display", () => {
    expect(route).toMatch(/ok: false, error:/);
  });
});
