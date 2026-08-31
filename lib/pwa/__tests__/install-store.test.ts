// ─────────────────────────────────────────────────────────────
// PWA install store — behavioural suite.
//
// This is the regression guard for the real defect: a captured
// beforeinstallprompt event must OUTLIVE component remounts / Portal
// navigation. It runs in the repo's node test env (no jsdom) against a
// hand-rolled EventTarget-based `window` — deliberately not adding DOM
// test infrastructure just for this (see vitest.config.ts).
// ─────────────────────────────────────────────────────────────

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  __resetInstallStoreForTests,
  consumeNativePrompt,
  ensureInstallStoreStarted,
  getInstallStoreServerVersion,
  getInstallStoreVersion,
  hasNativePrompt,
  isInstalledSignal,
  subscribeInstallStore,
} from "../install-store";

interface FakeWindow extends EventTarget {
  matchMedia: (q: string) => {
    matches: boolean;
    addEventListener: ReturnType<typeof vi.fn>;
    removeEventListener: ReturnType<typeof vi.fn>;
  };
}

function makeFakeWindow(): FakeWindow {
  const w = new EventTarget() as FakeWindow;
  w.matchMedia = () => ({
    matches: false,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
  });
  return w;
}

function makePromptEvent(outcome: "accepted" | "dismissed" | "reject") {
  const ev = new Event("beforeinstallprompt") as Event & {
    prompt: () => Promise<void>;
    userChoice: Promise<{ outcome: "accepted" | "dismissed"; platform: string }>;
  };
  ev.prompt =
    outcome === "reject"
      ? () => Promise.reject(new Error("stale event"))
      : () => Promise.resolve();
  ev.userChoice =
    outcome === "reject"
      ? // prompt() itself rejects first, so the store never awaits this —
        // keep it pending rather than an eagerly-rejected promise (which
        // would surface as an unhandled rejection).
        new Promise(() => {})
      : Promise.resolve({ outcome: outcome as "accepted" | "dismissed", platform: "web" });
  return ev;
}

// A prompt event whose prompt() call is observable and does NOT settle
// until the test releases it — the only way to interleave two consume
// calls while the first is still awaiting.
function makeDeferredPromptEvent() {
  let releasePrompt!: () => void;
  const promptSettled = new Promise<void>((resolve) => {
    releasePrompt = resolve;
  });
  const state = { promptCalls: 0 };
  const ev = new Event("beforeinstallprompt") as Event & {
    prompt: () => Promise<void>;
    userChoice: Promise<{ outcome: "accepted" | "dismissed"; platform: string }>;
  };
  ev.prompt = () => {
    state.promptCalls += 1;
    return promptSettled;
  };
  ev.userChoice = promptSettled.then(() => ({ outcome: "accepted" as const, platform: "web" }));
  return { ev, releasePrompt, state };
}

let fakeWindow: FakeWindow;

beforeEach(() => {
  __resetInstallStoreForTests();
  fakeWindow = makeFakeWindow();
  vi.stubGlobal("window", fakeWindow);
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  __resetInstallStoreForTests();
});

describe("ensureInstallStoreStarted — one listener set, attached once, never torn down", () => {
  it("attaches beforeinstallprompt / appinstalled exactly once no matter how many times it is called", () => {
    const addSpy = vi.spyOn(fakeWindow, "addEventListener");
    ensureInstallStoreStarted();
    ensureInstallStoreStarted();
    ensureInstallStoreStarted();

    const events = addSpy.mock.calls.map((c) => c[0]);
    expect(events.filter((e) => e === "beforeinstallprompt")).toHaveLength(1);
    expect(events.filter((e) => e === "appinstalled")).toHaveLength(1);
  });

  it("multiple subscribers do not each add their own window listener", () => {
    const addSpy = vi.spyOn(fakeWindow, "addEventListener");
    const un1 = subscribeInstallStore(() => {});
    const un2 = subscribeInstallStore(() => {});
    const un3 = subscribeInstallStore(() => {});

    expect(addSpy.mock.calls.filter((c) => c[0] === "beforeinstallprompt")).toHaveLength(1);
    un1();
    un2();
    un3();
  });

  it("is a no-op with no window (SSR)", () => {
    __resetInstallStoreForTests();
    vi.stubGlobal("window", undefined);
    expect(() => ensureInstallStoreStarted()).not.toThrow();
    expect(hasNativePrompt()).toBe(false);
  });
});

