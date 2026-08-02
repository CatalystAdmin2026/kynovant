"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { Star, Plus, Dumbbell } from "lucide-react";
import HQPageHeader from "@/components/hq/HQPageHeader";
import {
  Button,
  Card,
  Badge,
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell,
  Input,
  Select,
  Label,
  FieldError,
  SkeletonTableRow,
  EmptyState,
} from "@/components/ui";
import type { BadgeVariant } from "@/components/ui";

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

function statusVariant(s: string): BadgeVariant {
  if (s === "active") return "success";
  if (s === "archived") return "neutral";
  return "warning";
}

function scopeVariant(s: string): BadgeVariant {
  return s === "coach" ? "gold" : "neutral";
}

function fatigueDots(cost: number | null) {
  if (cost === null) return <span className="text-white/15 text-xs">—</span>;
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
    <Card tone="dark" padding="md" className="mb-8 !border-[#C9A24D]/30">
      <p className="text-white font-semibold text-sm mb-5 tracking-wide">New Exercise</p>
      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <Label tone="dark">Name *</Label>
            <Input
              tone="dark"
              type="text"
              value={form.name}
              onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
              placeholder="e.g. Romanian Deadlift"
              autoFocus
            />
          </div>
          <div>
            <Label tone="dark">Movement Pattern *</Label>
            <Select
              tone="dark"
              value={form.movementPattern}
              onChange={(e) => setForm((f) => ({ ...f, movementPattern: e.target.value }))}
            >
              {["hip_hinge","squat_bilateral","squat_unilateral","lunge","push_vertical","push_horizontal","pull_vertical","pull_horizontal","carry","rotation","anti_rotation","gait","jump","iso_hold","elbow_flexion","elbow_extension","shoulder_abduction","knee_flexion","knee_extension","hip_extension","hip_flexion","scapular_retraction","external_rotation","internal_rotation"].map((p) => (
                <option key={p} value={p}>{fmtLabel(p)}</option>
              ))}
            </Select>
          </div>
          <div>
            <Label tone="dark">Classification *</Label>
            <Select
              tone="dark"
              value={form.classification}
              onChange={(e) => setForm((f) => ({ ...f, classification: e.target.value }))}
            >
              {["compound","isolation","cardio","mobility","power","skill"].map((c) => (
                <option key={c} value={c}>{fmtLabel(c)}</option>
              ))}
            </Select>
          </div>
          <div>
            <Label tone="dark">Difficulty *</Label>
            <Select
              tone="dark"
              value={form.difficulty}
              onChange={(e) => setForm((f) => ({ ...f, difficulty: e.target.value }))}
            >
              {["beginner","intermediate","advanced","specialist"].map((d) => (
                <option key={d} value={d}>{fmtLabel(d)}</option>
              ))}
            </Select>
          </div>
        </div>
        <FieldError>{error}</FieldError>
        <div className="flex gap-3">
          <Button type="submit" variant="primary" tone="dark" loading={creating}>
            {creating ? "Creating…" : "Create Exercise"}
          </Button>
          <Button type="button" variant="ghost" tone="dark" onClick={onCancel}>
            Cancel
          </Button>
        </div>
      </form>
    </Card>
  );
}

// ─────────────────────────────────────────────────────────────
// EXERCISE ROW
// ─────────────────────────────────────────────────────────────

