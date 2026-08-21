import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

function source(file: string) {
  return readFileSync(resolve(process.cwd(), file), "utf8");
}

describe("HQ unread-count polling architecture", () => {
  it("has one visibility-aware polling owner with cleanup and overlap protection", () => {
    const provider = source("components/hq/HQUnreadCountProvider.tsx");

    expect(provider.match(/setInterval\(/g)).toHaveLength(1);
    expect(provider).toContain("document.visibilityState");
    expect(provider).toContain('document.addEventListener("visibilitychange"');
    expect(provider).toContain("inFlightRef.current");
    expect(provider).toContain("AbortController");
    expect(provider).toContain("window.clearInterval(interval)");
    expect(provider).toContain('document.removeEventListener("visibilitychange"');
    expect(provider).toContain("inFlightRef.current?.abort()");
    expect(provider).toContain("30000");
  });

  it("shares the provider value between desktop and mobile navigation", () => {
    const shell = source("components/hq/HQShell.tsx");
    const topBar = source("components/hq/HQTopBar.tsx");
    const mobileNav = source("components/hq/HQMobileNav.tsx");

    expect(shell.match(/<HQUnreadCountProvider>/g)).toHaveLength(1);
    expect(topBar).toContain("useHQUnreadCount");
    expect(mobileNav).toContain("useHQUnreadCount");
    expect(topBar).not.toContain("/api/internal/hq/messages/unread-count");
    expect(mobileNav).not.toContain("/api/internal/hq/messages/unread-count");
    expect(topBar).not.toContain("setInterval");
    expect(mobileNav).not.toContain("setInterval");
  });

  it("refreshes the shared badge when message views open or mark messages read", () => {
    const list = source("components/hq/messages/MessagesListClient.tsx");
    const thread = source("components/hq/messages/MessageThreadClient.tsx");

    expect(list).toContain("refreshUnreadMessageCount();");
    expect(thread).toContain("refreshUnreadMessageCount();");
    expect(thread).toContain("method: \"PATCH\"");
  });
});
