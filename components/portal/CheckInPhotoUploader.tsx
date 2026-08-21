"use client";

// ─────────────────────────────────────────────────────────────
// Catalyst Portal — Progress Photos section for the weekly Check-In
// form.
//
// Mobile-first: a plain <input type="file" accept="image/*" multiple>
// per category triggers the device's native camera/library chooser
// (no `capture` attribute — that would force camera-only on some
// browsers and remove the library option). Each selected file
// uploads immediately and shows an optimistic local preview while in
// flight; a failed upload stays visible with a Retry control instead
// of silently disappearing.
//
// Owns no persistence logic itself — every upload/delete goes through
// the Server Actions in app/portal/check-ins/actions.ts, which
// re-verify ownership and the editable window server-side regardless
// of what this component allows the client to attempt.
//
// requiredViews is the occurrence's own HISTORICALLY-resolved set
// (from getPhotoPolicyAtDate, resolved at this occurrence's
// scheduledDate) — never recomputed here from today's live schedule.
// A subset of front/side/back, or empty for Optional. "Other" is
// never in requiredViews; it is always optional/uploadable.
// ─────────────────────────────────────────────────────────────

import { useCallback, useRef, useState } from "react";
import {
  uploadCheckInPhotoAction,
  deleteCheckInPhotoAction,
} from "@/app/portal/check-ins/actions";
import type { CheckInPhotoView } from "@/lib/db/check-in-photo-service";

export type PhotoCategory = "front" | "side" | "back" | "other";
export type PhotoRequirementMode = "required" | "optional" | "off";
export type PhotoViewName = "front" | "side" | "back";

const CATEGORIES: { key: PhotoCategory; label: string }[] = [
  { key: "front", label: "Front" },
  { key: "side", label: "Side" },
  { key: "back", label: "Back" },
  { key: "other", label: "Other" },
];

interface LocalPhoto {
  id: string; // real id once uploaded; a client-local temp id while pending/failed
  category: PhotoCategory;
  filename: string;
  previewUrl: string; // object URL (pending/failed) or signed URL (done)
  status: "uploading" | "done" | "error";
  errorMessage?: string;
  file?: File; // retained only for status==='error' retry
}

interface Props {
  checkInId?: string;
  // Resolves to a real checkInId, creating the draft first if this is
  // the very first thing the client interacts with (before any text
  // field has triggered the normal debounced autosave). Returns null
  // if that draft-creation attempt itself fails.
  ensureCheckInId: () => Promise<string | null>;
  initialPhotos: CheckInPhotoView[];
  requirement: PhotoRequirementMode;
  // Which specific views (subset of front/side/back) actually count
  // toward "Required" for THIS occurrence — coach-configured,
  // historically resolved. Ignored when requirement !== "required".
  requiredViews: PhotoViewName[];
  disabled?: boolean;
  onRequirementStatusChange?: (satisfied: boolean) => void;
}

function toLocalPhoto(p: CheckInPhotoView): LocalPhoto {
  return {
    id: p.id,
    category: p.category,
    filename: p.originalFilename,
    previewUrl: p.signedUrl,
    status: "done",
  };
}

