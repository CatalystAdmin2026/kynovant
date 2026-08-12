import { describe, expect, it } from "vitest";
import manifest from "@/app/manifest";

describe("Kynovant web app manifest", () => {
  it("declares the minimum installability contract", () => {
    const data = manifest();

    expect(data.name).toBe("Kynovant");
    expect(data.short_name).toBe("Kynovant");
    expect(data.start_url).toBe("/");
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
