import { describe, expect, it } from "vitest";
import manifest from "@/app/manifest";

describe("Kynovant web app manifest", () => {
  it("declares the minimum installability contract", () => {
    const data = manifest();

    expect(data.name).toBe("Kynovant");
    expect(data.short_name).toBe("Kynovant");
    // P0 fix: start_url is the role-agnostic PWA launch delegator
    // (app/app/route.ts), never the marketing homepage or a single
    // hardcoded role destination — see that route's header comment.
    expect(data.start_url).toBe("/app");
    expect(data.start_url).not.toBe("/");
    // scope stays broad — the whole app counts as "inside" the
    // installed PWA, not just the launch route itself.
    expect(data.scope).toBe("/");
    expect(data.display).toBe("standalone");
    expect(data.theme_color).toBe("#080909");
    expect(data.background_color).toBe("#080909");
    expect(data.icons).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ sizes: "192x192", type: "image/png" }),
        expect.objectContaining({ sizes: "512x512", type: "image/png" }),
        expect.objectContaining({ purpose: "maskable" }),
      ]),
    );
  });
});
