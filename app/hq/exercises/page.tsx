"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { Star } from "lucide-react";
import HQPageHeader from "@/components/hq/HQPageHeader";

// ─────────────────────────────────────────────────────────────
// TYPES
// ─────────────────────────────────────────────────────────────

interface ExerciseRow {
  id: string;
  name: string;
  slug: string;
  status: string;
  scope: string;
  classification: string;
  movementPattern: string;
  difficulty: string;
  primaryMuscleGroup: string | null;
  fatigueCost: number | null;
  isFavorited: boolean;
}

// ─────────────────────────────────────────────────────────────
// FILTER OPTIONS
// ─────────────────────────────────────────────────────────────

const MUSCLE_GROUPS = [
  "chest", "front_deltoid", "lateral_deltoid", "rear_deltoid",
  "upper_back", "lats", "rhomboids", "trapezius",
  "triceps", "biceps", "brachialis", "brachioradialis", "forearms",
  "rectus_abdominis", "obliques", "transverse_abdominis", "spinal_erectors", "multifidus",
  "glutes", "hip_flexors", "adductors", "abductors",
  "quadriceps", "hamstrings", "calves", "tibialis", "cardiovascular",
] as const;

const STATUS_OPTIONS = [
  { value: "active", label: "Active" },
  { value: "draft", label: "Draft" },
  { value: "archived", label: "Archived" },
  { value: "all", label: "All" },
];

// ─────────────────────────────────────────────────────────────
// HELPERS
// ─────────────────────────────────────────────────────────────

