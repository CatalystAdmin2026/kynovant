"use client";

interface Props {
  estimatedMinutes?: number;
  confidence?: "certain" | "heuristic";
}

export default function DurationBadge({ estimatedMinutes, confidence }: Props) {
  if (!estimatedMinutes) {
    return (
      <span className="inline-flex items-center text-xs text-gray-400 font-medium">
        Est. —
      </span>
    );
  }

  const isVeryLong = estimatedMinutes > 120;
  const isLong = estimatedMinutes > 90;
  const chipColor = isVeryLong
    ? "bg-orange-100 text-orange-700"
    : isLong
      ? "bg-amber-100 text-amber-700"
      : "bg-gray-100 text-gray-600";

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
