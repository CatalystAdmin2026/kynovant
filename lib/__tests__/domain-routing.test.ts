import { describe, expect, it } from "vitest";
import { hostBrand } from "@/lib/domain-routing";

describe("hostBrand", () => {
  it("classifies production hosts with or without a port", () => {
    expect(hostBrand("kynovant.com")).toBe("kynovant");
    expect(hostBrand("www.kynovant.com:3000")).toBe("kynovant");
    expect(hostBrand("catalystcoachingelite.com")).toBe("catalyst");
    expect(hostBrand("www.catalystcoachingelite.com:3000")).toBe("catalyst");
  });

  it("leaves local and preview hosts unclassified", () => {
    expect(hostBrand("localhost:3000")).toBeNull();
    expect(hostBrand("example.vercel.app")).toBeNull();
  });
});