function fmtLabel(s: string) {
  return s.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

function statusCls(s: string) {
  if (s === "active") return "bg-emerald-500/10 text-emerald-400 border border-emerald-500/20";
  if (s === "archived") return "bg-gray-500/10 text-gray-500 border border-gray-500/20";
  return "bg-amber-500/10 text-amber-400 border border-amber-500/20";
}

function scopeCls(s: string) {
  if (s === "system") return "text-white/25 border border-white/10";
  if (s === "coach") return "text-[#C9A24D]/70 border border-[#C9A24D]/20";
  return "text-white/20 border border-white/08";
}

function fatigueDots(cost: number | null) {
  if (cost === null) return null;
  const filled = Math.round((cost / 10) * 5);
  return (
    <span className="flex gap-0.5 items-center" title={`Fatigue: ${cost}/10`}>
      {Array.from({ length: 5 }, (_, i) => (
        <span
          key={i}
          className={`w-1.5 h-1.5 rounded-full ${i < filled ? "bg-[#C9A24D]/70" : "bg-white/10"}`}
        />
      ))}
    </span>
  );
}

// ─────────────────────────────────────────────────────────────
// NEW EXERCISE INLINE FORM
// ─────────────────────────────────────────────────────────────

interface NewExerciseFormProps {
  onCreated: (id: string) => void;
  onCancel: () => void;
}

function NewExerciseForm({ onCreated, onCancel }: NewExerciseFormProps) {
  const [form, setForm] = useState({
    name: "",
    movementPattern: "hip_hinge",
    classification: "compound",
    difficulty: "intermediate",
  });
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.name.trim()) { setError("Name is required"); return; }
    setCreating(true);
    setError(null);
    try {
      const res = await fetch("/api/internal/exercises", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      const data = await res.json() as { ok: boolean; exercise?: { id: string }; error?: string };
      if (data.ok && data.exercise) {
        onCreated(data.exercise.id);
      } else {
        setError(data.error ?? "Failed to create exercise");
        setCreating(false);
      }
    } catch {
      setError("Network error");
      setCreating(false);
    }
  }

  return (
    <div className="mb-8 bg-[#0d0e0f] border border-[#C9A24D]/30 p-6">
      <p className="text-white font-semibold text-sm mb-5 tracking-wide">New Exercise</p>
      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="block text-[10px] text-gray-600 uppercase tracking-[0.35em] mb-1.5">
              Name *
            </label>
            <input
              type="text"
              value={form.name}
              onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
              placeholder="e.g. Romanian Deadlift"
              autoFocus
              className="w-full bg-[#080909] border border-white/[0.08] text-white px-3 py-2.5 text-sm focus:outline-none focus:border-[#C9A24D]/50 placeholder-gray-700"
            />
          </div>
          <div>
            <label className="block text-[10px] text-gray-600 uppercase tracking-[0.35em] mb-1.5">
              Movement Pattern *
            </label>
            <select
              value={form.movementPattern}
              onChange={(e) => setForm((f) => ({ ...f, movementPattern: e.target.value }))}
              className="w-full bg-[#080909] border border-white/[0.08] text-white px-3 py-2.5 text-sm focus:outline-none focus:border-[#C9A24D]/50"
            >
              {["hip_hinge","squat_bilateral","squat_unilateral","lunge","push_vertical","push_horizontal","pull_vertical","pull_horizontal","carry","rotation","anti_rotation","gait","jump","iso_hold","elbow_flexion","elbow_extension","shoulder_abduction","knee_flexion","knee_extension","hip_extension","hip_flexion","scapular_retraction","external_rotation","internal_rotation"].map((p) => (
                <option key={p} value={p}>{fmtLabel(p)}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-[10px] text-gray-600 uppercase tracking-[0.35em] mb-1.5">
              Classification *
            </label>
            <select
              value={form.classification}
              onChange={(e) => setForm((f) => ({ ...f, classification: e.target.value }))}
              className="w-full bg-[#080909] border border-white/[0.08] text-white px-3 py-2.5 text-sm focus:outline-none focus:border-[#C9A24D]/50"
            >
              {["compound","isolation","cardio","mobility","power","skill"].map((c) => (
                <option key={c} value={c}>{fmtLabel(c)}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-[10px] text-gray-600 uppercase tracking-[0.35em] mb-1.5">
              Difficulty *
            </label>
            <select
              value={form.difficulty}
              onChange={(e) => setForm((f) => ({ ...f, difficulty: e.target.value }))}
              className="w-full bg-[#080909] border border-white/[0.08] text-white px-3 py-2.5 text-sm focus:outline-none focus:border-[#C9A24D]/50"
            >
              {["beginner","intermediate","advanced","specialist"].map((d) => (
                <option key={d} value={d}>{fmtLabel(d)}</option>
              ))}
            </select>
          </div>
        </div>
        {error && <p className="text-red-400 text-xs">{error}</p>}
        <div className="flex gap-3">
          <button
            type="submit"
            disabled={creating}
            className="bg-[#C9A24D] text-black font-bold text-[10px] tracking-[0.3em] uppercase px-5 py-2.5 hover:bg-[#D4B56A] transition-colors disabled:opacity-50"
          >
            {creating ? "Creating…" : "Create Exercise"}
          </button>
          <button
            type="button"
            onClick={onCancel}
            className="text-gray-600 text-[11px] tracking-wide hover:text-gray-400 transition-colors px-3"
          >
            Cancel
          </button>
        </div>
      </form>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// EXERCISE ROW
// ─────────────────────────────────────────────────────────────

function ExerciseListRow({
  exercise,
  onFavoriteToggle,
}: {
  exercise: ExerciseRow;
  onFavoriteToggle: (id: string, next: boolean) => void;
}) {
  const [starring, setStarring] = useState(false);

  async function handleStar(e: React.MouseEvent) {
    e.preventDefault();
    e.stopPropagation();
    setStarring(true);
    try {
      const res = await fetch(`/api/internal/exercises/${exercise.id}/favorite`, { method: "POST" });
      const data = await res.json() as { ok: boolean; isFavorited: boolean };
      if (data.ok) onFavoriteToggle(exercise.id, data.isFavorited);
    } finally {
      setStarring(false);
    }
  }

  return (
    <div className="bg-[#0d0e0f] border border-white/[0.06] px-5 py-4 flex flex-wrap items-center gap-x-5 gap-y-2 hover:border-white/10 transition-colors">
      {/* Star */}
      <button
        onClick={handleStar}
        disabled={starring}
        aria-label={exercise.isFavorited ? "Remove from favorites" : "Add to favorites"}
        className={`shrink-0 transition-colors ${exercise.isFavorited ? "text-[#C9A24D]" : "text-white/20 hover:text-white/45"}`}
      >
        <Star size={13} fill={exercise.isFavorited ? "currentColor" : "none"} />
      </button>

      {/* Identity */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-3 flex-wrap">
          <span className="text-white font-semibold text-sm">{exercise.name}</span>
          <span className={`px-1.5 py-0.5 text-[10px] font-semibold tracking-wide ${statusCls(exercise.status)}`}>
            {exercise.status}
          </span>
          <span className={`px-1.5 py-0.5 text-[9px] tracking-[0.2em] uppercase ${scopeCls(exercise.scope)}`}>
            {exercise.scope}
          </span>
        </div>
        <div className="flex items-center gap-3 mt-1 flex-wrap">
          <span className="text-gray-700 text-[10px] font-mono">{exercise.slug}</span>
          {exercise.primaryMuscleGroup && (
            <span className="text-white/45 text-[11px]">{fmtLabel(exercise.primaryMuscleGroup)}</span>
          )}
          <span className="text-gray-600 text-[11px]">{fmtLabel(exercise.movementPattern)}</span>
          <span className="text-gray-600 text-[11px]">{fmtLabel(exercise.classification)}</span>
        </div>
      </div>

      {/* Fatigue indicator */}
      <div className="shrink-0">{fatigueDots(exercise.fatigueCost)}</div>

      {/* Action */}
      <div className="shrink-0">
        <Link
          href={`/hq/exercises/${exercise.id}`}
          className="text-[10px] tracking-[0.25em] uppercase font-semibold text-gray-500 border border-white/[0.08] px-3 py-1.5 hover:text-white hover:border-white/20 transition-colors"
        >
          {exercise.scope === "system" ? "View →" : "Edit →"}
        </Link>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// PAGE
// ─────────────────────────────────────────────────────────────

export default function HQExercisesPage() {
  const [exercises, setExercises] = useState<ExerciseRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showNewForm, setShowNewForm] = useState(false);

  // Filters
  const [query, setQuery] = useState("");
  const [muscleGroup, setMuscleGroup] = useState("");
  const [status, setStatus] = useState("active");
  const [favoritesOnly, setFavoritesOnly] = useState(false);

  const fetchExercises = useCallback(async () => {
    setLoading(true);
    setError(null);
    const params = new URLSearchParams();
    if (query.trim()) params.set("q", query.trim());
    if (muscleGroup) params.set("muscleGroup", muscleGroup);
    if (status !== "all") params.set("status", status);
    if (favoritesOnly) params.set("favoritesOnly", "true");
    params.set("limit", "100");
    if (status !== "active") params.delete("status"); // let the route handle status=all via activeOnly

    try {
      const res = await fetch(`/api/internal/exercises?${params.toString()}`);
      const data = await res.json() as { ok: boolean; exercises?: ExerciseRow[]; error?: string };
      if (data.ok) setExercises(data.exercises ?? []);
      else setError(data.error ?? "Failed to load exercises");
    } catch {
      setError("Network error");
    } finally {
      setLoading(false);
    }
  }, [query, muscleGroup, status, favoritesOnly]);

  useEffect(() => {
    const t = setTimeout(fetchExercises, query ? 300 : 0);
    return () => clearTimeout(t);
  }, [fetchExercises, query]);

  function handleFavoriteToggle(id: string, isFavorited: boolean) {
    setExercises((prev) => prev.map((ex) => ex.id === id ? { ...ex, isFavorited } : ex));
  }

  function handleCreated(id: string) {
    window.location.href = `/hq/exercises/${id}`;
  }

  return (
    <div>
      <HQPageHeader
        title="Exercise Library"
        subtitle="The canonical knowledge base behind every blueprint, program, and future AI-generated plan."
        action={
          <button
            onClick={() => setShowNewForm(true)}
            className="bg-[#C9A24D] text-black font-bold text-[10px] tracking-[0.3em] uppercase px-4 py-2 hover:bg-[#D4B56A] transition-colors"
          >
            New Exercise
          </button>
        }
      />

      {showNewForm && (
        <NewExerciseForm
          onCreated={handleCreated}
          onCancel={() => setShowNewForm(false)}
        />
      )}

      {/* Filter strip */}
      <div className="flex flex-wrap gap-3 mb-6">
        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search exercises…"
          className="bg-[#0d0e0f] border border-white/[0.08] text-white px-3 py-2 text-xs focus:outline-none focus:border-[#C9A24D]/40 placeholder-gray-700 w-52"
        />
        <select
          value={muscleGroup}
          onChange={(e) => setMuscleGroup(e.target.value)}
          className="bg-[#0d0e0f] border border-white/[0.08] text-white px-3 py-2 text-xs focus:outline-none focus:border-[#C9A24D]/40"
        >
          <option value="">All Muscles</option>
          {MUSCLE_GROUPS.map((g) => (
            <option key={g} value={g}>{fmtLabel(g)}</option>
          ))}
        </select>
        <select
          value={status}
          onChange={(e) => setStatus(e.target.value)}
          className="bg-[#0d0e0f] border border-white/[0.08] text-white px-3 py-2 text-xs focus:outline-none focus:border-[#C9A24D]/40"
        >
          {STATUS_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>{o.label}</option>
          ))}
        </select>
        <button
          onClick={() => setFavoritesOnly((v) => !v)}
          className={`flex items-center gap-1.5 px-3 py-2 text-xs border transition-colors ${
            favoritesOnly
              ? "border-[#C9A24D]/40 text-[#C9A24D] bg-[#C9A24D]/[0.06]"
              : "border-white/[0.08] text-gray-500 hover:text-gray-300"
          }`}
        >
          <Star size={11} fill={favoritesOnly ? "currentColor" : "none"} />
          Favorites
        </button>
      </div>

      {/* Section header */}
      <div className="flex items-center gap-3 mb-4">
        <span className="text-[10px] tracking-[0.4em] text-gray-600 uppercase font-semibold">Exercises</span>
        {!loading && (
          <span className="text-[10px] text-gray-700">
            {exercises.length} {exercises.length === 1 ? "exercise" : "exercises"}
          </span>
        )}
        <div className="flex-1 h-px bg-white/[0.04]" />
      </div>

      {loading && (
        <div className="space-y-2">
          {[1, 2, 3, 4].map((i) => <div key={i} className="h-16 bg-white/[0.02] animate-pulse" />)}
        </div>
      )}

      {error && (
        <div className="bg-red-500/[0.05] border border-red-500/20 px-4 py-3 text-red-400 text-sm">
          {error}
        </div>
      )}

      {!loading && !error && exercises.length === 0 && (
        <div className="border border-white/[0.06] border-dashed px-8 py-12 text-center">
          <p className="text-gray-600 text-sm mb-2">
            {favoritesOnly ? "No favorites yet" : muscleGroup || query ? "No exercises match these filters" : "No exercises found"}
          </p>
          <p className="text-gray-700 text-xs">
            {!favoritesOnly && !muscleGroup && !query && (
              <>
                Click{" "}
                <button onClick={() => setShowNewForm(true)} className="text-[#C9A24D] hover:text-[#D4B56A]">
                  New Exercise
                </button>{" "}
                or run the seed script to populate the library.
              </>
            )}
          </p>
        </div>
      )}

      {!loading && exercises.length > 0 && (
        <div className="space-y-2">
          {exercises.map((ex) => (
            <ExerciseListRow
              key={ex.id}
              exercise={ex}
              onFavoriteToggle={handleFavoriteToggle}
            />
          ))}
        </div>
      )}
    </div>
  );
}
