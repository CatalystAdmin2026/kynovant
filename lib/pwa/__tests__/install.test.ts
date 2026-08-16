import { describe, expect, it } from "vitest";
import {
  isAppleMobileDevice,
  isMobileDevice,
  isSafariFamily,
  isStandaloneMode,
  resolveInstallSurface,
  shouldShowPortalInstallOnboarding,
} from "../install";

const IPHONE_SAFARI =
  "Mozilla/5.0 (iPhone; CPU iPhone OS 17_4 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Mobile/15E148 Safari/604.1";
const ANDROID_CHROME =
  "Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Mobile Safari/537.36";
const IOS_CHROME =
  "Mozilla/5.0 (iPhone; CPU iPhone OS 17_4 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/124.0.0.0 Mobile/15E148 Safari/604.1";
const DESKTOP_CHROME =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36";
const DESKTOP_FIREFOX =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:125.0) Gecko/20100101 Firefox/125.0";

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

describe("isMobileDevice — device class, independent of install surface", () => {
  it("treats Android and iPhone as mobile", () => {
    expect(isMobileDevice({ userAgent: ANDROID_CHROME })).toBe(true);
    expect(isMobileDevice({ userAgent: IPHONE_SAFARI })).toBe(true);
    expect(isMobileDevice({ userAgent: IOS_CHROME })).toBe(true); // Chrome on iOS is still an iPhone
  });

  it("treats desktop Chrome and Firefox as NOT mobile, even though Chrome desktop can also fire beforeinstallprompt", () => {
    expect(isMobileDevice({ userAgent: DESKTOP_CHROME, platform: "MacIntel", maxTouchPoints: 0 })).toBe(false);
    expect(isMobileDevice({ userAgent: DESKTOP_FIREFOX, platform: "Win32", maxTouchPoints: 0 })).toBe(false);
  });

  it("still treats iPadOS Safari (reporting as Mac) as mobile via the same touch-point heuristic as isAppleMobileDevice", () => {
    expect(isMobileDevice({
      userAgent: "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Safari/605.1.15",
      platform: "MacIntel",
      maxTouchPoints: 5,
    })).toBe(true);
  });
});

describe("shouldShowPortalInstallOnboarding — the single decision point for the Portal first-use sheet", () => {
  it("shows for Android Chrome with a live native prompt", () => {
    expect(shouldShowPortalInstallOnboarding({ userAgent: ANDROID_CHROME, hasNativePrompt: true })).toBe(true);
  });

  it("shows for iPhone Safari (iOS instructions path)", () => {
    expect(shouldShowPortalInstallOnboarding({ userAgent: IPHONE_SAFARI })).toBe(true);
  });

  it("never shows on desktop, even with a live native prompt (Chrome desktop is also install-capable, but not mobile)", () => {
    expect(shouldShowPortalInstallOnboarding({ userAgent: DESKTOP_CHROME, hasNativePrompt: true, platform: "MacIntel", maxTouchPoints: 0 })).toBe(false);
  });

  it("never shows once already installed (standalone), regardless of device class", () => {
    expect(shouldShowPortalInstallOnboarding({ userAgent: ANDROID_CHROME, hasNativePrompt: true, displayModeStandalone: true })).toBe(false);
    expect(shouldShowPortalInstallOnboarding({ userAgent: IPHONE_SAFARI, navigatorStandalone: true })).toBe(false);
  });

  it("never shows for an unsupported mobile browser (e.g. Chrome on iOS, no native prompt, not Safari)", () => {
    expect(shouldShowPortalInstallOnboarding({ userAgent: IOS_CHROME })).toBe(false);
  });

  it("never shows on desktop Firefox, which offers neither a native prompt nor iOS instructions", () => {
    expect(shouldShowPortalInstallOnboarding({ userAgent: DESKTOP_FIREFOX, platform: "Win32", maxTouchPoints: 0 })).toBe(false);
  });
});
