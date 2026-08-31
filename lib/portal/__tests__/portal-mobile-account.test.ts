// ─────────────────────────────────────────────────────────────
// Client Portal — mobile account + Sign-Out discoverability
// (source-inspection suite)
//
// components/portal/PortalMobileHeader.tsx is a "use client" component
// that touches window/document event listeners — this repo has no
// jsdom/RTL component-DOM test infrastructure (see vitest.config.ts:
// environment "node", include scoped to lib/**/__tests__/**/*.test.ts).
// This mirrors the established "read the source, assert on it" pattern
// already used for the PWA install components in
// lib/pwa/__tests__/pwa-onboarding-source.test.ts.
//
// What this guards:
//   - a mobile-only account control exists in the Portal chrome;
//   - its menu exposes /account, the existing Install affordance, and
//     the existing Portal Sign Out — with no duplicated auth/session
//     logic;
//   - Sign Out is reachable from /portal in <= 2 taps (open menu ->
//     tap Sign out);
//   - desktop PortalSidebar and the 7-item MobilePortalNav are
//     unchanged (no 8th bottom-nav destination);
//   - accessibility semantics (aria-expanded/controls/haspopup,
//     Escape + outside-click dismissal, focus return) are present;
//   - safe-area insets and 44px touch targets are respected.
// ─────────────────────────────────────────────────────────────

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

function source(file: string) {
  return readFileSync(resolve(process.cwd(), file), "utf8");
}

const HEADER = "components/portal/PortalMobileHeader.tsx";
const SHELL = "components/portal/PortalShell.tsx";
const MOBILE_NAV = "components/portal/MobilePortalNav.tsx";
const SIDEBAR = "components/portal/PortalSidebar.tsx";
const LOGOUT = "components/portal/LogoutButton.tsx";
const ACCOUNT_PAGE = "app/account/page.tsx";

