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
