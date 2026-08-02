// Kynovant Design System — canonical severity color source
//
// Single source of truth for status/severity dot and text colors
// across HQ. Values mirror StatusChip's dark-tone map exactly
// (components/ui/StatusChip.tsx) so a bare dot or inline number
// always agrees with a neighboring StatusChip/Badge for the same
// underlying state. Use StatusChip/Badge directly when rendering a
// full pill; use SEVERITY_DOT/SEVERITY_TEXT only for bare dots,
// progress-bar fills, or inline colored numbers that can't be a
// pill. Each domain (attention level, compliance %, PIL finding
// severity, check-in status, ...) should map its own vocabulary
// into this shared Severity type via a small local function — this
// module does not know about any domain-specific concept.

export type Severity = "ok" | "caution" | "high" | "critical" | "unknown";

export const SEVERITY_DOT: Record<Severity, string> = {
  ok: "bg-white/25",
  caution: "bg-amber-400",
  high: "bg-orange-400",
  critical: "bg-red-400",
  unknown: "bg-white/15",
};

export const SEVERITY_TEXT: Record<Severity, string> = {
  ok: "text-white/45",
  caution: "text-amber-400",
  high: "text-orange-400",
  critical: "text-red-400",
  unknown: "text-white/25",
};

// Translucent fill for progress/threshold bars — same hues as
// SEVERITY_DOT, tuned for a larger filled area.
export const SEVERITY_BAR: Record<Severity, string> = {
  ok: "bg-white/30",
  caution: "bg-amber-400/80",
  high: "bg-orange-400/80",
  critical: "bg-red-400/80",
  unknown: "bg-white/15",
};
