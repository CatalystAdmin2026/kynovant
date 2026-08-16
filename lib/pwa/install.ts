export interface InstallEnvironment {
  userAgent: string;
  platform?: string;
  maxTouchPoints?: number;
  displayModeStandalone?: boolean;
  navigatorStandalone?: boolean;
}

export type InstallSurface = "installed" | "native_prompt" | "ios_instructions" | "unsupported";

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

export function resolveInstallSurface(env: InstallEnvironment & { hasNativePrompt?: boolean }): InstallSurface {
  if (isStandaloneMode(env)) return "installed";
  if (env.hasNativePrompt) return "native_prompt";
  if (isAppleMobileDevice(env) && isSafariFamily(env.userAgent)) return "ios_instructions";
  return "unsupported";
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
// Excludes "installed" (nothing to do) and "unsupported" (nothing safe
// to offer — fails gracefully per the launch brief's explicit
// requirement, never a broken/dead install button).
export function shouldShowPortalInstallOnboarding(
  env: InstallEnvironment & { hasNativePrompt?: boolean },
): boolean {
  if (!isMobileDevice(env)) return false;
  const surface = resolveInstallSurface(env);
  return surface === "native_prompt" || surface === "ios_instructions";
}
