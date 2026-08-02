"use client";

interface Props {
  estimatedMinutes?: number;
  confidence?: "certain" | "heuristic";
}

// Chip background/text pairs mirror StatusChip's dark-tone palette
// (components/ui/StatusChip.tsx) exactly for the ok/caution/high
// tiers this badge needs — kept as a plain <span> rather than
// <StatusChip> because the "~" heuristic-confidence marker needs its
// own reduced-opacity child, which StatusChip's label-only API can't
// render alongside the duration text.
const CHIP_STYLE = {
  ok: "bg-white/[0.06] text-white/45",
  caution: "bg-amber-500/10 text-amber-400",
  high: "bg-orange-500/10 text-orange-400",
} as const;

export default function DurationBadge({ estimatedMinutes, confidence }: Props) {
  if (!estimatedMinutes) {
    return (
      <span className="inline-flex items-center text-xs text-white/25 font-medium">
        Est. —
      </span>
    );
  }

  const isVeryLong = estimatedMinutes > 120;
  const isLong = estimatedMinutes > 90;
  const chipColor = isVeryLong
    ? CHIP_STYLE.high
    : isLong
      ? CHIP_STYLE.caution
      : CHIP_STYLE.ok;

  const tooltip =
    confidence === "certain"
      ? "Based on coach-defined section durations"
      : "Estimated from set counts and typical rest periods";

  return (
    <span
      title={tooltip}
      className={`inline-flex items-center gap-0.5 text-xs px-2 py-0.5 rounded-full font-medium ${chipColor}`}
    >
      Est. {estimatedMinutes} min
      {confidence === "heuristic" && (
        <span className="opacity-50 text-[10px]">~</span>
      )}
    </span>
  );
}
