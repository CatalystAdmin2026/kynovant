// Kynovant Design System — shared helpers
//
// Tiny className joiner. No new dependency (clsx/tailwind-merge) —
// design-system components pass a small, fixed set of class strings
// so naive joining is sufficient and keeps the bundle dependency-free.

export type ClassValue = string | false | null | undefined;

export function cx(...classes: ClassValue[]): string {
  return classes.filter(Boolean).join(" ");
}