describe("beforeinstallprompt capture survives 'no consumer mounted yet'", () => {
  it("an event that fires BEFORE any subscriber exists is still held and observable later", () => {
    // Store started (as PwaInstallBoot would), but nothing is subscribed.
    ensureInstallStoreStarted();
    expect(hasNativePrompt()).toBe(false);

    const ev = makePromptEvent("accepted");
    const preventSpy = vi.spyOn(ev, "preventDefault");
    fakeWindow.dispatchEvent(ev);

    // Mini-infobar suppressed, event retained.
    expect(preventSpy).toHaveBeenCalledTimes(1);
    expect(hasNativePrompt()).toBe(true);

    // A consumer that subscribes only now still sees it.
    const listener = vi.fn();
    subscribeInstallStore(listener);
    expect(hasNativePrompt()).toBe(true);
  });

  it("notifies subscribers and bumps the version when the event is captured", () => {
    const listener = vi.fn();
    subscribeInstallStore(listener);
    const v0 = getInstallStoreVersion();

    fakeWindow.dispatchEvent(makePromptEvent("accepted"));

    expect(listener).toHaveBeenCalledTimes(1);
    expect(getInstallStoreVersion()).toBeGreaterThan(v0);
  });

  it("unsubscribing stops notifications (but the window listener stays)", () => {
    const listener = vi.fn();
    const unsubscribe = subscribeInstallStore(listener);
    unsubscribe();

    fakeWindow.dispatchEvent(makePromptEvent("accepted"));

    expect(listener).not.toHaveBeenCalled();
    // The capture itself still happened — the store is tab-lifetime.
    expect(hasNativePrompt()).toBe(true);
  });
});

describe("appinstalled", () => {
  it("clears the held prompt, sets the installed signal, and notifies", () => {
    const listener = vi.fn();
    subscribeInstallStore(listener);
    fakeWindow.dispatchEvent(makePromptEvent("accepted"));
    expect(hasNativePrompt()).toBe(true);

    listener.mockClear();
    fakeWindow.dispatchEvent(new Event("appinstalled"));

    expect(hasNativePrompt()).toBe(false);
    expect(isInstalledSignal()).toBe(true);
    expect(listener).toHaveBeenCalled();
  });
});

describe("consumeNativePrompt — single-use, gesture-driven, never throws", () => {
  beforeEach(() => {
    ensureInstallStoreStarted();
  });

  it("returns 'unavailable' when no event is held (no auto-install path)", async () => {
    await expect(consumeNativePrompt()).resolves.toBe("unavailable");
  });

  it("returns the accepted outcome and then clears the event (single-use)", async () => {
    fakeWindow.dispatchEvent(makePromptEvent("accepted"));
    await expect(consumeNativePrompt()).resolves.toBe("accepted");
    expect(hasNativePrompt()).toBe(false);
    // A second call has nothing to consume.
    await expect(consumeNativePrompt()).resolves.toBe("unavailable");
  });

  it("returns the dismissed outcome and clears the event", async () => {
    fakeWindow.dispatchEvent(makePromptEvent("dismissed"));
    await expect(consumeNativePrompt()).resolves.toBe("dismissed");
    expect(hasNativePrompt()).toBe(false);
  });

  it("resolves to 'unavailable' (never throws) when a stale event rejects prompt()/userChoice", async () => {
    fakeWindow.dispatchEvent(makePromptEvent("reject"));
    await expect(consumeNativePrompt()).resolves.toBe("unavailable");
    expect(hasNativePrompt()).toBe(false);
  });
});