describe("PortalMobileHeader — mobile-only account affordance exists", () => {
  const header = source(HEADER);

  it("is a client component", () => {
    expect(header.trimStart().startsWith('"use client"')).toBe(true);
  });

  it("renders only below the lg breakpoint (desktop keeps the existing sidebar untouched)", () => {
    // The root header element is lg:hidden...
    expect(header).toMatch(/<header className="lg:hidden fixed top-0/);
    // ...and so is every fixed layer it spawns (backdrop + panel).
    const fixedLayers = header.match(/className="fixed [^"]*"/g) ?? [];
    expect(fixedLayers.length).toBeGreaterThanOrEqual(2);
    for (const layer of fixedLayers) {
      expect(layer).toContain("lg:hidden");
    }
  });

  it("shows the Kynovant identity mark on the left", () => {
    expect(header).toContain("/logos/kynovant-mark.png");
  });

  it("exposes a labelled account trigger with correct disclosure semantics", () => {
    expect(header).toContain('aria-haspopup="true"');
    expect(header).toContain("aria-expanded={open}");
    expect(header).toMatch(/aria-controls=\{open \? panelId : undefined\}/);
    expect(header).toContain('aria-label="Account menu"');
    // The panel it points at carries the matching id.
    expect(header).toContain("id={panelId}");
  });
});

describe("PortalMobileHeader — menu contents (no duplicated auth/install logic)", () => {
  const header = source(HEADER);

  it("links to the Account page", () => {
    expect(header).toContain('href="/account"');
  });

  it("surfaces the EXISTING InstallKynovant affordance (menu variant, portal scope)", () => {
    expect(header).toContain(
      'import InstallKynovant from "@/components/pwa/InstallKynovant"',
    );
    expect(header).toMatch(/<InstallKynovant variant="menu" scope="portal" \/>/);
  });

  it("surfaces the EXISTING Portal LogoutButton — not a re-implemented sign-out", () => {
    expect(header).toContain('import LogoutButton from "./LogoutButton"');
    expect(header).toMatch(/<LogoutButton\b/);
  });

  it("contains no Supabase / auth / session code of its own", () => {
    expect(header).not.toMatch(/supabase/i);
    expect(header).not.toMatch(/signOut/);
    expect(header).not.toMatch(/@\/lib\/supabase/);
  });
});

describe("PortalMobileHeader — Sign Out reachable in <= 2 taps from /portal", () => {
  const header = source(HEADER);

  it("tap 1 toggles the menu open", () => {
    expect(header).toContain("onClick={() => setOpen((v) => !v)}");
  });

  it("tap 2 is the Sign Out button, rendered inside the open-gated panel", () => {
    const gateIndex = header.indexOf("{open && (");
    const logoutIndex = header.indexOf("<LogoutButton");
    expect(gateIndex).toBeGreaterThan(-1);
    expect(logoutIndex).toBeGreaterThan(gateIndex);
  });
});

describe("PortalMobileHeader — accessibility & mobile viewport behaviour", () => {
  const header = source(HEADER);

  it("closes on Escape and returns focus to the trigger", () => {
    expect(header).toContain('event.key === "Escape"');
    expect(header).toContain("triggerRef.current?.focus()");
  });

  it("closes on outside tap via the full-viewport backdrop, NOT a document pointerdown listener", () => {
    // A document-level pointerdown handler fires before `click` and would
    // unmount the backdrop before the pointer's own click dispatched,
    // letting that click land on underlying Portal content. The backdrop
    // owns dismissal so the tap is absorbed by the backdrop itself.
    expect(header).not.toMatch(/addEventListener\(\s*["']pointerdown["']/);
    expect(header).not.toMatch(/addEventListener\(\s*["']mousedown["']/);
    expect(header).toMatch(/className="fixed inset-0 z-40 lg:hidden"[\s\S]*?onClick=\{close\}/);
  });

  it("moves focus into the panel when it opens", () => {
    expect(header).toContain("firstItemRef.current?.focus()");
  });

  it("uses >= 44px touch targets (trigger and every menu row)", () => {
    expect(header).toContain("h-11 w-11"); // trigger
    expect(header).toMatch(/min-h-11/); // menu rows
    expect(header).not.toContain("h-9 w-9"); // no sub-44 interactive rows
  });

  it("respects the top safe-area inset for installed iOS/Android PWA layouts", () => {
    expect(header).toContain("env(safe-area-inset-top)");
  });

  it("caps the panel width so it never overflows horizontally at ~360px", () => {
    expect(header).toContain("w-[calc(100vw-1.5rem)]");
    expect(header).toContain("max-w-xs");
  });

  it("renders above MobilePortalNav (z-40) so the menu is never obscured by the bottom bar", () => {
    // The header establishes a z-50 stacking context — above the
    // bottom nav regardless of DOM order — and the popover panel sits
    // at z-50 within it.
    expect(header).toMatch(/<header className="lg:hidden fixed top-0[^"]*z-50/);
    const panel = header.slice(header.indexOf("id={panelId}"));
    expect(panel).toMatch(/z-50/);
    expect(source(MOBILE_NAV)).toContain("z-40");
  });
});

describe("PortalShell — wires the mobile header into the Portal chrome", () => {
  const shell = source(SHELL);

  it("imports and renders PortalMobileHeader with the client name", () => {
    expect(shell).toContain('import PortalMobileHeader from "./PortalMobileHeader"');
    expect(shell).toContain("<PortalMobileHeader clientName={clientName} />");
  });

  it("offsets the mobile content area below the new fixed header", () => {
    expect(shell).toContain("pt-[calc(4rem+env(safe-area-inset-top))]");
    expect(shell).toContain("lg:pt-10");
  });

  it("still renders the one canonical PortalInstallOnboarding surface and nothing else install-related", () => {
    expect(shell).toContain(
      'import PortalInstallOnboarding from "@/components/pwa/PortalInstallOnboarding"',
    );
    const occurrences = shell.match(/<PortalInstallOnboarding \/>/g) ?? [];
    expect(occurrences.length).toBe(1);
    expect(shell).not.toContain("InstallKynovant");
  });
});

describe("MobilePortalNav — the 7 bottom destinations are unchanged (no 8th item)", () => {
  const nav = source(MOBILE_NAV);

  it("still has exactly the seven existing destinations", () => {
    const hrefs = nav.match(/href:\s*"\/portal[^"]*"/g) ?? [];
    expect(hrefs.length).toBe(7);
    for (const href of [
      '"/portal"',
      '"/portal/program"',
      '"/portal/progress"',
      '"/portal/check-ins"',
      '"/portal/nutrition"',
      '"/portal/messages"',
      '"/portal/documents"',
    ]) {
      expect(nav).toContain(href);
    }
  });

  it("does not add an Account destination to the bottom bar", () => {
    expect(nav).not.toContain('"/account"');
  });
});

describe("Desktop PortalSidebar — untouched", () => {
  const sidebar = source(SIDEBAR);

  it("is still desktop-only", () => {
    expect(sidebar).toContain("hidden lg:flex");
  });

  it("still owns the desktop Account link and Sign Out", () => {
    expect(sidebar).toContain('href="/account"');
    expect(sidebar).toContain('import LogoutButton from "./LogoutButton"');
  });
});

describe("Regression — /account install + sign-out affordances intact", () => {
  const account = source(ACCOUNT_PAGE);

  it("account page still exposes the install-later affordance and the sign-out block", () => {
    expect(account).toContain('import LogoutButton from "@/components/portal/LogoutButton"');
    expect(account).toMatch(/<InstallKynovant variant="nav" scope="portal"/);
    expect(account).toMatch(/<LogoutButton\b/);
  });
});

describe("Auth/session untouched — LogoutButton is the single sign-out implementation", () => {
  const logout = source(LOGOUT);

  it("still performs the exact same Supabase sign-out + redirect", () => {
    expect(logout).toContain("supabase.auth.signOut()");
    expect(logout).toContain('router.push("/login")');
    expect(logout).toContain("router.refresh()");
  });
});
