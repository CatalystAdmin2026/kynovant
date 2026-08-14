import { describe, expect, it } from "vitest";
import {
  isAppleMobileDevice,
  isSafariFamily,
  isStandaloneMode,
  resolveInstallSurface,
} from "../install";

const IPHONE_SAFARI =
  "Mozilla/5.0 (iPhone; CPU iPhone OS 17_4 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Mobile/15E148 Safari/604.1";
const ANDROID_CHROME =
  "Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Mobile Safari/537.36";
const IOS_CHROME =
  "Mozilla/5.0 (iPhone; CPU iPhone OS 17_4 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/124.0.0.0 Mobile/15E148 Safari/604.1";

describe("PWA install surface detection", () => {
  it("treats display-mode and iOS navigator standalone as installed", () => {
    expect(isStandaloneMode({ displayModeStandalone: true })).toBe(true);
    expect(isStandaloneMode({ navigatorStandalone: true })).toBe(true);
    expect(resolveInstallSurface({ userAgent: IPHONE_SAFARI, navigatorStandalone: true })).toBe("installed");
  });

  it("prefers native beforeinstallprompt support when available", () => {
    expect(resolveInstallSurface({ userAgent: ANDROID_CHROME, hasNativePrompt: true })).toBe("native_prompt");
  });

  it("offers instructions for iPhone and iPad Safari only", () => {
    expect(isAppleMobileDevice({ userAgent: IPHONE_SAFARI })).toBe(true);
    expect(isSafariFamily(IPHONE_SAFARI)).toBe(true);
    expect(resolveInstallSurface({ userAgent: IPHONE_SAFARI })).toBe("ios_instructions");
    expect(resolveInstallSurface({ userAgent: IOS_CHROME })).toBe("unsupported");
  });

  it("detects modern iPadOS Safari reporting a Mac platform", () => {
    expect(isAppleMobileDevice({
      userAgent: "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Safari/605.1.15",
      platform: "MacIntel",
      maxTouchPoints: 5,
    })).toBe(true);
  });
});
