// ─────────────────────────────────────────────────────────────
// Service Worker V1 — registration decision (pure unit tests).
//
// This is the testable core of the SW foundation. Real worker
// lifecycle (install/activate/waiting, controllerchange, actual
// non-interception of fetch, empty Cache Storage) is NOT provable in
// this node-only Vitest setup — see docs/service-worker.md and the
// preview/real-browser acceptance plan.
// ─────────────────────────────────────────────────────────────

import { describe, expect, it } from "vitest";
import {
  SW_KILL,
  SW_SCOPE,
  SW_URL,
  resolveServiceWorkerRegistrationDecision,
  type ServiceWorkerEnvironment,
} from "../service-worker-registration";

const base: ServiceWorkerEnvironment = {
  hostname: "www.kynovant.com",
  isSecureContext: true,
  serviceWorkerSupported: true,
  search: "",
  kill: false,
};

function decide(overrides: Partial<ServiceWorkerEnvironment>) {
  return resolveServiceWorkerRegistrationDecision({ ...base, ...overrides });
}

describe("constants", () => {
  it("worker URL is the stable /sw.js and scope is /", () => {
    expect(SW_URL).toBe("/sw.js");
    expect(SW_SCOPE).toBe("/");
  });

  it("the secondary page-JS kill flag ships OFF", () => {
    expect(SW_KILL).toBe(false);
  });
});

describe("Kynovant production hosts → register", () => {
  it("www.kynovant.com (secure, supported, kill=false) → register", () => {
    expect(decide({ hostname: "www.kynovant.com" })).toBe("register");
  });

  it("kynovant.com (bare apex — recognized by domain-routing) → register", () => {
    expect(decide({ hostname: "kynovant.com" })).toBe("register");
  });

  it("host casing / port are normalized", () => {
    expect(decide({ hostname: "WWW.KYNOVANT.COM" })).toBe("register");
    expect(decide({ hostname: "www.kynovant.com:443" })).toBe("register");
  });
});

describe("Kept / Catalyst hosts → noop (never register)", () => {
  for (const hostname of [
    "keptperformance.com",
    "www.keptperformance.com",
    "catalystcoachingelite.com",
    "www.catalystcoachingelite.com",
  ]) {
    it(`${hostname} → noop`, () => {
      expect(decide({ hostname })).toBe("noop");
    });

    it(`${hostname} + ?__sw=1 → still noop (opt-in is preview-only)`, () => {
      expect(decide({ hostname, search: "?__sw=1" })).toBe("noop");
    });
  }
});

describe("localhost / loopback → ALWAYS noop, even with ?__sw=1", () => {
  for (const hostname of ["localhost", "127.0.0.1", "0.0.0.0", "[::1]"]) {
    it(`${hostname} → noop`, () => {
      expect(decide({ hostname })).toBe("noop");
    });

    it(`${hostname} + ?__sw=1 → STILL noop`, () => {
      expect(decide({ hostname, search: "?__sw=1" })).toBe("noop");
    });

    it(`${hostname} + ?__sw=1 + insecure → noop`, () => {
      expect(decide({ hostname, search: "?__sw=1", isSecureContext: false })).toBe("noop");
    });
  }
});

describe("Vercel Preview (*.vercel.app)", () => {
  const preview = "kynovant-rebrand-app-git-feature-x-catalystadmin2026.vercel.app";

  it("without ?__sw=1 → noop", () => {
    expect(decide({ hostname: preview })).toBe("noop");
  });

  it("with ?__sw=1 (secure, supported) → register", () => {
    expect(decide({ hostname: preview, search: "?__sw=1" })).toBe("register");
  });

  it("with ?__sw=1 among other params → register", () => {
    expect(decide({ hostname: preview, search: "?foo=bar&__sw=1&x=2" })).toBe("register");
  });

  it("with ?__sw=0 or ?__sw= → noop", () => {
    expect(decide({ hostname: preview, search: "?__sw=0" })).toBe("noop");
    expect(decide({ hostname: preview, search: "?__sw=" })).toBe("noop");
    expect(decide({ hostname: preview, search: "?__sw" })).toBe("noop");
  });

  it("with ?__sw=1 but insecure → noop", () => {
    expect(decide({ hostname: preview, search: "?__sw=1", isSecureContext: false })).toBe("noop");
  });

  it("with ?__sw=1 but serviceWorker unsupported → noop", () => {
    expect(decide({ hostname: preview, search: "?__sw=1", serviceWorkerSupported: false })).toBe("noop");
  });

  it("a lookalike host that only CONTAINS 'vercel.app' but does not end with it → noop", () => {
    expect(decide({ hostname: "vercel.app.evil.example", search: "?__sw=1" })).toBe("noop");
  });
});

describe("capability gates", () => {
  it("serviceWorker unsupported → noop, even on a production host", () => {
    expect(decide({ serviceWorkerSupported: false })).toBe("noop");
  });

  it("insecure context → noop, even on a production host", () => {
    expect(decide({ isSecureContext: false })).toBe("noop");
  });
});

describe("KILL flag — host-independent cleanup", () => {
  it("kill=true on a production host → unregister", () => {
    expect(decide({ hostname: "www.kynovant.com", kill: true })).toBe("unregister");
  });

  it("kill=true on localhost → unregister (must clean up wherever a client landed)", () => {
    expect(decide({ hostname: "localhost", kill: true })).toBe("unregister");
  });

  it("kill=true on a Kept/Catalyst host → unregister (cleanup is never host-gated)", () => {
    expect(decide({ hostname: "keptperformance.com", kill: true })).toBe("unregister");
  });

  it("kill=true on a preview host with no opt-in → unregister", () => {
    expect(decide({ hostname: "x.vercel.app", kill: true })).toBe("unregister");
  });

  it("kill=true wins over every other condition (insecure, unsupported)", () => {
    expect(
      decide({ hostname: "www.kynovant.com", kill: true, isSecureContext: false, serviceWorkerSupported: false }),
    ).toBe("unregister");
  });
});