function ExerciseTableRow({
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
    <TableRow>
      <TableCell className="w-8">
        <button
          onClick={handleStar}
          disabled={starring}
          aria-label={exercise.isFavorited ? "Remove from favorites" : "Add to favorites"}
          className={`ds-focus-ring rounded-md p-0.5 transition-colors ${exercise.isFavorited ? "text-[#C9A24D]" : "text-white/20 hover:text-white/45"}`}
        >
          <Star size={13} fill={exercise.isFavorited ? "currentColor" : "none"} />
        </button>
      </TableCell>
      <TableCell>
        <div className="flex items-center gap-2 flex-wrap">
          <Link
            href={`/hq/exercises/${exercise.id}`}
            className="text-sm font-semibold text-white hover:text-[#C9A24D] transition-colors"
          >
            {exercise.name}
          </Link>
          <Badge tone="dark" variant={statusVariant(exercise.status)} size="sm">{exercise.status}</Badge>
          <Badge tone="dark" variant={scopeVariant(exercise.scope)} size="sm">{exercise.scope}</Badge>
        </div>
        <p className="text-white/25 text-[11px] font-mono mt-0.5">{exercise.slug}</p>
      </TableCell>
      <TableCell className="whitespace-nowrap">
        {exercise.primaryMuscleGroup ? (
          <span className="text-white/60 text-xs">{fmtLabel(exercise.primaryMuscleGroup)}</span>
        ) : (
          <span className="text-white/15 text-xs">—</span>
        )}
      </TableCell>
      <TableCell className="whitespace-nowrap">
        <span className="text-white/60 text-xs">{fmtLabel(exercise.movementPattern)}</span>
        <span className="block text-white/30 text-[11px] mt-0.5">{fmtLabel(exercise.classification)}</span>
      </TableCell>
      <TableCell>{fatigueDots(exercise.fatigueCost)}</TableCell>
      <TableCell className="text-right whitespace-nowrap">
        <Link
          href={`/hq/exercises/${exercise.id}`}
          className="ds-focus-ring inline-flex h-8 items-center rounded-lg border border-white/15 px-3 text-[11px] font-medium text-white/70 transition-colors hover:bg-white/5 hover:border-white/25 hover:text-white"
        >
          {exercise.scope === "system" ? "View" : "Edit"}
        </Link>
      </TableCell>
    </TableRow>
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

  const filtersActive = Boolean(muscleGroup || query.trim() || favoritesOnly);

  return (
    <div>
      <HQPageHeader
        title="Exercise Library"
        subtitle="The canonical knowledge base behind every blueprint, program, and future AI-generated plan."
        action={
          <Button
            variant="primary"
            tone="dark"
            leftIcon={<Plus size={13} strokeWidth={2.5} />}
            onClick={() => setShowNewForm(true)}
          >
            New Exercise
          </Button>
        }
      />

      {showNewForm && (
        <NewExerciseForm
          onCreated={handleCreated}
          onCancel={() => setShowNewForm(false)}
        />
      )}

      {/* Filter strip */}
      <div className="flex flex-wrap items-center gap-2.5 mb-5">
        <div className="flex-1 min-w-[200px] max-w-sm">
          <Input
            tone="dark"
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search exercises…"
            aria-label="Search exercises"
          />
        </div>
        <div className="w-44 shrink-0">
          <Select
            tone="dark"
            value={muscleGroup}
            onChange={(e) => setMuscleGroup(e.target.value)}
          >
            <option value="">All Muscles</option>
            {MUSCLE_GROUPS.map((g) => (
              <option key={g} value={g}>{fmtLabel(g)}</option>
            ))}
          </Select>
        </div>
        <div className="w-36 shrink-0">
          <Select
            tone="dark"
            value={status}
            onChange={(e) => setStatus(e.target.value)}
          >
            {STATUS_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>{o.label}</option>
            ))}
          </Select>
        </div>
        <button
          onClick={() => setFavoritesOnly((v) => !v)}
          aria-pressed={favoritesOnly}
          className={`ds-focus-ring flex items-center gap-1.5 h-[42px] rounded-lg px-3.5 text-xs border transition-colors ${
            favoritesOnly
              ? "border-[#C9A24D]/40 text-[#C9A24D] bg-[#C9A24D]/[0.06]"
              : "border-white/10 text-white/50 hover:text-white/80 hover:border-white/20"
          }`}
        >
          <Star size={11} fill={favoritesOnly ? "currentColor" : "none"} />
          Favorites
        </button>
      </div>

      {/* Result count */}
      {!loading && (
        <p className="text-white/25 text-[11px] mb-3">
          {exercises.length} {exercises.length === 1 ? "exercise" : "exercises"}
        </p>
      )}

      {loading && (
        <Table tone="dark">
          <TableHeader>
            <TableRow>
              <TableHead className="w-8" aria-hidden />
              <TableHead>Exercise</TableHead>
              <TableHead>Muscle Group</TableHead>
              <TableHead>Movement</TableHead>
              <TableHead>Fatigue</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {[1, 2, 3, 4].map((i) => <SkeletonTableRow key={i} tone="dark" columns={6} />)}
          </TableBody>
        </Table>
      )}

      {error && (
        <div className="rounded-lg bg-red-500/[0.05] border border-red-500/20 px-4 py-3 text-red-400 text-sm">
          {error}
        </div>
      )}

      {!loading && !error && exercises.length === 0 && (
        <EmptyState
          tone="dark"
          icon={<Dumbbell className="size-5" />}
          title={favoritesOnly ? "No favorites yet" : filtersActive ? "No exercises match these filters" : "No exercises found"}
          description={
            !favoritesOnly && !muscleGroup && !query
              ? "Create your first exercise or run the seed script to populate the library."
              : undefined
          }
          action={
            !favoritesOnly && !muscleGroup && !query ? (
              <Button variant="outline" tone="dark" size="sm" onClick={() => setShowNewForm(true)}>
                New Exercise
              </Button>
            ) : undefined
          }
        />
      )}

      {!loading && !error && exercises.length > 0 && (
        <Table tone="dark">
          <TableHeader>
            <TableRow>
              <TableHead className="w-8" aria-hidden />
              <TableHead>Exercise</TableHead>
              <TableHead>Muscle Group</TableHead>
              <TableHead>Movement</TableHead>
              <TableHead>Fatigue</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {exercises.map((ex) => (
              <ExerciseTableRow
                key={ex.id}
                exercise={ex}
                onFavoriteToggle={handleFavoriteToggle}
              />
            ))}
          </TableBody>
        </Table>
      )}
    </div>
  );
}
