import { describe, it, expect } from "vitest";
import { resolvePostLoginRedirect, isSafeRelativePath } from "../redirect";

describe("resolvePostLoginRedirect — role fallbacks", () => {
  it("sends an invited/activated coach into HQ when no next param is present", () => {
    expect(resolvePostLoginRedirect(null, "coach")).toBe("/hq");
  });

  it("sends admin to /admin and client to /portal", () => {
    expect(resolvePostLoginRedirect(null, "admin")).toBe("/admin");
    expect(resolvePostLoginRedirect(null, "client")).toBe("/portal");
  });

  it("falls back to /portal for an unrecognized role", () => {
    expect(resolvePostLoginRedirect(null, "not-a-real-role")).toBe("/portal");
  });
});

describe("resolvePostLoginRedirect — authorized next param", () => {
  it("honors an allowed next destination for the role", () => {
    expect(resolvePostLoginRedirect("/hq/clients", "coach")).toBe("/hq/clients");
    expect(resolvePostLoginRedirect("/account", "coach")).toBe("/account");
    expect(resolvePostLoginRedirect("/admin/coaches", "admin")).toBe("/admin/coaches");
    expect(resolvePostLoginRedirect("/overwatch", "admin")).toBe("/overwatch");
  });

  it("matches an exact prefix (no trailing slash) as authorized", () => {
    expect(resolvePostLoginRedirect("/hq", "coach")).toBe("/hq");
  });
});

describe("resolvePostLoginRedirect — privilege boundaries (coach cannot reach /admin)", () => {
  it("rejects a coach's next param pointing at /admin and falls back to /hq", () => {
    expect(resolvePostLoginRedirect("/admin", "coach")).toBe("/hq");
    expect(resolvePostLoginRedirect("/admin/coaches", "coach")).toBe("/hq");
    expect(resolvePostLoginRedirect("/overwatch", "coach")).toBe("/hq");
  });

  it("rejects a client's next param pointing at /hq and falls back to /portal", () => {
    expect(resolvePostLoginRedirect("/hq", "client")).toBe("/portal");
    expect(resolvePostLoginRedirect("/overwatch", "client")).toBe("/portal");
  });

  it("does not treat a prefix-only match without a boundary as authorized (e.g. /hqxyz for coach is not /hq)", () => {
    // "/hqxyz" should not satisfy the coach's "/hq" prefix check.
    expect(resolvePostLoginRedirect("/hqxyz", "coach")).toBe("/hq");
  });
});

describe("resolvePostLoginRedirect — open-redirect rejection", () => {
  it("rejects protocol-relative next params", () => {
    expect(resolvePostLoginRedirect("//evil.com", "coach")).toBe("/hq");
  });

  it("rejects absolute URLs", () => {
    expect(resolvePostLoginRedirect("https://evil.com", "coach")).toBe("/hq");
    expect(resolvePostLoginRedirect("http://evil.com/hq", "coach")).toBe("/hq");
  });

  it("rejects a non-slash-prefixed next param", () => {
    expect(resolvePostLoginRedirect("evil.com", "coach")).toBe("/hq");
  });

  it("rejects a URL-encoded protocol-relative or absolute payload after decoding", () => {
    expect(resolvePostLoginRedirect("%2F%2Fevil.com", "coach")).toBe("/hq");
    expect(resolvePostLoginRedirect(encodeURIComponent("https://evil.com"), "coach")).toBe("/hq");
  });

  it("falls back safely on a malformed percent-encoding instead of throwing", () => {
    expect(resolvePostLoginRedirect("%", "coach")).toBe("/hq");
  });
});

describe("isSafeRelativePath", () => {
  it("accepts plain internal paths", () => {
    expect(isSafeRelativePath("/hq")).toBe(true);
    expect(isSafeRelativePath("/hq/clients/123")).toBe(true);
  });

  it("rejects protocol-relative, absolute, and non-slash paths", () => {
    expect(isSafeRelativePath("//evil.com")).toBe(false);
    expect(isSafeRelativePath("https://evil.com")).toBe(false);
    expect(isSafeRelativePath("evil.com")).toBe(false);
    expect(isSafeRelativePath("javascript://evil")).toBe(false);
  });
});
