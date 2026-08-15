// ─────────────────────────────────────────────────────────────
// Normal password-recovery redirect — live Supabase allow-list suite.
//
// Real integration tests against the actual Supabase project (same
// fixture pattern as lib/db/__tests__/coach-entitlement.test.ts and
// lib/db/__tests__/coach-signup.test.ts: real Supabase Auth users,
// cleanup in afterAll()) — no email is ever sent (admin.generateLink()
// only *generates* a link; it never triggers outbound email, unlike
// resetPasswordForEmail()/inviteUserByEmail()).
//
// This is the automated version of the manual diagnostic that found
// the bug: request a recovery link with a given redirectTo, and read
// back data.properties.redirect_to to see whether Supabase's
// Authentication → URL Configuration → Redirect URLs allow list
// accepted it verbatim, or silently substituted the project's Site URL
// (discarding the /auth/callback path and the type=recovery marker —
// the exact failure that landed real users on the public homepage).
// ─────────────────────────────────────────────────────────────

import { describe, it, expect, afterAll } from "vitest";
import { randomUUID } from "crypto";
import { createAdminClient } from "@/lib/supabase/admin";
import { SITE_URL } from "@/lib/site-url";

const createdUserIds: string[] = [];

afterAll(async () => {
  const supa = createAdminClient();
  await Promise.all(
    createdUserIds.map((id) => supa.auth.admin.deleteUser(id).catch(() => {})),
  );
});

async function createTestUser(label: string): Promise<string> {
  const supa = createAdminClient();
  const { data, error } = await supa.auth.admin.createUser({
    email: `recovery-redirect-test-${label}-${randomUUID()}@isolation-test.invalid`,
    email_confirm: true,
    password: randomUUID(),
  });
  if (error || !data.user) {
    throw new Error(`Fixture setup failed: createUser(${label}) — ${error?.message}`);
  }
  createdUserIds.push(data.user.id);
  return data.user.id;
}

describe("normal recovery — the app's actual redirectTo is accepted verbatim", () => {
  it("SITE_URL/auth/callback?type=recovery (app/forgot-password/page.tsx's exact redirectTo) is preserved, not replaced by Site URL", async () => {
    const supa = createAdminClient();
    const userId = await createTestUser("normal-recovery");
    const { data: userData } = await supa.auth.admin.getUserById(userId);
    const email = userData.user!.email!;

    const redirectTo = `${SITE_URL}/auth/callback?type=recovery`;
    const { data, error } = await supa.auth.admin.generateLink({
      type: "recovery",
      email,
      options: { redirectTo },
    });

    expect(error).toBeNull();
    expect(data?.properties?.redirect_to).toBe(redirectTo);
    expect(data?.properties?.redirect_to).not.toBe(SITE_URL);
    expect(data?.properties?.redirect_to).toContain("/auth/callback");
    expect(data?.properties?.redirect_to).toContain("type=recovery");
  });
});

describe("bare-apex + localhost + Catalyst origins — allow-list gap closed by the wildcard Redirect URL entries", () => {
  it.each([
    "https://kynovant.com/auth/callback?type=recovery",
    "http://localhost:3000/auth/callback?type=recovery",
    "https://catalystcoachingelite.com/auth/callback?type=recovery",
    "https://www.catalystcoachingelite.com/auth/callback?type=recovery",
  ])("%s + a query string is now preserved verbatim, not silently substituted with the bare Site URL", async (redirectTo) => {
    const supa = createAdminClient();
    const userId = await createTestUser("origin-coverage");
    const { data: userData } = await supa.auth.admin.getUserById(userId);
    const email = userData.user!.email!;

    const { data, error } = await supa.auth.admin.generateLink({
      type: "recovery",
      email,
      options: { redirectTo },
    });

    expect(error).toBeNull();
    // Before adding the wildcard Redirect URL entries (Authentication →
    // URL Configuration → Redirect URLs, e.g. "https://kynovant.com/
    // auth/callback**"), every one of these origins silently fell back
    // to the bare Site URL the moment a query string was appended —
    // the exact reproduction of the reported production bug. This
    // proves the allow-list itself, not just this app's own redirectTo
    // construction, no longer has that gap.
    expect(data?.properties?.redirect_to).toBe(redirectTo);
  });
});

describe("adjacent flows this fix must not regress", () => {
  it("invite/setup-password redirectTo (SITE_URL/auth/callback, no query — coach-signup and admin-invite's exact form) is preserved", async () => {
    const supa = createAdminClient();
    // type: "invite" mints a brand-new user itself (mirrors
    // inviteUserByEmail()) — unlike the recovery tests above, this
    // email must NOT already exist, so it's generated inline here
    // rather than via createTestUser().
    const email = `recovery-redirect-test-invite-flow-${randomUUID()}@isolation-test.invalid`;

    const redirectTo = `${SITE_URL}/auth/callback`;
    const { data, error } = await supa.auth.admin.generateLink({
      type: "invite",
      email,
      options: { redirectTo },
    });
    if (data?.user) createdUserIds.push(data.user.id);

    expect(error).toBeNull();
    expect(data?.properties?.redirect_to).toBe(redirectTo);
  });

  it("Overwatch's own recovery redirectTo pattern (untouched by this fix) still resolves correctly from the www origin", async () => {
    const supa = createAdminClient();
    const userId = await createTestUser("overwatch-recovery");
    const { data: userData } = await supa.auth.admin.getUserById(userId);
    const email = userData.user!.email!;

    // Mirrors OverwatchLoginClient.tsx's handleRecoveryLink() exactly —
    // that file was deliberately left unmodified by this fix (see
    // recovery-redirect-source.test.ts), and still constructs this
    // from window.location.origin. Proving it still resolves correctly
    // when that origin is the www host is the regression guard that
    // this fix did not disturb Overwatch's founder recovery flow.
    const redirectTo = "https://www.kynovant.com/auth/callback?type=recovery&overwatch=1&next=%2Foverwatch";
    const { data, error } = await supa.auth.admin.generateLink({
      type: "recovery",
      email,
      options: { redirectTo },
    });

    expect(error).toBeNull();
    expect(data?.properties?.redirect_to).toBe(redirectTo);
    expect(data?.properties?.redirect_to).toContain("overwatch=1");
  });
});
