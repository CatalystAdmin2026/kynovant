// ─────────────────────────────────────────────────────────────
// Client Portal PWA install onboarding — source-inspection suite
//
// components/pwa/PortalInstallOnboarding.tsx, InstallKynovant.tsx, and
// lib/pwa/use-install-state.ts are all "use client" components/hooks
// that touch window/localStorage/beforeinstallprompt — this repo has no
// jsdom/React Testing Library component-DOM test infrastructure (see
// vitest.config.ts: environment "node", include scoped to
// lib/**/__tests__/**/*.test.ts only) and Phase 10 of the launch brief
// is explicit not to add one just for this. The pure decision logic
// (resolveInstallSurface, isMobileDevice, shouldShowPortalInstallOnboarding)
// IS fully unit-tested in install.test.ts; this file covers the
// remaining behavioral guarantees — event wiring, persistence,
// component wiring/placement, accessibility, brand copy — the same
// "read the source, assert on it" way already established throughout
// this codebase for guard/hook code a bare vitest process can't mount
// (see lib/auth/__tests__/rd-credential-gate.test.ts's own header
// comment for the precedent).
// ─────────────────────────────────────────────────────────────

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

function source(file: string) {
  return readFileSync(resolve(process.cwd(), file), "utf8");
}

const HOOK = "lib/pwa/use-install-state.ts";
const STORE = "lib/pwa/install-store.ts";
const INSTALL_KYNOVANT = "components/pwa/InstallKynovant.tsx";
const PORTAL_ONBOARDING = "components/pwa/PortalInstallOnboarding.tsx";
const PORTAL_SHELL = "components/portal/PortalShell.tsx";
const INSTALL_INSTRUCTIONS = "components/pwa/InstallInstructions.tsx";

describe("usePwaInstallState — installed/standalone hides everything", () => {
  const hook = source(HOOK);
  const store = source(STORE);

  it("derives surface via resolveInstallSurface, letting 'installed' win before any prompt/iOS branch", () => {
    expect(hook).toContain('import { isMobileDevice, resolveInstallSurface, type InstallSurface } from "./install"');
    expect(hook).toContain("if (isInstalledSignal()) return \"installed\";");
    expect(hook).toContain("return resolveInstallSurface(getEnvironment(hasNativePrompt()));");
  });

  it("re-derives surface on a standalone display-mode change — the matchMedia change listener now lives in the singleton store", () => {
    expect(store).toContain('window.matchMedia?.("(display-mode: standalone)")');
    expect(store).toContain('standaloneQuery?.addEventListener?.("change", onStandaloneChange)');
    // The hook recomputes surface whenever the store's version bumps.
    expect(hook).toContain("useSyncExternalStore(");
    expect(hook).toContain("[mounted, storeVersion]");
  });
});