export default function CheckInPhotoUploader({
  checkInId,
  ensureCheckInId,
  initialPhotos,
  requirement,
  requiredViews,
  disabled,
  onRequirementStatusChange,
}: Props) {
  const [photos, setPhotos] = useState<LocalPhoto[]>(() => initialPhotos.map(toLocalPhoto));
  const inputRefs = useRef<Partial<Record<PhotoCategory, HTMLInputElement | null>>>({});

  const reportStatus = useCallback(
    (next: LocalPhoto[]) => {
      if (!onRequirementStatusChange) return;
      const present = new Set(next.filter((p) => p.status !== "error").map((p) => p.category));
      onRequirementStatusChange(requiredViews.every((v) => present.has(v)));
    },
    [onRequirementStatusChange, requiredViews],
  );

  const uploadFile = useCallback(
    async (category: PhotoCategory, file: File, tempId: string) => {
      const id = checkInId ?? (await ensureCheckInId());
      if (!id) {
        setPhotos((prev) => {
          const next = prev.map((p) =>
            p.id === tempId ? { ...p, status: "error" as const, errorMessage: "Couldn't start your check-in. Try again." } : p,
          );
          reportStatus(next);
          return next;
        });
        return;
      }

      const formData = new FormData();
      formData.set("file", file);
      formData.set("category", category);
      const result = await uploadCheckInPhotoAction(id, formData);

      setPhotos((prev) => {
        const next = result.ok && result.photo
          ? prev.map((p) => (p.id === tempId ? { ...p, id: result.photo!.id, status: "done" as const } : p))
          : prev.map((p) =>
              p.id === tempId
                ? { ...p, status: "error" as const, errorMessage: result.error ?? "Upload failed. Please try again." }
                : p,
            );
        reportStatus(next);
        return next;
      });
    },
    [checkInId, ensureCheckInId, reportStatus],
  );

  const handleFilesSelected = useCallback(
    (category: PhotoCategory, files: FileList | null) => {
      if (!files || files.length === 0) return;
      for (const file of Array.from(files)) {
        const tempId = `tmp-${crypto.randomUUID()}`;
        const localPhoto: LocalPhoto = {
          id: tempId,
          category,
          filename: file.name,
          previewUrl: URL.createObjectURL(file),
          status: "uploading",
          file,
        };
        setPhotos((prev) => [...prev, localPhoto]);
        void uploadFile(category, file, tempId);
      }
    },
    [uploadFile],
  );

  const handleRetry = useCallback(
    (photo: LocalPhoto) => {
      if (!photo.file) return;
      setPhotos((prev) => prev.map((p) => (p.id === photo.id ? { ...p, status: "uploading", errorMessage: undefined } : p)));
      void uploadFile(photo.category, photo.file, photo.id);
    },
    [uploadFile],
  );

  const handleRemove = useCallback(
    async (photo: LocalPhoto) => {
      if (photo.status === "uploading") return; // let the in-flight upload settle first
      if (photo.status === "error") {
        setPhotos((prev) => {
          const next = prev.filter((p) => p.id !== photo.id);
          reportStatus(next);
          return next;
        });
        return;
      }
      // Optimistic removal — a failed delete restores the thumbnail
      // rather than silently leaving the client unsure whether it's
      // still attached.
      setPhotos((prev) => prev.filter((p) => p.id !== photo.id));
      const result = await deleteCheckInPhotoAction(photo.id);
      if (!result.ok) {
        setPhotos((prev) => {
          const next = [...prev, photo];
          reportStatus(next);
          return next;
        });
      } else {
        reportStatus(photos.filter((p) => p.id !== photo.id));
      }
    },
    [photos, reportStatus],
  );

  if (requirement === "off") return null;

  return (
    <div className="space-y-6">
      <p className="text-gray-400 text-xs -mt-2">
        Add photos to help your coach evaluate visual progress.
      </p>
      {CATEGORIES.map(({ key, label }) => {
        const isRequired =
          requirement === "required" && (requiredViews as PhotoCategory[]).includes(key);
        const categoryPhotos = photos.filter((p) => p.category === key);
        const satisfied = categoryPhotos.some((p) => p.status !== "error");
        return (
          <div key={key}>
            <div className="flex items-center gap-2 mb-2">
              <span className="text-[10px] text-gray-400 uppercase tracking-[0.3em]">{label}</span>
              {isRequired ? (
                <span
                  className={`text-[9px] uppercase tracking-[0.2em] px-1.5 py-0.5 rounded-sm border ${
                    satisfied
                      ? "border-emerald-500/30 text-emerald-400/80"
                      : "border-amber-500/30 text-amber-400/80"
                  }`}
                >
                  Required
                </span>
              ) : (
                <span className="text-[9px] text-gray-600 uppercase tracking-[0.2em]">Optional</span>
              )}
            </div>

            <div className="flex flex-wrap gap-2">
              {categoryPhotos.map((photo) => (
                <div key={photo.id} className="relative w-[72px] h-[72px] shrink-0">
                  {/* eslint-disable-next-line @next/next/no-img-element -- signed/object URLs, not a static asset Next can optimize */}
                  <img
                    src={photo.previewUrl}
                    alt={`${label} progress photo`}
                    className={`w-full h-full object-cover rounded-sm border ${
                      photo.status === "error" ? "border-red-500/40 opacity-50" : "border-white/[0.10]"
                    }`}
                  />
                  {photo.status === "uploading" && (
                    <div className="absolute inset-0 flex items-center justify-center bg-black/50 rounded-sm">
                      <span className="text-[9px] text-white/80 uppercase tracking-[0.15em]">Uploading…</span>
                    </div>
                  )}
                  {photo.status === "error" && (
                    <button
                      type="button"
                      onClick={() => handleRetry(photo)}
                      className="absolute inset-0 flex items-center justify-center bg-black/60 rounded-sm text-[9px] text-red-300 uppercase tracking-[0.1em]"
                    >
                      Retry
                    </button>
                  )}
                  {photo.status !== "uploading" && (
                    <button
                      type="button"
                      onClick={() => handleRemove(photo)}
                      aria-label={`Remove ${label.toLowerCase()} photo`}
                      className="absolute -top-2 -right-2 w-6 h-6 rounded-full bg-black border border-white/20 text-white/70 hover:text-white flex items-center justify-center text-xs"
                    >
                      ✕
                    </button>
                  )}
                </div>
              ))}

              <button
                type="button"
                disabled={disabled}
                onClick={() => inputRefs.current[key]?.click()}
                className="w-[72px] h-[72px] shrink-0 rounded-sm border border-dashed border-white/[0.15] text-gray-500 hover:text-gray-300 hover:border-white/30 disabled:opacity-40 disabled:cursor-not-allowed flex flex-col items-center justify-center gap-1 transition-colors"
              >
                <span className="text-lg leading-none">+</span>
                <span className="text-[8px] uppercase tracking-[0.1em]">Add Photo</span>
              </button>
              <input
                ref={(el) => {
                  inputRefs.current[key] = el;
                }}
                type="file"
                accept="image/png,image/jpeg,image/webp"
                multiple
                disabled={disabled}
                onChange={(e) => {
                  handleFilesSelected(key, e.target.files);
                  e.target.value = "";
                }}
                className="hidden"
              />
            </div>
            {photos.some((p) => p.category === key && p.status === "error") && (
              <p className="text-red-400 text-[10px] mt-1.5">
                {photos.find((p) => p.category === key && p.status === "error")?.errorMessage}
              </p>
            )}
          </div>
        );
      })}
    </div>
  );
}
