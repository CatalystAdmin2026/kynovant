"use client";

// ─────────────────────────────────────────────────────────────
// Catalyst HQ — Progress Photos gallery for the check-in detail page.
//
// Receives already-signed URLs generated server-side (the coach never
// downloads a file or sees a permanent storage path). Thumbnails open
// a simple in-page lightbox (a controlled overlay, not a native
// <dialog>/confirm/alert — avoids the browser-modal pitfalls those
// carry) for a larger view; Escape or the backdrop closes it.
//
// Grouped by category (Front/Side/Back/Other) in that fixed display
// order regardless of upload order, so a coach scanning several
// occurrences sees views in a consistent place every time.
// ─────────────────────────────────────────────────────────────

import { useEffect, useMemo, useState } from "react";
import type { CheckInPhotoView } from "@/lib/db/check-in-photo-service";

const CATEGORY_LABEL: Record<string, string> = {
  front: "Front",
  side: "Side",
  back: "Back",
  other: "Other",
};

const CATEGORY_ORDER = ["front", "side", "back", "other"];

export default function CheckInPhotoGallery({ photos }: { photos: CheckInPhotoView[] }) {
  const [openIndex, setOpenIndex] = useState<number | null>(null);

  const ordered = useMemo(
    () =>
      [...photos].sort(
        (a, b) => CATEGORY_ORDER.indexOf(a.category) - CATEGORY_ORDER.indexOf(b.category),
      ),
    [photos],
  );

  useEffect(() => {
    if (openIndex === null) return;
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") setOpenIndex(null);
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [openIndex]);

  if (ordered.length === 0) return null;

  const active = openIndex !== null ? ordered[openIndex] : null;

  return (
    <>
      <div className="flex flex-wrap gap-2">
        {ordered.map((photo, i) => (
          <button
            key={photo.id}
            type="button"
            onClick={() => setOpenIndex(i)}
            disabled={!photo.signedUrl}
            className="relative w-20 h-20 shrink-0 rounded-sm overflow-hidden border border-white/[0.10] hover:border-gold/40 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
          >
            {photo.signedUrl ? (
              // eslint-disable-next-line @next/next/no-img-element -- signed URL, not a static asset Next can optimize
              <img src={photo.signedUrl} alt={`${CATEGORY_LABEL[photo.category] ?? photo.category} progress photo`} className="w-full h-full object-cover" />
            ) : (
              <div className="w-full h-full flex items-center justify-center bg-white/[0.03]">
                <span className="text-[8px] text-white/30">Unavailable</span>
              </div>
            )}
            <span className="absolute bottom-0 inset-x-0 bg-black/60 text-[8px] text-white/80 uppercase tracking-[0.1em] text-center py-0.5">
              {CATEGORY_LABEL[photo.category] ?? photo.category}
            </span>
          </button>
        ))}
      </div>

      {active && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label={`${CATEGORY_LABEL[active.category] ?? active.category} progress photo, larger view`}
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/85 p-6"
          onClick={() => setOpenIndex(null)}
        >
          {/* eslint-disable-next-line @next/next/no-img-element -- signed URL, not a static asset Next can optimize */}
          <img
            src={active.signedUrl}
            alt={`${CATEGORY_LABEL[active.category] ?? active.category} progress photo`}
            className="max-w-full max-h-full object-contain"
            onClick={(e) => e.stopPropagation()}
          />
          <button
            type="button"
            onClick={() => setOpenIndex(null)}
            aria-label="Close"
            className="absolute top-4 right-4 w-9 h-9 rounded-full bg-black/70 border border-white/20 text-white/80 hover:text-white flex items-center justify-center"
          >
            ✕
          </button>
        </div>
      )}
    </>
  );
}