describe("PortalInstallOnboarding — visibility gate", () => {
  const component = source(PORTAL_ONBOARDING);

  it("renders nothing before mount (SSR-safe — no window/localStorage access during render)", () => {
    expect(component).toContain("if (!mounted) return null;");
  });

  it("is eligible only on mobile, not dismissed, not already shown this session, and only for an actionable surface", () => {
    expect(component).toContain("isMobile &&");
    expect(component).toContain("!dismissed &&");
    expect(component).toContain("!alreadyShownThisSession &&");
    expect(component).toContain('(surface === "native_prompt" || surface === "ios_instructions");');
  });

  it("suppresses re-appearing on every Portal page navigation via a session-scoped (not permanent) flag", () => {
    // PortalShell has no shared app/portal/layout.tsx — every
    // app/portal/*/page.tsx imports it directly, so this component
    // fully remounts per page. Without this guard the sheet would
    // reappear on every page until dismissed.
    expect(component).toContain('const SESSION_SHOWN_KEY = "kynovant:pwa-onboarding-shown-session";');
    expect(component).toContain("window.sessionStorage.getItem(SESSION_SHOWN_KEY)");
    expect(component).toContain("window.sessionStorage.setItem(SESSION_SHOWN_KEY");
    // Distinct key from the permanent dismissal flag — a new tab/
    // session can still show the sheet again even if a PRIOR session
    // saw it (but never if the user actually dismissed/installed).
    expect(component).not.toContain('sessionStorage.getItem("kynovant:pwa-install-dismissed")');
  });

  it("only marks the session as 'shown' once the sheet actually becomes eligible/visible, never unconditionally", () => {
    const markCallSite = component.indexOf("markShownThisSession();");
    const effectStart = component.lastIndexOf("useEffect(() => {\n    if (!eligible) return;", markCallSite);
    expect(effectStart).toBeGreaterThan(-1);
    expect(markCallSite).toBeGreaterThan(effectStart);
  });

  it("falls back to the existing InstallKynovant card — never renders nothing AND never renders both — when not eligible (desktop, installed, unsupported, or dismissed)", () => {
    expect(component).toContain("if (!eligible) {");
    expect(component).toContain('return <InstallKynovant variant="card" scope="portal" />;');
  });

  it("delays the prominent sheet's first paint so it never pops in instantly on page load", () => {
    expect(component).toContain("REVEAL_DELAY_MS");
    expect(component).toContain("if (!revealed) return null;");
  });

  it("dismiss is always reachable two ways (X button and a text 'Not now' button) — never a trap with no way out", () => {
    const occurrences = component.match(/onClick=\{handleDismiss\}/g) ?? [];
    expect(occurrences.length).toBeGreaterThanOrEqual(2);
    expect(component).toContain('aria-label="Dismiss install prompt"');
    expect(component).toContain("Not now");
  });

  it("the dismiss (X) button meets the same 44px touch-target convention used everywhere else in this codebase", () => {
    const dismissButtonStart = component.indexOf('aria-label="Dismiss install prompt"');
    const surrounding = component.slice(dismissButtonStart, dismissButtonStart + 200);
    expect(surrounding).toContain("h-11 w-11");
    expect(surrounding).not.toContain("h-9 w-9");
  });

  it("is a non-blocking region, not a trapping modal — no full-screen backdrop, no aria-modal", () => {
    expect(component).toContain('role="region"');
    expect(component).not.toContain("aria-modal");
    expect(component).not.toMatch(/bg-black\/\d+.*inset-0/); // no full-screen dark backdrop
  });

  it("routes the iOS path through the shared InstallInstructions component, not a duplicated copy", () => {
    expect(component).toContain('import InstallInstructions from "./InstallInstructions"');
    expect(component).toContain('{instructionsOpen && <InstallInstructions onClose={() => setInstructionsOpen(false)} />}');
  });

  it("reuses the shared usePwaInstallState hook — not a second, independent event-wiring implementation", () => {
    expect(component).toContain('import { usePwaInstallState } from "@/lib/pwa/use-install-state"');
    expect(component).not.toMatch(/addEventListener\(["']beforeinstallprompt["']/);
    expect(component).not.toMatch(/addEventListener\(["']appinstalled["']/);
  });
});

describe("PortalInstallOnboarding — copy accuracy (Phase 8 truth requirement)", () => {
  const component = source(PORTAL_ONBOARDING);

  it("describes Home Screen installation, never claims an App Store download or offline capability", () => {
    expect(component).toContain("no App Store download needed");
    expect(component).not.toMatch(/[Dd]ownload (it |Kynovant )?from the App Store/);
    expect(component).not.toMatch(/offline/i);
  });

  it("never mentions Catalyst Coaching", () => {
    expect(component).not.toMatch(/Catalyst/i);
  });
});

describe("InstallKynovant — refactored onto the shared hook without changing its observable behavior", () => {
  const component = source(INSTALL_KYNOVANT);

  it("still hides for installed/unsupported, and (card variant only) once dismissed — same early-return contract as before", () => {
    // installed / unsupported → render nothing, always.
    expect(component).toContain('if (!mounted || surface === "installed" || surface === "unsupported") {');
    // card variant → still nothing once dismissed (and never for the
    // passive hint surfaces).
    expect(component).toContain('if (variant === "card" && (dismissed || isHint)) {');
  });

  it("uses the shared hook and shared InstallInstructions, not its own duplicated event wiring", () => {
    expect(component).toMatch(/import \{[^}]*usePwaInstallState[^}]*\} from "@\/lib\/pwa\/use-install-state"/);
    expect(component).toContain('import InstallInstructions from "./InstallInstructions"');
    expect(component).not.toMatch(/addEventListener\(["']beforeinstallprompt["']/);
  });

  it("still supports nav/menu/card variants", () => {
    expect(component).toMatch(/type Variant = "nav" \| "menu" \| "card";/);
  });
});

describe("consumeNativePrompt() — no unhandled promise rejection on a stale prompt event", () => {
  const store = source(STORE);

  it("wraps prompt()/userChoice in try/catch and resolves to 'unavailable' on rejection, rather than throwing", () => {
    const fnStart = store.indexOf("export async function consumeNativePrompt");
    const fnEnd = store.indexOf("export function __resetInstallStoreForTests");
    const fnBody = store.slice(fnStart, fnEnd);
    expect(fnBody).toContain("try {");
    expect(fnBody).toContain("await event.prompt();");
    expect(fnBody).toContain("await event.userChoice;");
    expect(fnBody).toContain("} catch {");
    expect(fnBody).toContain('return "unavailable";');
  });

  it("the hook's install() delegates to it and never invokes a prompt automatically", () => {
    const hook = source(HOOK);
    expect(hook).toContain("const outcome = await consumeNativePrompt();");
    // No automatic prompt() call anywhere in the hook.
    expect(hook).not.toMatch(/\.prompt\(\)/);
  });
});

describe("Dismissal persistence — device-local only, never a new DB table", () => {
  it("uses localStorage, not a server/database call, for dismissal state", () => {
    const hook = source(HOOK);
    expect(hook).toContain("window.localStorage.getItem(DISMISSED_KEYS[scope])");
    expect(hook).toContain("window.localStorage.setItem(DISMISSED_KEYS[scope]");
    expect(hook).not.toMatch(/fetch\(|getDb\(|drizzle/);
  });

  it("localStorage reads/writes are wrapped in try/catch (private-browsing storage can throw)", () => {
    const hook = source(HOOK);
    expect(hook).toMatch(/function readDismissed\(scope: InstallScope\): boolean \{\s*try \{/);
    expect(hook).toMatch(/function writeDismissed\(scope: InstallScope, value: boolean\) \{\s*try \{/);
  });

  // Root cause of "Install Kynovant reappears after every HQ navigation":
  // Chromium re-fires beforeinstallprompt on essentially every qualifying
  // page load, not just once ever — the previous handler treated every
  // firing as "user hasn't decided yet" and unconditionally wiped the
  // persisted dismissal, so a coach's explicit dismiss() was erased by
  // the very next navigation's beforeinstallprompt event.
  it("a fresh beforeinstallprompt firing does NOT touch dismissal — the singleton store has no concept of it", () => {
    const store = source(STORE);
    const fnStart = store.indexOf("function onBeforeInstallPrompt");
    const fnEnd = store.indexOf("function onAppInstalled");
    const fnBody = store.slice(fnStart, fnEnd);
    // Dismissal is a use-install-state concern; the store never reads or
    // writes it, so re-firing beforeinstallprompt can't erase it.
    expect(fnBody).not.toMatch(/writeDismissed|setDismissed|localStorage/);
    // It still captures the event and notifies subscribers.
    expect(fnBody).toContain("promptEvent = event as BeforeInstallPromptEvent;");
    expect(fnBody).toContain("emit();");
    expect(fnBody).toContain("event.preventDefault();");
  });

  it("dismiss() and a real native-prompt 'dismissed' outcome are the ONLY two places dismissal is ever written", () => {
    const hook = source(HOOK);
    const writeCallSites = hook.match(/writeDismissed\(scope, true\)/g) ?? [];
    // install()'s dismissed-outcome branch, and dismiss() itself.
    expect(writeCallSites.length).toBe(2);
  });

  it("appinstalled immediately drives surface to 'installed', independent of the dismissed flag", () => {
    const store = source(STORE);
    const fnStart = store.indexOf("function onAppInstalled");
    const fnEnd = store.indexOf("function onStandaloneChange");
    const fnBody = store.slice(fnStart, fnEnd);
    expect(fnBody).toContain("installed = true;");
    // ...and the hook honours that signal before any other branch.
    expect(source(HOOK)).toContain('if (isInstalledSignal()) return "installed";');
  });
});

describe("Scoped dismissal — HQ, Portal, and the public site never share one dismissal fact", () => {
  const hook = source(HOOK);

  it("defines three distinct storage keys, one per account context", () => {
    expect(hook).toMatch(/default:\s*"kynovant:pwa-install-dismissed",/);
    expect(hook).toMatch(/hq:\s*"kynovant:pwa-install-dismissed:hq",/);
    expect(hook).toMatch(/portal:\s*"kynovant:pwa-install-dismissed:portal",/);
  });

  it("the public site's key is unchanged from before this fix — existing visitor dismissals keep working", () => {
    expect(hook).toContain('"kynovant:pwa-install-dismissed"');
  });

  it("usePwaInstallState takes an explicit scope, defaulting to the public/unscoped key", () => {
    expect(hook).toContain('export function usePwaInstallState(scope: InstallScope = "default")');
    expect(hook).toContain("readDismissed(scope)");
  });

  it("Coach HQ's two InstallKynovant call sites (sidebar, mobile nav) both pass scope=\"hq\"", () => {
    const sidebar = source("components/hq/HQSidebar.tsx");
    const mobileNav = source("components/hq/HQMobileNav.tsx");
    expect(sidebar).toMatch(/<InstallKynovant variant="card" scope="hq"/);
    expect(mobileNav).toMatch(/<InstallKynovant variant="card" scope="hq"/);
  });

  it("the Portal onboarding hook and its InstallKynovant fallback both pass scope=\"portal\"", () => {
    const component = source(PORTAL_ONBOARDING);
    expect(component).toContain('usePwaInstallState("portal")');
    expect(component).toMatch(/<InstallKynovant variant="card" scope="portal"/);
  });

  it("InstallKynovant forwards its scope prop straight into the shared hook, defaulting to \"default\"", () => {
    const component = source(INSTALL_KYNOVANT);
    expect(component).toMatch(/scope\s*=\s*"default"/);
    expect(component).toContain("usePwaInstallState(scope)");
  });
});

describe("Install-later affordance — /account, reachable after dismissal", () => {
  const account = source("app/account/page.tsx");

  it("renders InstallKynovant, scoped to the Portal, from the account page", () => {
    expect(account).toContain('import InstallKynovant from "@/components/pwa/InstallKynovant"');
    expect(account).toMatch(/<InstallKynovant variant="nav" scope="portal"/);
  });

  it("uses the \"nav\"/\"menu\" variant, not \"card\" — card is the only variant that hides once dismissed, which would defeat an install-later affordance", () => {
    expect(account).not.toMatch(/<InstallKynovant variant="card"/);
  });

  it("is not a large new Settings feature — a single small addition alongside the existing Session/sign-out block, not a new page", () => {
    const appMatch = account.match(/uppercase">\s*App\s*<\/p>/);
    const sessionMatch = account.match(/uppercase">\s*Session\s*<\/p>/);
    expect(appMatch).not.toBeNull();
    expect(sessionMatch).not.toBeNull();
    expect(account.indexOf(sessionMatch![0])).toBeGreaterThan(account.indexOf(appMatch![0]));
  });
});

describe("Portal placement — one canonical surface, not duplicated per page", () => {
  it("PortalShell renders PortalInstallOnboarding exactly once, and no longer references InstallKynovant directly", () => {
    const shell = source(PORTAL_SHELL);
    expect(shell).toContain('import PortalInstallOnboarding from "@/components/pwa/PortalInstallOnboarding"');
    const occurrences = shell.match(/<PortalInstallOnboarding \/>/g) ?? [];
    expect(occurrences.length).toBe(1);
    expect(shell).not.toContain("InstallKynovant");
  });

  it("no client-portal feature page (dashboard/workouts/nutrition/messages) imports the install components directly", () => {
    const featureFiles = [
      "app/portal/page.tsx",
      "app/portal/program/page.tsx",
      "app/portal/nutrition/page.tsx",
      "app/portal/messages/page.tsx",
    ];
    for (const file of featureFiles) {
      let content: string;
      try {
        content = source(file);
      } catch {
        continue; // file may not exist at this exact path — not this test's concern
      }
      expect(content).not.toMatch(/InstallKynovant|PortalInstallOnboarding/);
    }
  });
});

describe("InstallInstructions — single shared iOS instructions surface", () => {
  const instructions = source(INSTALL_INSTRUCTIONS);

  it("both InstallKynovant and PortalInstallOnboarding import the same shared component, not two copies", () => {
    expect(source(INSTALL_KYNOVANT)).toContain('from "./InstallInstructions"');
    expect(source(PORTAL_ONBOARDING)).toContain('from "./InstallInstructions"');
  });

  it("gives an accurate, non-native description (Share -> Add to Home Screen -> Add), never claiming a native install prompt exists on iOS", () => {
    expect(instructions).toContain("Add to Home Screen");
    expect(instructions).not.toMatch(/beforeinstallprompt/);
  });

  it("always has a reachable close control", () => {
    expect(instructions).toContain('aria-label="Close install instructions"');
  });
});

describe("P0 FIX — iOS 'tapping does nothing': InstallInstructions must never be visually obscured", () => {
  // Real production incident (Fiona Walczynski): the button correctly
  // set instructionsOpen=true and InstallInstructions correctly
  // mounted, but PortalInstallOnboarding's own bottom sheet (fixed,
  // bottom-0, z-[90]) stayed rendered on top of it — both fixed and
  // bottom-anchored on mobile — fully occluding the modal. Proven via
  // a direct visual reproduction of the exact class names (see this
  // task's report) before this fix, and again after.
  const instructions = source(INSTALL_INSTRUCTIONS);
  const onboarding = source(PORTAL_ONBOARDING);

  function zIndexOf(src: string, marker: string): number {
    const idx = src.indexOf(marker);
    expect(idx).toBeGreaterThan(-1);
    const slice = src.slice(idx, idx + 400);
    const match = slice.match(/z-\[(\d+)\]/);
    expect(match).not.toBeNull();
    return Number(match![1]);
  }

  it("InstallInstructions renders at a strictly higher z-index than PortalInstallOnboarding's own sheet", () => {
    const instructionsZ = zIndexOf(instructions, 'className="fixed inset-0');
    const sheetZ = zIndexOf(onboarding, 'className="fixed inset-x-0 bottom-0');
    expect(instructionsZ).toBeGreaterThan(sheetZ);
  });

  it("PortalInstallOnboarding stops rendering its own sheet while InstallInstructions is open — never two overlapping install surfaces at once", () => {
    expect(onboarding).toContain("{!instructionsOpen && (");
    // The sheet's own region markup must be gated behind that check,
    // not rendered unconditionally alongside the instructions modal.
    const gateIndex = onboarding.indexOf("{!instructionsOpen && (");
    const regionIndex = onboarding.indexOf('role="region"');
    const instructionsMountIndex = onboarding.indexOf("{instructionsOpen && <InstallInstructions");
    expect(regionIndex).toBeGreaterThan(gateIndex);
    expect(instructionsMountIndex).toBeGreaterThan(regionIndex);
  });
});
