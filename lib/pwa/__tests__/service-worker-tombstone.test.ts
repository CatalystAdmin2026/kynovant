// ─────────────────────────────────────────────────────────────
// Emergency tombstone (public/sw-kill.js) — behavioural probe.
//
// P3-1 regression: a single client.navigate() rejection during the
// tombstone's `activate` cleanup must be CONTAINED — it must not become
// an unhandled rejection, must not block navigation of the other
// clients, and must not undo cache cleanup / unregister.
//
// The repo has no browser/SW test env, so the worker body is executed
// in-process with SW globals (`self`, `caches`, `console`) supplied as
// function parameters. `Promise` / `setTimeout` / `Error` are the real
// realm intrinsics (not shadowed), so async/await and Promise.allSettled
// behave normally and there is no cross-realm promise mismatch.
// ─────────────────────────────────────────────────────────────

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";

const TOMBSTONE_SRC = readFileSync(resolve(process.cwd(), "public/sw-kill.js"), "utf8");

interface RunResult {
  calls: {
    skipWaiting: number;
    cacheKeys: number;
    cacheDeletes: string[];
    unregister: number;
    matchAll: number;
    navigate: string[];
  };
  waitUntil: Promise<unknown> | undefined;
}

function loadTombstone(navResults: Array<"ok" | "reject">): RunResult {
  const listeners: Record<string, (event: unknown) => void> = {};
  const calls: RunResult["calls"] = {
    skipWaiting: 0,
    cacheKeys: 0,
    cacheDeletes: [],
    unregister: 0,
    matchAll: 0,
    navigate: [],
  };

  const windowClients = navResults.map((result, index) => ({
    url: `https://www.kynovant.com/p${index}`,
    navigate(url: string) {
      calls.navigate.push(url);
      return result === "reject"
        ? Promise.reject(new Error("nav fail"))
        : Promise.resolve(undefined);
    },
  }));

  const mockCaches = {
    keys() {
      calls.cacheKeys += 1;
      return Promise.resolve(["k1", "k2"]);
    },
    delete(key: string) {
      calls.cacheDeletes.push(key);
      return Promise.resolve(true);
    },
  };

  const mockSelf = {
    addEventListener(type: string, fn: (event: unknown) => void) {
      listeners[type] = fn;
    },
    skipWaiting() {
      calls.skipWaiting += 1;
      return Promise.resolve();
    },
    caches: mockCaches,
    registration: {
      unregister() {
        calls.unregister += 1;
        return Promise.resolve(true);
      },
    },
    clients: {
      matchAll() {
        calls.matchAll += 1;
        return Promise.resolve(windowClients);
      },
    },
  };

  // Deliberate, isolated harness: run the shipped worker body with SW
  // globals as params (see file header). `no-new-func` is not enabled in
  // this repo, so no disable directive is needed.
  const factory = new Function("self", "caches", "console", TOMBSTONE_SRC);
  factory(mockSelf, mockCaches, { info() {} });

  expect(typeof listeners.install).toBe("function");
  expect(typeof listeners.activate).toBe("function");

  listeners.install({});

  let waitUntil: Promise<unknown> | undefined;
  listeners.activate({
    waitUntil(promise: Promise<unknown>) {
      waitUntil = promise;
    },
  });

  return { calls, waitUntil };
}

let unhandled: unknown[] = [];
const onUnhandled = (reason: unknown) => {
  unhandled.push(reason);
};

afterEach(() => {
  process.off("unhandledRejection", onUnhandled);
  unhandled = [];
  vi.restoreAllMocks();
});

describe("tombstone activate — a client.navigate() rejection is contained", () => {
  it("settles cleanly with one rejecting and one succeeding client; no unhandled rejection", async () => {
    unhandled = [];
    process.on("unhandledRejection", onUnhandled);

    const { calls, waitUntil } = loadTombstone(["reject", "ok"]);
    expect(waitUntil).toBeInstanceOf(Promise);

    // The cleanup promise resolves — never rejects. (If it rejected,
    // this await would throw and fail the test.)
    await waitUntil;

    // Give the microtask + next-tick queue room so any stray unhandled
    // rejection would have surfaced.
    await new Promise((r) => setTimeout(r, 25));

    // P3-1: zero unhandled rejections (FAILS against 94be077's bare
    // `for (…) client.navigate(client.url)`).
    expect(unhandled).toEqual([]);

    // Navigation attempted exactly once per client — both, despite one
    // rejecting. No retry / loop.
    expect(calls.navigate).toEqual([
      "https://www.kynovant.com/p0",
      "https://www.kynovant.com/p1",
    ]);

    // Cache cleanup and unregister still ran (a nav failure must not
    // undo them).
    expect(calls.skipWaiting).toBe(1);
    expect(calls.cacheKeys).toBe(1);
    expect(calls.cacheDeletes).toEqual(["k1", "k2"]);
    expect(calls.unregister).toBe(1);
    expect(calls.matchAll).toBe(1);
  });

  it("all clients rejecting still settles cleanly and still unregisters", async () => {
    unhandled = [];
    process.on("unhandledRejection", onUnhandled);

    const { calls, waitUntil } = loadTombstone(["reject", "reject", "reject"]);
    await waitUntil;
    await new Promise((r) => setTimeout(r, 25));

    expect(unhandled).toEqual([]);
    expect(calls.navigate).toHaveLength(3);
    expect(calls.unregister).toBe(1);
    expect(calls.cacheDeletes).toEqual(["k1", "k2"]);
  });

  it("no window clients → still settles, still unregisters", async () => {
    unhandled = [];
    process.on("unhandledRejection", onUnhandled);

    const { calls, waitUntil } = loadTombstone([]);
    await waitUntil;
    await new Promise((r) => setTimeout(r, 25));

    expect(unhandled).toEqual([]);
    expect(calls.navigate).toEqual([]);
    expect(calls.unregister).toBe(1);
  });

  it("does not schedule retries or timers", () => {
    expect(TOMBSTONE_SRC).not.toMatch(/setInterval|setTimeout/);
    expect(TOMBSTONE_SRC).toMatch(/Promise\.allSettled\(/);
    // Exactly one navigate CALL SITE (comments may mention it).
    expect((TOMBSTONE_SRC.match(/\.navigate\(\s*client\.url\s*\)/g) ?? []).length).toBe(1);
  });
});
