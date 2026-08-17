// Kynovant HQ — Coaching Snapshot KPI ring
//
// A restrained, static circular anchor for one KPI cell — the visual
// replacement for the old solid gray card background. Deliberately
// NOT a solid filled gold circle (the redesign brief explicitly rules
// that out) and deliberately NOT animated (six independently animating
// rings in one strip is the "game dashboard" effect the brief asks to
// avoid) — a fixed thin ring/arc communicates the same information
// without competing for attention next to five siblings.
//
// Two modes, chosen by whether `percent` is supplied:
//   percent present  — a real progress arc (0-100), used only where
//                       the metric genuinely means "how much of a
//                       whole" (30D Compliance, Profile Ready).
//   percent omitted  — a plain, full ring with no arc, used as a
//                       restrained outline anchor around a raw count,
//                       date icon, or "not available" glyph (Total
//                       Sessions, Program Week, Sets, Last Workout).
//
// Purely presentational — every color/percent this component ever
// receives is computed by its caller from real workspace data; it has
// no knowledge of what a "good" or "bad" value looks like.

interface KpiRingProps {
  size?: number;
  strokeWidth?: number;
  percent?: number | null;
  strokeColor?: string;
  trackColor?: string;
  children?: React.ReactNode;
}

const DEFAULT_SIZE = 56;
const DEFAULT_STROKE_WIDTH = 3;
export const KPI_RING_GOLD = "#C9A24D";
const DEFAULT_TRACK_COLOR = "rgba(255,255,255,0.08)";

export default function KpiRing({
  size = DEFAULT_SIZE,
  strokeWidth = DEFAULT_STROKE_WIDTH,
  percent = null,
  strokeColor = KPI_RING_GOLD,
  trackColor = DEFAULT_TRACK_COLOR,
  children,
}: KpiRingProps) {
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const hasArc = percent !== null && percent !== undefined;
  const clampedPercent = hasArc ? Math.max(0, Math.min(100, percent)) : 100;
  const dash = (clampedPercent / 100) * circumference;

  return (
    <div className="relative shrink-0" style={{ width: size, height: size }} aria-hidden>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="-rotate-90">
        <circle cx={size / 2} cy={size / 2} r={radius} fill="none" stroke={trackColor} strokeWidth={strokeWidth} />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke={strokeColor}
          strokeWidth={strokeWidth}
          strokeLinecap="round"
          strokeDasharray={`${dash} ${circumference}`}
        />
      </svg>
      <div className="absolute inset-0 flex items-center justify-center">{children}</div>
    </div>
  );
}
