export interface InstallEnvironment {
  userAgent: string;
  platform?: string;
  maxTouchPoints?: number;
  displayModeStandalone?: boolean;
  navigatorStandalone?: boolean;
}

// Install MECHANISM available on the current device/browser — never a
// device class (see isMobileDevice for that). Ordered from "best" to
// "least":
//   installed          — already running as an installed app; offer nothing.
//   native_prompt      — a live beforeinstallprompt event is held; one tap
//                        can open the browser's own install confirmation.
//   ios_instructions   — iOS/iPadOS Safari: no programmatic install exists,
//                        but the Share -> Add to Home Screen flow does.
//   ios_open_in_safari — iOS/iPadOS in a NON-Safari browser (Chrome/Firefox/
//                        Edge): those cannot create a real standalone PWA on
//                        iOS at all; the only honest guidance is "open this
//                        in Safari". Better than silently rendering nothing.
//   android_manual     — Android, no live beforeinstallprompt (fired too
//                        early and not yet re-fired, or a browser that never
//                        fires it such as Firefox): every major Android
//                        browser still has a manual "Add to Home screen"
//                        menu item. A single generic hint that is correct
//                        across Chrome / Samsung Internet / Firefox, never a
//                        browser-specific script that would be wrong in the
//                        others.
//   unsupported        — genuine dead end (e.g. desktop Firefox/Safari with
//                        no prompt): render nothing.
export type InstallSurface =
  | "installed"
  | "native_prompt"
  | "ios_instructions"
  | "ios_open_in_safari"
  | "android_manual"
  | "unsupported";

export function isStandaloneMode(env: Pick<InstallEnvironment, "displayModeStandalone" | "navigatorStandalone">): boolean {
  return Boolean(env.displayModeStandalone || env.navigatorStandalone);
}

export function isAppleMobileDevice(env: Pick<InstallEnvironment, "userAgent" | "platform" | "maxTouchPoints">): boolean {
  const ua = env.userAgent.toLowerCase();
  if (/iphone|ipad|ipod/.test(ua)) return true;
  return env.platform === "MacIntel" && Number(env.maxTouchPoints ?? 0) > 1;
}

export function isSafariFamily(userAgent: string): boolean {
  const ua = userAgent.toLowerCase();
  return /safari/.test(ua) && !/crios|fxios|edgios|chrome|android/.test(ua);
}

export function isAndroidDevice(userAgent: string): boolean {
  return /android/.test(userAgent.toLowerCase());
}

export function resolveInstallSurface(env: InstallEnvironment & { hasNativePrompt?: boolean }): InstallSurface {
  if (isStandaloneMode(env)) return "installed";
  if (env.hasNativePrompt) return "native_prompt";
  if (isAppleMobileDevice(env)) {
    return isSafariFamily(env.userAgent) ? "ios_instructions" : "ios_open_in_safari";
  }
  if (isAndroidDevice(env.userAgent)) return "android_manual";
  return "unsupported";
}

// True for a surface where a single user tap does something real (fires the
// native prompt, or opens the iOS Add-to-Home-Screen instructions). The two
// hint surfaces (ios_open_in_safari, android_manual) are informational only
// — no actionable control — so they are deliberately NOT "actionable".
export function isActionableInstallSurface(surface: InstallSurface): boolean {
  return surface === "native_prompt" || surface === "ios_instructions";
}

// Phone/tablet-class device, independent of install surface. Deliberately
// UA/touch-based rather than a CSS viewport-width heuristic: a desktop
// browser window resized narrow is still a desktop, mouse-driven session
// and must never be treated as "mobile" for onboarding purposes (Chrome
// on desktop can also fire beforeinstallprompt, which would otherwise be
// indistinguishable from Android Chrome by surface alone — see
// resolveInstallSurface, which only encodes install MECHANISM, not
// device class). Used to gate the Portal first-use install onboarding
// (components/pwa/PortalInstallOnboarding.tsx) to phones/tablets only —
// desktop keeps its existing, unobtrusive InstallKynovant affordance
// instead of an unprompted mobile-style sheet.
export function isMobileDevice(env: Pick<InstallEnvironment, "userAgent" | "platform" | "maxTouchPoints">): boolean {
  const ua = env.userAgent.toLowerCase();
  if (/android/.test(ua)) return true;
  return isAppleMobileDevice(env);
}

// Single decision point for "should the unprompted Portal onboarding
// sheet appear right now" — mobile device, AND an install surface that
// actually offers something to do (native prompt or iOS instructions).
// Excludes "installed" (nothing to do), the two hint surfaces
// (ios_open_in_safari / android_manual — a passive "use your browser
// menu" hint should never be an unprompted popup), and "unsupported"
// (nothing safe to offer — fails gracefully per the launch brief's
// explicit requirement, never a broken/dead install button). Those hint
// surfaces still appear in the always-available install affordances
// (the mobile account menu, /account) — just not as a first-run sheet.
export function shouldShowPortalInstallOnboarding(
  env: InstallEnvironment & { hasNativePrompt?: boolean },
): boolean {
  if (!isMobileDevice(env)) return false;
  return isActionableInstallSurface(resolveInstallSurface(env));
}
