// ─────────────────────────────────────────────────────────────
// Resend brand config — env-var isolation regression suite.
//
// Pure unit tests, no DB / no live Resend calls — mirrors the style
// of lib/billing/__tests__/prices.test.ts (env-var-driven, no module-
// level caching, so a plain re-import per test observes the env as
// currently set).
//
// Proves, in both directions:
//   1. Kynovant's getter cannot resolve a Catalyst credential, even
//      when one is present in the environment.
//   2. Catalyst's getter cannot resolve a Kynovant credential, even
//      when one is present in the environment.
//   3. Missing brand-specific configuration fails closed (null),
//      never a partial config, and never a cross-brand fallback.
// ─────────────────────────────────────────────────────────────

import { describe, it, expect, beforeEach, afterEach } from "vitest";

const KYNOVANT_VARS = [
  "KYNOVANT_RESEND_API_KEY",
  "KYNOVANT_RESEND_FROM_EMAIL",
  "KYNOVANT_RESEND_ADMIN_EMAIL",
] as const;

const CATALYST_VARS = ["RESEND_API_KEY", "RESEND_FROM_EMAIL", "RESEND_ADMIN_EMAIL"] as const;

const ALL_VARS = [...KYNOVANT_VARS, ...CATALYST_VARS];

const original: Record<string, string | undefined> = {};

beforeEach(() => {
  for (const key of ALL_VARS) {
    original[key] = process.env[key];
    delete process.env[key];
  }
});

afterEach(() => {
  for (const key of ALL_VARS) {
    if (original[key] === undefined) delete process.env[key];
    else process.env[key] = original[key];
  }
});

async function freshConfigModule() {
  return import("../resend-brand-config");
}

describe("getKynovantResendConfig — cannot resolve Catalyst credentials", () => {
  it("returns null when only Catalyst's generic RESEND_* vars are set", async () => {
    process.env.RESEND_API_KEY = "catalyst-api-key";
    process.env.RESEND_FROM_EMAIL = "hello@catalystcoachingelite.com";
    process.env.RESEND_ADMIN_EMAIL = "admin@catalystcoachingelite.com";

    const { getKynovantResendConfig } = await freshConfigModule();
    expect(getKynovantResendConfig()).toBeNull();
  });

  it("returns exactly the KYNOVANT_RESEND_* values, never the Catalyst values, when both are set", async () => {
    process.env.KYNOVANT_RESEND_API_KEY = "kynovant-api-key";
    process.env.KYNOVANT_RESEND_FROM_EMAIL = "no-reply@kynovant.com";
    process.env.KYNOVANT_RESEND_ADMIN_EMAIL = "admin@kynovant.com";
    // Deliberately also set Catalyst's — proves no accidental fallback
    // or merge happens even when both brands are fully configured.
    process.env.RESEND_API_KEY = "catalyst-api-key";
    process.env.RESEND_FROM_EMAIL = "hello@catalystcoachingelite.com";
    process.env.RESEND_ADMIN_EMAIL = "admin@catalystcoachingelite.com";

    const { getKynovantResendConfig } = await freshConfigModule();
    const config = getKynovantResendConfig();
    expect(config).toEqual({
      apiKey: "kynovant-api-key",
      fromEmail: "no-reply@kynovant.com",
      adminEmail: "admin@kynovant.com",
    });
    expect(config?.apiKey).not.toBe("catalyst-api-key");
    expect(config?.fromEmail).not.toContain("catalystcoachingelite.com");
  });

  it("fails closed (null) when only some of the three Kynovant vars are set", async () => {
    process.env.KYNOVANT_RESEND_API_KEY = "kynovant-api-key";
    process.env.KYNOVANT_RESEND_FROM_EMAIL = "no-reply@kynovant.com";
    // KYNOVANT_RESEND_ADMIN_EMAIL deliberately left unset.

    const { getKynovantResendConfig } = await freshConfigModule();
    expect(getKynovantResendConfig()).toBeNull();
  });
});

describe("getCatalystResendConfig — cannot resolve Kynovant credentials", () => {
  it("returns null when only Kynovant's KYNOVANT_RESEND_* vars are set", async () => {
    process.env.KYNOVANT_RESEND_API_KEY = "kynovant-api-key";
    process.env.KYNOVANT_RESEND_FROM_EMAIL = "no-reply@kynovant.com";
    process.env.KYNOVANT_RESEND_ADMIN_EMAIL = "admin@kynovant.com";

    const { getCatalystResendConfig } = await freshConfigModule();
    expect(getCatalystResendConfig()).toBeNull();
  });

  it("returns exactly the generic RESEND_* values, never the Kynovant values, when both are set", async () => {
    process.env.RESEND_API_KEY = "catalyst-api-key";
    process.env.RESEND_FROM_EMAIL = "hello@catalystcoachingelite.com";
    process.env.RESEND_ADMIN_EMAIL = "admin@catalystcoachingelite.com";
    // Deliberately also set Kynovant's — same cross-check as above.
    process.env.KYNOVANT_RESEND_API_KEY = "kynovant-api-key";
    process.env.KYNOVANT_RESEND_FROM_EMAIL = "no-reply@kynovant.com";
    process.env.KYNOVANT_RESEND_ADMIN_EMAIL = "admin@kynovant.com";

    const { getCatalystResendConfig } = await freshConfigModule();
    const config = getCatalystResendConfig();
    expect(config).toEqual({
      apiKey: "catalyst-api-key",
      fromEmail: "hello@catalystcoachingelite.com",
      adminEmail: "admin@catalystcoachingelite.com",
    });
    expect(config?.apiKey).not.toBe("kynovant-api-key");
    expect(config?.fromEmail).not.toContain("kynovant.com");
  });

  it("fails closed (null) when only some of the three Catalyst vars are set", async () => {
    process.env.RESEND_API_KEY = "catalyst-api-key";
    // RESEND_FROM_EMAIL and RESEND_ADMIN_EMAIL deliberately left unset.

    const { getCatalystResendConfig } = await freshConfigModule();
    expect(getCatalystResendConfig()).toBeNull();
  });
});

describe("both getters — fail closed with nothing configured at all", () => {
  it("both return null when the environment has no Resend vars of either brand", async () => {
    const { getKynovantResendConfig, getCatalystResendConfig } = await freshConfigModule();
    expect(getKynovantResendConfig()).toBeNull();
    expect(getCatalystResendConfig()).toBeNull();
  });
});