describe("consumeNativePrompt — a captured event is a single-CONSUMER resource (P2 regression)", () => {
  beforeEach(() => {
    ensureInstallStoreStarted();
  });

  it("two concurrent consume calls invoke the browser prompt exactly once; the second gets 'unavailable'", async () => {
    const { ev, releasePrompt, state } = makeDeferredPromptEvent();
    fakeWindow.dispatchEvent(ev);
    expect(hasNativePrompt()).toBe(true);

    // Both start before the first prompt() settles.
    const callA = consumeNativePrompt();
    const callB = consumeNativePrompt();

    // Let microtasks run up to (but not past) the pending prompt().
    await Promise.resolve();
    await Promise.resolve();

    // BEFORE releasing the first prompt: exactly one prompt() invocation,
    // and the event is already reserved (no longer advertised).
    expect(state.promptCalls).toBe(1);
    expect(hasNativePrompt()).toBe(false);

    releasePrompt();
    const [outcomeA, outcomeB] = await Promise.all([callA, callB]);

    // First caller consumed it; second caller never could.
    expect(outcomeA).toBe("accepted");
    expect(outcomeB).toBe("unavailable");
    // Still exactly one invocation after everything settles.
    expect(state.promptCalls).toBe(1);
  });

  it("the reservation is per captured event — a NEW beforeinstallprompt is still consumable exactly once", async () => {
    // Event A: concurrent consume, one prompt call.
    const a = makeDeferredPromptEvent();
    fakeWindow.dispatchEvent(a.ev);
    const a1 = consumeNativePrompt();
    const a2 = consumeNativePrompt();
    await Promise.resolve();
    await Promise.resolve();
    expect(a.state.promptCalls).toBe(1);
    a.releasePrompt();
    await Promise.all([a1, a2]);
    expect(hasNativePrompt()).toBe(false);

    // Event B fires later — the store is NOT permanently locked.
    const b = makeDeferredPromptEvent();
    fakeWindow.dispatchEvent(b.ev);
    expect(hasNativePrompt()).toBe(true);

    const b1 = consumeNativePrompt();
    const b2 = consumeNativePrompt();
    await Promise.resolve();
    await Promise.resolve();
    expect(b.state.promptCalls).toBe(1);
    b.releasePrompt();
    const [rb1, rb2] = await Promise.all([b1, b2]);
    expect(rb1).toBe("accepted");
    expect(rb2).toBe("unavailable");
    expect(b.state.promptCalls).toBe(1);
  });

  it("subscribers are notified synchronously on reservation, so UI stops advertising the event", async () => {
    const listener = vi.fn();
    subscribeInstallStore(listener);
    const { ev, releasePrompt } = makeDeferredPromptEvent();
    fakeWindow.dispatchEvent(ev); // capture -> notify #1
    listener.mockClear();

    const call = consumeNativePrompt(); // reserve -> notify #2, before any await settles
    expect(listener).toHaveBeenCalledTimes(1);
    expect(hasNativePrompt()).toBe(false);

    releasePrompt();
    await call;
  });

  it("a rejecting event, once reserved, never becomes actionable again", async () => {
    fakeWindow.dispatchEvent(makePromptEvent("reject"));
    await expect(consumeNativePrompt()).resolves.toBe("unavailable");
    expect(hasNativePrompt()).toBe(false);
    // Retry after rejection: still nothing to consume.
    await expect(consumeNativePrompt()).resolves.toBe("unavailable");
  });
});

describe("snapshots", () => {
  it("server snapshot is a stable constant", () => {
    expect(getInstallStoreServerVersion()).toBe(0);
    ensureInstallStoreStarted();
    fakeWindow.dispatchEvent(makePromptEvent("accepted"));
    expect(getInstallStoreServerVersion()).toBe(0);
  });

  it("client version is monotonic across captures", () => {
    subscribeInstallStore(() => {});
    const a = getInstallStoreVersion();
    fakeWindow.dispatchEvent(makePromptEvent("accepted"));
    const b = getInstallStoreVersion();
    fakeWindow.dispatchEvent(new Event("appinstalled"));
    const c = getInstallStoreVersion();
    expect(b).toBeGreaterThan(a);
    expect(c).toBeGreaterThan(b);
  });
});
