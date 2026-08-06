"use client";

import { useState, useEffect, use } from "react";
import Link from "next/link";
import { Star, ChevronDown, ChevronUp, ChevronLeft, X, Plus, Dumbbell } from "lucide-react";
import {
  Badge,
  Card,
  CardDescription,
  Button,
  Input,
  Select,
  Textarea,
  Label,
  Skeleton,
  SkeletonCard,
  EmptyState,
  StatusChip,
  cx,
} from "@/components/ui";
import type { BadgeVariant, StatusChipStatus } from "@/components/ui";

// ─────────────────────────────────────────────────────────────
// TYPES
// ─────────────────────────────────────────────────────────────

interface ExerciseMuscle {
  id: string;
  muscleGroup: string;
  role: string;
  emphasisPercent: string | null;
}

interface ExerciseCue {
  id: string;
  cueType: string;
  content: string;
  isPublic: boolean;
  orderIndex: number;
}

interface ExerciseRelation {
  id: string;
  targetExerciseId: string;
  relationType: string;
  suitabilityScore: number | null;
  notes: string | null;
}

interface Contraindication {
  id: string;
  conditionOrInjury: string;
  bodyRegion: string | null;
  severity: string;
  modificationNote: string | null;
}

interface DefaultPrescription {
  sets?: number | null;
  repsMin?: number | null;
  repsMax?: number | null;
  targetRpe?: number | null;
  restSeconds?: number | null;
}

interface CoachOverride {
  defaultPrescription: DefaultPrescription | null;
  privateNotes: string | null;
}

interface Exercise {
  id: string;
  slug: string;
  name: string;
  status: string;
  scope: string;
  classification: string;
  movementPattern: string;
  difficulty: string;
  resistanceType: string | null;
  unilateral: boolean;
  isCardio: boolean;
  isMobility: boolean;
  fatigueCost: number | null;
  technicalComplexity: number | null;
  stabilityDemand: number | null;
  jointStressShoulder: number | null;
  jointStressElbow: number | null;
  jointStressWrist: number | null;
  jointStressSpine: number | null;
  jointStressHip: number | null;
  jointStressKnee: number | null;
  jointStressAnkle: number | null;
  lengthenedBias: number | null;
  shortenedBias: number | null;
  stretchMediatedPotential: number | null;
  defaultBodyPosition: string | null;
  defaultNotes: string | null;
  defaultPrescription: DefaultPrescription | null;
  tags: string[];
  primaryMuscleGroup: string | null;
  muscles: ExerciseMuscle[];
  cues: ExerciseCue[];
  relations: ExerciseRelation[];
  contraindications: Contraindication[];
  isFavorited: boolean;
  coachOverride: CoachOverride | null;
}

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

// contraindication_severity enum: "avoid" | "modify" | "monitor"
function severityStatus(s: string): StatusChipStatus {
  if (s === "avoid") return "critical";
  if (s === "modify") return "high";
  return "caution"; // monitor
}

function ScoreBar({ value, max = 10, label }: { value: number | null; max?: number; label: string }) {
  if (value === null) return (
    <div>
      <p className="text-[10px] text-white/25 uppercase tracking-[0.3em] mb-1">{label}</p>
      <p className="text-white/20 text-xs">—</p>
    </div>
  );
  const pct = (value / max) * 100;
  return (
    <div>
      <div className="flex items-center justify-between mb-1">
        <p className="text-[10px] text-white/25 uppercase tracking-[0.3em]">{label}</p>
        <p className="text-[11px] text-white/50 tabular-nums">{value}/{max}</p>
      </div>
      <div className="h-1.5 bg-white/[0.06] rounded-full overflow-hidden">
        <div
          className="h-full bg-[#C9A24D]/60 rounded-full transition-all duration-500"
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}

function FieldGroup({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <Label tone="dark">{label}</Label>
      {children}
    </div>
  );
}

function Field({
  value,
  onChange,
  disabled,
  placeholder,
  type = "text",
}: {
  value: string;
  onChange?: (v: string) => void;
  disabled?: boolean;
  placeholder?: string;
  type?: string;
}) {
  return (
    <Input
      tone="dark"
      type={type}
      value={value}
      onChange={onChange ? (e) => onChange(e.target.value) : undefined}
      disabled={disabled}
      placeholder={placeholder}
    />
  );
}

function NumberField({
  value,
  onChange,
  disabled,
  min,
  max,
}: {
  value: number | null;
  onChange?: (v: number | null) => void;
  disabled?: boolean;
  min?: number;
  max?: number;
}) {
  return (
    <Input
      tone="dark"
      type="number"
      value={value ?? ""}
      min={min}
      max={max}
      onChange={onChange ? (e) => onChange(e.target.value === "" ? null : parseInt(e.target.value, 10)) : undefined}
      disabled={disabled}
    />
  );
}

function SelectField({
  value,
  onChange,
  options,
  disabled,
  includeBlank,
}: {
  value: string;
  onChange?: (v: string) => void;
  options: string[];
  disabled?: boolean;
  includeBlank?: string;
}) {
  return (
    <Select
      tone="dark"
      value={value}
      onChange={onChange ? (e) => onChange(e.target.value) : undefined}
      disabled={disabled}
    >
      {includeBlank && <option value="">{includeBlank}</option>}
      {options.map((o) => <option key={o} value={o}>{fmtLabel(o)}</option>)}
    </Select>
  );
}

function SectionHeader({
  label,
  count,
  action,
  collapsible,
  open,
  onToggle,
}: {
  label: string;
  count?: number;
  action?: React.ReactNode;
  collapsible?: boolean;
  open?: boolean;
  onToggle?: () => void;
}) {
  return (
    <div
      className={cx("flex items-center gap-3 mb-4", collapsible && "cursor-pointer select-none")}
      onClick={collapsible ? onToggle : undefined}
      role={collapsible ? "button" : undefined}
      tabIndex={collapsible ? 0 : undefined}
      aria-expanded={collapsible ? open : undefined}
      onKeyDown={
        collapsible
          ? (e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                onToggle?.();
              }
            }
          : undefined
      }
    >
      <span className="text-[10px] text-white/40 uppercase tracking-[0.3em] font-semibold">{label}</span>
      {count !== undefined && <span className="text-[11px] text-white/25">{count}</span>}
      <div className="flex-1 h-px bg-white/[0.06]" />
      {action && <div onClick={(e) => e.stopPropagation()}>{action}</div>}
      {collapsible && (
        <span className="text-white/25">
          {open ? <ChevronUp size={13} /> : <ChevronDown size={13} />}
        </span>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// MUSCLE MANAGER
// ─────────────────────────────────────────────────────────────

const MUSCLE_GROUPS = ["chest","front_deltoid","lateral_deltoid","rear_deltoid","upper_back","lats","rhomboids","trapezius","triceps","biceps","brachialis","brachioradialis","forearms","rectus_abdominis","obliques","transverse_abdominis","spinal_erectors","multifidus","glutes","hip_flexors","adductors","abductors","quadriceps","hamstrings","calves","tibialis","cardiovascular"] as const;
const MUSCLE_ROLES = ["primary", "secondary", "stabilizer"] as const;

function MuscleManager({ exerciseId, muscles, isSystem, onChange }: {
  exerciseId: string;
  muscles: ExerciseMuscle[];
  isSystem: boolean;
  onChange: (muscles: ExerciseMuscle[]) => void;
}) {
  const [adding, setAdding] = useState(false);
  const [newMuscle, setNewMuscle] = useState({ muscleGroup: "glutes", role: "primary", emphasisPercent: "" });
  const [saving, setSaving] = useState(false);

  const byRole = {
    primary: muscles.filter((m) => m.role === "primary"),
    secondary: muscles.filter((m) => m.role === "secondary"),
    stabilizer: muscles.filter((m) => m.role === "stabilizer"),
  };

  async function handleAdd() {
    setSaving(true);
    try {
      const res = await fetch(`/api/internal/exercises/${exerciseId}/muscles`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          muscleGroup: newMuscle.muscleGroup,
          role: newMuscle.role,
          emphasisPercent: newMuscle.emphasisPercent ? parseFloat(newMuscle.emphasisPercent) : null,
        }),
      });
      const data = await res.json() as { ok: boolean; muscle?: ExerciseMuscle };
      if (data.ok && data.muscle) {
        onChange([...muscles, data.muscle]);
        setAdding(false);
        setNewMuscle({ muscleGroup: "glutes", role: "primary", emphasisPercent: "" });
      }
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(muscleId: string) {
    const res = await fetch(`/api/internal/exercises/${exerciseId}/muscles/${muscleId}`, { method: "DELETE" });
    if ((await res.json() as { ok: boolean }).ok) {
      onChange(muscles.filter((m) => m.id !== muscleId));
    }
  }

  const roleLabel: Record<string, string> = { primary: "PRIMARY", secondary: "SECONDARY", stabilizer: "STABILIZER" };

  return (
    <div className="space-y-4">
      {(["primary", "secondary", "stabilizer"] as const).map((role) => (
        byRole[role].length > 0 && (
          <div key={role}>
            <p className="text-[9px] text-white/20 uppercase tracking-[0.25em] mb-2">{roleLabel[role]}</p>
            <div className="space-y-1.5">
              {byRole[role].map((m) => (
                <div key={m.id} className="flex items-center gap-3">
                  <div className="flex-1 h-1.5 bg-white/[0.06] rounded-full overflow-hidden">
                    {m.emphasisPercent && (
                      <div
                        className="h-full bg-[#C9A24D]/40 rounded-full"
                        style={{ width: `${m.emphasisPercent}%` }}
                      />
                    )}
                  </div>
                  <span className="text-white/60 text-xs w-36 shrink-0">{fmtLabel(m.muscleGroup)}</span>
                  {m.emphasisPercent && (
                    <span className="text-white/30 text-[10px] w-10 shrink-0">{m.emphasisPercent}%</span>
                  )}
                  {!isSystem && (
                    <button
                      onClick={() => handleDelete(m.id)}
                      aria-label={`Remove ${fmtLabel(m.muscleGroup)}`}
                      className="ds-focus-ring rounded-md p-0.5 text-white/25 hover:text-red-400 transition-colors shrink-0"
                    >
                      <X size={11} />
                    </button>
                  )}
                </div>
              ))}
            </div>
          </div>
        )
      ))}

      {muscles.length === 0 && (
        <p className="text-white/25 text-xs">No muscles defined yet.</p>
      )}

      {!isSystem && (
        adding ? (
          <div className="bg-white/[0.02] border border-white/[0.06] rounded-lg p-3 space-y-3">
            <div className="grid grid-cols-3 gap-2">
              <SelectField value={newMuscle.muscleGroup} onChange={(v) => setNewMuscle((n) => ({ ...n, muscleGroup: v }))} options={[...MUSCLE_GROUPS]} />
              <SelectField value={newMuscle.role} onChange={(v) => setNewMuscle((n) => ({ ...n, role: v }))} options={[...MUSCLE_ROLES]} />
              <Input
                tone="dark"
                type="number"
                min={0}
                max={100}
                placeholder="Emphasis %"
                value={newMuscle.emphasisPercent}
                onChange={(e) => setNewMuscle((n) => ({ ...n, emphasisPercent: e.target.value }))}
              />
            </div>
            <div className="flex gap-2">
              <Button variant="primary" tone="dark" size="sm" loading={saving} onClick={handleAdd}>
                {saving ? "Adding…" : "Add"}
              </Button>
              <Button variant="ghost" tone="dark" size="sm" onClick={() => setAdding(false)}>Cancel</Button>
            </div>
          </div>
        ) : (
          <Button
            variant="outline"
            tone="dark"
            size="sm"
            leftIcon={<Plus size={12} />}
            onClick={() => setAdding(true)}
            className="border-dashed"
          >
            Add Muscle
          </Button>
        )
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// CUE MANAGER
// ─────────────────────────────────────────────────────────────

const CUE_TYPES = ["setup","breathing","execution","mental_cue","safety","common_error","correction","coaching_tip"] as const;

function CueManager({ exerciseId, cues, isSystem, onChange }: {
  exerciseId: string;
  cues: ExerciseCue[];
  isSystem: boolean;
  onChange: (cues: ExerciseCue[]) => void;
}) {
  const [adding, setAdding] = useState(false);
  const [newCue, setNewCue] = useState({ cueType: "execution", content: "", isPublic: true });
  const [saving, setSaving] = useState(false);

  const byType = CUE_TYPES.reduce((acc, t) => {
    acc[t] = cues.filter((c) => c.cueType === t);
    return acc;
  }, {} as Record<string, ExerciseCue[]>);

  async function handleAdd() {
    if (!newCue.content.trim()) return;
    setSaving(true);
    try {
      const res = await fetch(`/api/internal/exercises/${exerciseId}/cues`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(newCue),
      });
      const data = await res.json() as { ok: boolean; cue?: ExerciseCue };
      if (data.ok && data.cue) {
        onChange([...cues, data.cue]);
        setAdding(false);
        setNewCue({ cueType: "execution", content: "", isPublic: true });
      }
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(cueId: string) {
    await fetch(`/api/internal/exercises/${exerciseId}/cues/${cueId}`, { method: "DELETE" });
    onChange(cues.filter((c) => c.id !== cueId));
  }

  return (
    <div className="space-y-4">
      {CUE_TYPES.map((type) => byType[type].length > 0 && (
        <div key={type}>
          <p className="text-[9px] text-white/20 uppercase tracking-[0.25em] mb-2">{fmtLabel(type)}</p>
          <div className="space-y-1.5">
            {byType[type].sort((a, b) => a.orderIndex - b.orderIndex).map((cue, idx) => (
              <div key={cue.id} className="flex items-start gap-3">
                <span className="text-white/25 text-[10px] w-4 shrink-0 mt-0.5">{idx + 1}.</span>
                <span className={`text-xs flex-1 leading-relaxed ${cue.isPublic ? "text-white/60" : "text-white/35 italic"}`}>
                  {cue.content}
                  {!cue.isPublic && <span className="ml-2 text-[9px] text-white/20">(coach only)</span>}
                </span>
                {!isSystem && (
                  <button
                    onClick={() => handleDelete(cue.id)}
                    aria-label="Delete cue"
                    className="ds-focus-ring rounded-md p-0.5 text-white/25 hover:text-red-400 transition-colors shrink-0 mt-0.5"
                  >
                    <X size={11} />
                  </button>
                )}
              </div>
            ))}
          </div>
        </div>
      ))}

      {cues.length === 0 && <p className="text-white/25 text-xs">No cues defined yet.</p>}

      {!isSystem && (
        adding ? (
          <div className="bg-white/[0.02] border border-white/[0.06] rounded-lg p-3 space-y-3">
            <div className="grid grid-cols-2 gap-2">
              <SelectField value={newCue.cueType} onChange={(v) => setNewCue((n) => ({ ...n, cueType: v }))} options={[...CUE_TYPES]} />
              <div className="flex items-center gap-2">
                <input type="checkbox" id="cue-public" checked={newCue.isPublic} onChange={(e) => setNewCue((n) => ({ ...n, isPublic: e.target.checked }))} className="ds-focus-ring accent-[#C9A24D]" />
                <label htmlFor="cue-public" className="text-[10px] text-white/40 uppercase tracking-[0.3em]">Client visible</label>
              </div>
            </div>
            <Textarea
              tone="dark"
              value={newCue.content}
              onChange={(e) => setNewCue((n) => ({ ...n, content: e.target.value }))}
              placeholder="Enter cue text…"
              rows={2}
            />
            <div className="flex gap-2">
              <Button variant="primary" tone="dark" size="sm" loading={saving} disabled={!newCue.content.trim()} onClick={handleAdd}>
                {saving ? "Adding…" : "Add Cue"}
              </Button>
              <Button variant="ghost" tone="dark" size="sm" onClick={() => setAdding(false)}>Cancel</Button>
            </div>
          </div>
        ) : (
          <Button
            variant="outline"
            tone="dark"
            size="sm"
            leftIcon={<Plus size={12} />}
            onClick={() => setAdding(true)}
            className="border-dashed"
          >
            Add Cue
          </Button>
        )
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// PAGE
// ─────────────────────────────────────────────────────────────

export default function HQExerciseDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);

  const [exercise, setExercise] = useState<Exercise | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [errorDescription, setErrorDescription] = useState(
    "This exercise may have been removed, or you may not have access to it.",
  );
  const [starring, setStarring] = useState(false);
  const [statusBusy, setStatusBusy] = useState(false);
  const [statusActionError, setStatusActionError] = useState<string | null>(null);
  const [bioOpen, setBioOpen] = useState(true); // desktop default

  // Identity form (coach exercises only)
  const [identityForm, setIdentityForm] = useState({
    name: "", slug: "", defaultNotes: "", movementPattern: "", classification: "", difficulty: "", resistanceType: "",
  });
  const [identitySaving, setIdentitySaving] = useState(false);
  const [identitySaved, setIdentitySaved] = useState(false);

  // Biomechanics form (coach exercises only)
  const [bioForm, setBioForm] = useState({
    fatigueCost: null as number | null,
    technicalComplexity: null as number | null,
    stabilityDemand: null as number | null,
    lengthenedBias: null as number | null,
    shortenedBias: null as number | null,
    stretchMediatedPotential: null as number | null,
    jointStressShoulder: null as number | null,
    jointStressElbow: null as number | null,
    jointStressWrist: null as number | null,
    jointStressSpine: null as number | null,
    jointStressHip: null as number | null,
    jointStressKnee: null as number | null,
    jointStressAnkle: null as number | null,
  });
  const [bioSaving, setBioSaving] = useState(false);
  const [bioSaved, setBioSaved] = useState(false);

  // Coach override form (for system exercises — prescription + private notes)
  const [overrideForm, setOverrideForm] = useState({
    sets: null as number | null,
    repsMin: null as number | null,
    repsMax: null as number | null,
    targetRpe: null as number | null,
    restSeconds: null as number | null,
    privateNotes: "",
  });
  const [overrideSaving, setOverrideSaving] = useState(false);
  const [overrideSaved, setOverrideSaved] = useState(false);

  // Default prescription form (for coach exercises)
  const [prescriptionForm, setPrescriptionForm] = useState({
    sets: null as number | null,
    repsMin: null as number | null,
    repsMax: null as number | null,
    targetRpe: null as number | null,
    restSeconds: null as number | null,
  });
  const [prescriptionSaving, setPrescriptionSaving] = useState(false);
  const [prescriptionSaved, setPrescriptionSaved] = useState(false);

  // Responsive biomechanics default: collapsed on mobile
  useEffect(() => {
    setBioOpen(window.innerWidth >= 768);
  }, []);

  useEffect(() => {
    let mounted = true;
    fetch(`/api/internal/exercises/${id}`)
      .then(async (r) => {
        const data = await r.json() as { ok: boolean; exercise?: Exercise; error?: string };
        return { data, status: r.status };
      })
      .then(({ data, status }) => {
        if (!mounted) return;
        if (data.ok && data.exercise) {
          const ex = data.exercise;
          setExercise(ex);
          setIdentityForm({
            name: ex.name,
            slug: ex.slug,
            defaultNotes: ex.defaultNotes ?? "",
            movementPattern: ex.movementPattern,
            classification: ex.classification,
            difficulty: ex.difficulty,
            resistanceType: ex.resistanceType ?? "",
          });
          setBioForm({
            fatigueCost: ex.fatigueCost,
            technicalComplexity: ex.technicalComplexity,
            stabilityDemand: ex.stabilityDemand,
            lengthenedBias: ex.lengthenedBias,
            shortenedBias: ex.shortenedBias,
            stretchMediatedPotential: ex.stretchMediatedPotential,
            jointStressShoulder: ex.jointStressShoulder,
            jointStressElbow: ex.jointStressElbow,
            jointStressWrist: ex.jointStressWrist,
            jointStressSpine: ex.jointStressSpine,
            jointStressHip: ex.jointStressHip,
            jointStressKnee: ex.jointStressKnee,
            jointStressAnkle: ex.jointStressAnkle,
          });
          const rx = ex.defaultPrescription ?? {};
          setPrescriptionForm({
            sets: rx.sets ?? null,
            repsMin: rx.repsMin ?? null,
            repsMax: rx.repsMax ?? null,
            targetRpe: rx.targetRpe ?? null,
            restSeconds: rx.restSeconds ?? null,
          });
          const ov = ex.coachOverride;
          setOverrideForm({
            sets: ov?.defaultPrescription?.sets ?? null,
            repsMin: ov?.defaultPrescription?.repsMin ?? null,
            repsMax: ov?.defaultPrescription?.repsMax ?? null,
            targetRpe: ov?.defaultPrescription?.targetRpe ?? null,
            restSeconds: ov?.defaultPrescription?.restSeconds ?? null,
            privateNotes: ov?.privateNotes ?? "",
          });
        } else {
          if (status === 404) {
            setError(data.error ?? "Not found");
            setErrorDescription("This exercise may have been removed, or you may not have access to it.");
          } else {
            setError("Unable to load exercise");
            setErrorDescription(data.error ?? "The exercise detail query failed. Please try again or contact support if it persists.");
          }
        }
        setLoading(false);
      })
      .catch(() => {
        if (mounted) { setError("Network error"); setLoading(false); }
      });
    return () => { mounted = false; };
  }, [id]);

  async function handleStar() {
    if (!exercise) return;
    setStarring(true);
    try {
      const res = await fetch(`/api/internal/exercises/${id}/favorite`, { method: "POST" });
      const data = await res.json() as { ok: boolean; isFavorited: boolean };
      if (data.ok) setExercise((ex) => ex ? { ...ex, isFavorited: data.isFavorited } : ex);
    } finally {
      setStarring(false);
    }
  }

  async function handleStatusAction(action: "publish" | "archive" | "restore") {
    setStatusBusy(true);
    setStatusActionError(null);
    try {
      const res = await fetch(`/api/internal/exercises/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action }),
      });
      const data = await res.json() as { ok: boolean; exercise?: Exercise; error?: string };
      if (data.ok && data.exercise) {
        setExercise((ex) => ex ? { ...ex, status: data.exercise!.status } : ex);
      } else {
        setStatusActionError(data.error ?? `Failed to ${action} this exercise.`);
      }
    } catch {
      setStatusActionError("Network error — please try again.");
    } finally {
      setStatusBusy(false);
    }
  }

  async function handleIdentitySave() {
    setIdentitySaving(true);
    try {
      const res = await fetch(`/api/internal/exercises/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: identityForm.name.trim(),
          slug: identityForm.slug.trim(),
          defaultNotes: identityForm.defaultNotes.trim() || null,
          movementPattern: identityForm.movementPattern,
          classification: identityForm.classification,
          difficulty: identityForm.difficulty,
          resistanceType: identityForm.resistanceType || null,
        }),
      });
      const data = await res.json() as { ok: boolean; exercise?: Exercise };
      if (data.ok && data.exercise) {
        setExercise((ex) => ex ? { ...ex, ...data.exercise } : ex);
        setIdentitySaved(true);
        setTimeout(() => setIdentitySaved(false), 2000);
      }
    } finally {
      setIdentitySaving(false);
    }
  }

  async function handleBioSave() {
    setBioSaving(true);
    try {
      const res = await fetch(`/api/internal/exercises/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(bioForm),
      });
      const data = await res.json() as { ok: boolean };
      if (data.ok) { setBioSaved(true); setTimeout(() => setBioSaved(false), 2000); }
    } finally {
      setBioSaving(false);
    }
  }

  async function handlePrescriptionSave() {
    setPrescriptionSaving(true);
    try {
      const defaultPrescription = { ...prescriptionForm };
      const res = await fetch(`/api/internal/exercises/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ defaultPrescription }),
      });
      const data = await res.json() as { ok: boolean };
      if (data.ok) { setPrescriptionSaved(true); setTimeout(() => setPrescriptionSaved(false), 2000); }
    } finally {
      setPrescriptionSaving(false);
    }
  }

  async function handleOverrideSave() {
    setOverrideSaving(true);
    try {
      const res = await fetch(`/api/internal/exercises/${id}/override`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          defaultPrescription: {
            sets: overrideForm.sets,
            repsMin: overrideForm.repsMin,
            repsMax: overrideForm.repsMax,
            targetRpe: overrideForm.targetRpe,
            restSeconds: overrideForm.restSeconds,
          },
          privateNotes: overrideForm.privateNotes.trim() || null,
        }),
      });
      const data = await res.json() as { ok: boolean };
      if (data.ok) { setOverrideSaved(true); setTimeout(() => setOverrideSaved(false), 2000); }
    } finally {
      setOverrideSaving(false);
    }
  }

  function SaveButton({ saving, saved, onClick, disabled }: { saving: boolean; saved: boolean; onClick: () => void; disabled?: boolean }) {
    return (
      <Button
        variant="outline"
        tone="dark"
        size="sm"
        onClick={onClick}
        loading={saving}
        disabled={disabled}
        className={saved ? "!border-emerald-500/30 !text-emerald-400" : ""}
      >
        {saving ? "Saving…" : saved ? "Saved ✓" : "Save"}
      </Button>
    );
  }

  // ─────────────────────────────────────────────────────────────

  if (loading) return (
    <div className="space-y-8 max-w-3xl">
      <Skeleton tone="dark" width="w-40" height="h-3" />
      <div className="space-y-3">
        <Skeleton tone="dark" width="w-72" height="h-8" />
        <Skeleton tone="dark" width="w-48" height="h-3" />
      </div>
      <SkeletonCard tone="dark" />
      <SkeletonCard tone="dark" />
    </div>
  );

  if (error || !exercise) return (
    <EmptyState
      tone="dark"
      icon={<Dumbbell className="size-5" />}
      title={error ?? "Exercise not found"}
      description={errorDescription}
      action={
        <Link
          href="/hq/exercises"
          className="ds-focus-ring inline-flex items-center gap-1.5 rounded-lg text-[11px] uppercase tracking-[0.25em] font-semibold text-white/50 hover:text-white transition-colors"
        >
          <ChevronLeft size={13} /> Exercise Library
        </Link>
      }
    />
  );

  const isSystem = exercise.scope === "system";

  return (
    <div className="space-y-8 max-w-3xl">
      {/* Back */}
      <Link
        href="/hq/exercises"
        className="ds-focus-ring inline-flex items-center gap-1 rounded-md text-[10px] text-white/40 uppercase tracking-[0.3em] hover:text-white/70 transition-colors"
      >
        <ChevronLeft size={12} /> Exercise Library
      </Link>

      {/* Header */}
      <div className="space-y-3">
        <div className="flex items-start gap-4 flex-wrap">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-3 flex-wrap mb-1">
              <h1 className="text-white font-bold text-2xl tracking-tight">{exercise.name}</h1>
              <Badge tone="dark" variant={statusVariant(exercise.status)} size="sm">{exercise.status}</Badge>
              <Badge tone="dark" variant={scopeVariant(exercise.scope)} size="sm">{exercise.scope}</Badge>
            </div>
            <p className="text-white/25 text-[11px] font-mono">{exercise.slug}</p>
          </div>

          {/* Star + status actions */}
          <div className="flex items-center gap-2 shrink-0">
            <button
              onClick={handleStar}
              disabled={starring}
              aria-label={exercise.isFavorited ? "Remove from favorites" : "Add to favorites"}
              className={`ds-focus-ring rounded-md p-1 transition-colors ${exercise.isFavorited ? "text-[#C9A24D]" : "text-white/20 hover:text-white/50"}`}
            >
              <Star size={15} fill={exercise.isFavorited ? "currentColor" : "none"} />
            </button>

            {exercise.status === "draft" && (
              <>
                <Button
                  variant="primary"
                  tone="dark"
                  size="sm"
                  loading={statusBusy}
                  disabled={statusBusy}
                  onClick={() => handleStatusAction("publish")}
                >
                  {statusBusy ? "Publishing…" : "Publish"}
                </Button>
                <Button
                  variant="outline"
                  tone="dark"
                  size="sm"
                  disabled={statusBusy}
                  className="hover:!text-red-400 hover:!border-red-500/30"
                  onClick={() => {
                    if (!confirm(`Delete exercise "${exercise.name}"?`)) return;
                    setStatusBusy(true);
                    setStatusActionError(null);
                    fetch(`/api/internal/exercises/${id}`, { method: "DELETE" })
                      .then(async (res) => {
                        if (!res.ok) {
                          const data = await res.json().catch(() => ({})) as { error?: string };
                          setStatusActionError(data.error ?? "Failed to delete this exercise.");
                          setStatusBusy(false);
                          return;
                        }
                        window.location.href = "/hq/exercises";
                      })
                      .catch(() => {
                        setStatusActionError("Network error — the exercise was not deleted.");
                        setStatusBusy(false);
                      });
                  }}
                >
                  Delete
                </Button>
              </>
            )}
            {exercise.status === "active" && !isSystem && (
              <Button
                variant="outline"
                tone="dark"
                size="sm"
                loading={statusBusy}
                disabled={statusBusy}
                onClick={() => handleStatusAction("archive")}
              >
                {statusBusy ? "Archiving…" : "Archive"}
              </Button>
            )}
            {exercise.status === "archived" && (
              <Button
                variant="outline"
                tone="dark"
                size="sm"
                loading={statusBusy}
                disabled={statusBusy}
                onClick={() => handleStatusAction("restore")}
              >
                {statusBusy ? "Restoring…" : "Restore to Draft"}
              </Button>
            )}
          </div>
        </div>

        {statusActionError && (
          <p className="text-red-400 text-xs">{statusActionError}</p>
        )}

        {/* Classification chips */}
        <div className="flex flex-wrap gap-1.5">
          {[exercise.classification, exercise.movementPattern, exercise.difficulty, exercise.resistanceType].filter(Boolean).map((tag) => (
            <Badge tone="dark" key={tag} variant="neutral" size="sm">{fmtLabel(tag!)}</Badge>
          ))}
          {exercise.unilateral && <Badge tone="dark" variant="neutral" size="sm">Unilateral</Badge>}
        </div>

        {isSystem && (
          <Card tone="dark" padding="sm">
            <CardDescription tone="dark">
              This is a Kynovant system exercise. All fields are read-only. Use the overrides below to set your preferred default prescription and private coaching notes.
            </CardDescription>
          </Card>
        )}
      </div>

      {/* ── IDENTITY ────────────────────────────────────────── */}
      {!isSystem && (
        <Card tone="dark" padding="md">
          <SectionHeader
            label="Identity"
            action={<SaveButton saving={identitySaving} saved={identitySaved} onClick={handleIdentitySave} />}
          />
          <div className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <FieldGroup label="Name">
                <Field value={identityForm.name} onChange={(v) => setIdentityForm((f) => ({ ...f, name: v }))} />
              </FieldGroup>
              <FieldGroup label="Slug">
                <Field value={identityForm.slug} onChange={(v) => setIdentityForm((f) => ({ ...f, slug: v }))} />
              </FieldGroup>
              <FieldGroup label="Movement Pattern">
                <SelectField
                  value={identityForm.movementPattern}
                  onChange={(v) => setIdentityForm((f) => ({ ...f, movementPattern: v }))}
                  options={["hip_hinge","squat_bilateral","squat_unilateral","lunge","push_vertical","push_horizontal","pull_vertical","pull_horizontal","carry","rotation","anti_rotation","gait","jump","iso_hold","elbow_flexion","elbow_extension","shoulder_abduction","knee_flexion","knee_extension","hip_extension","hip_flexion","scapular_retraction","external_rotation","internal_rotation"]}
                />
              </FieldGroup>
              <FieldGroup label="Classification">
                <SelectField
                  value={identityForm.classification}
                  onChange={(v) => setIdentityForm((f) => ({ ...f, classification: v }))}
                  options={["compound","isolation","cardio","mobility","power","skill"]}
                />
              </FieldGroup>
              <FieldGroup label="Difficulty">
                <SelectField
                  value={identityForm.difficulty}
                  onChange={(v) => setIdentityForm((f) => ({ ...f, difficulty: v }))}
                  options={["beginner","intermediate","advanced","specialist"]}
                />
              </FieldGroup>
              <FieldGroup label="Resistance Type">
                <SelectField
                  value={identityForm.resistanceType}
                  onChange={(v) => setIdentityForm((f) => ({ ...f, resistanceType: v }))}
                  options={["barbell","dumbbell","kettlebell","cable","machine","band","bodyweight","smith_machine","trap_bar","suspension","plate_loaded","medicine_ball","sandbag","chains","landmine"]}
                  includeBlank="None"
                />
              </FieldGroup>
            </div>
            <FieldGroup label="Default Notes">
              <Textarea
                tone="dark"
                value={identityForm.defaultNotes}
                onChange={(e) => setIdentityForm((f) => ({ ...f, defaultNotes: e.target.value }))}
                rows={2}
                placeholder="General coaching note shown alongside this exercise…"
              />
            </FieldGroup>
          </div>
        </Card>
      )}

      {/* ── BIOMECHANICS ─────────────────────────────────────── */}
      <Card tone="dark" padding="md">
        <SectionHeader
          label="Biomechanics"
          collapsible
          open={bioOpen}
          onToggle={() => setBioOpen((v) => !v)}
          action={!isSystem && bioOpen ? <SaveButton saving={bioSaving} saved={bioSaved} onClick={handleBioSave} /> : undefined}
        />
        {bioOpen && (
          <div className="space-y-5">
            {isSystem ? (
              <div className="space-y-4">
                <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                  {[
                    ["Fatigue Cost", exercise.fatigueCost],
                    ["Technical Complexity", exercise.technicalComplexity],
                    ["Stability Demand", exercise.stabilityDemand],
                    ["Lengthened Bias", exercise.lengthenedBias],
                    ["Shortened Bias", exercise.shortenedBias],
                    ["Stretch-Mediated", exercise.stretchMediatedPotential],
                  ].map(([label, val]) => (
                    <ScoreBar key={label as string} label={label as string} value={val as number | null} />
                  ))}
                </div>
                <div className="space-y-2">
                  {[
                    ["Knee", exercise.jointStressKnee],
                    ["Spine", exercise.jointStressSpine],
                    ["Hip", exercise.jointStressHip],
                    ["Shoulder", exercise.jointStressShoulder],
                    ["Elbow", exercise.jointStressElbow],
                    ["Wrist", exercise.jointStressWrist],
                    ["Ankle", exercise.jointStressAnkle],
                  ].filter(([, v]) => v !== null).map(([label, val]) => (
                    <ScoreBar key={label as string} label={`${label} Stress`} value={val as number | null} max={10} />
                  ))}
                </div>
              </div>
            ) : (
              <div className="space-y-5">
                <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                  {[
                    ["Fatigue Cost (1–10)", "fatigueCost", 1, 10],
                    ["Technical Complexity", "technicalComplexity", 1, 10],
                    ["Stability Demand", "stabilityDemand", 1, 10],
                    ["Lengthened Bias (0–10)", "lengthenedBias", 0, 10],
                    ["Shortened Bias", "shortenedBias", 0, 10],
                    ["Stretch-Mediated Potential", "stretchMediatedPotential", 0, 10],
                  ].map(([label, field, min, max]) => (
                    <FieldGroup key={field as string} label={label as string}>
                      <NumberField
                        value={bioForm[field as keyof typeof bioForm]}
                        onChange={(v) => setBioForm((f) => ({ ...f, [field as string]: v }))}
                        min={min as number}
                        max={max as number}
                      />
                    </FieldGroup>
                  ))}
                </div>
                <div>
                  <p className="text-[9px] text-white/25 uppercase tracking-[0.25em] mb-3">Joint Stress (0–10)</p>
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                    {[
                      ["Shoulder", "jointStressShoulder"],
                      ["Elbow", "jointStressElbow"],
                      ["Wrist", "jointStressWrist"],
                      ["Spine", "jointStressSpine"],
                      ["Hip", "jointStressHip"],
                      ["Knee", "jointStressKnee"],
                      ["Ankle", "jointStressAnkle"],
                    ].map(([label, field]) => (
                      <FieldGroup key={field} label={label}>
                        <NumberField
                          value={bioForm[field as keyof typeof bioForm]}
                          onChange={(v) => setBioForm((f) => ({ ...f, [field]: v }))}
                          min={0}
                          max={10}
                        />
                      </FieldGroup>
                    ))}
                  </div>
                </div>
              </div>
            )}
          </div>
        )}
      </Card>

      {/* ── MUSCLES ──────────────────────────────────────────── */}
      <Card tone="dark" padding="md">
        <SectionHeader label="Muscles" count={exercise.muscles.length} />
        <MuscleManager
          exerciseId={id}
          muscles={exercise.muscles}
          isSystem={isSystem}
          onChange={(muscles) => setExercise((ex) => ex ? { ...ex, muscles } : ex)}
        />
      </Card>

      {/* ── COACHING CUES ────────────────────────────────────── */}
      <Card tone="dark" padding="md">
        <SectionHeader label="Coaching Cues" count={exercise.cues.length} />
        <CueManager
          exerciseId={id}
          cues={exercise.cues}
          isSystem={isSystem}
          onChange={(cues) => setExercise((ex) => ex ? { ...ex, cues } : ex)}
        />
      </Card>

      {/* ── RELATIONS ────────────────────────────────────────── */}
      {exercise.relations.length > 0 && (
        <Card tone="dark" padding="md">
          <SectionHeader label="Relations" count={exercise.relations.length} />
          <div className="space-y-2">
            {exercise.relations.map((rel) => (
              <div key={rel.id} className="flex items-center gap-3 py-1.5 border-b border-white/[0.04] last:border-0">
                <Badge tone="dark" variant="neutral" size="sm" className="w-24 justify-center shrink-0">{fmtLabel(rel.relationType)}</Badge>
                <span className="text-white/50 text-xs flex-1">{rel.targetExerciseId}</span>
                {rel.suitabilityScore !== null && (
                  <span className="text-white/30 text-[10px]">{rel.suitabilityScore}/100</span>
                )}
              </div>
            ))}
          </div>
        </Card>
      )}

      {/* ── CONTRAINDICATIONS ─── read-only ──────────────────── */}
      {exercise.contraindications.length > 0 && (
        <Card tone="dark" padding="md">
          <SectionHeader label="Contraindications" count={exercise.contraindications.length} />
          <div className="space-y-2">
            {exercise.contraindications.map((ci) => (
              <div key={ci.id} className="flex items-start gap-3 py-1.5 border-b border-white/[0.04] last:border-0">
                <StatusChip tone="dark" status={severityStatus(ci.severity)} label={fmtLabel(ci.severity)} size="sm" className="shrink-0 mt-0.5" />
                <div className="min-w-0">
                  <p className="text-white/60 text-xs">{ci.conditionOrInjury}</p>
                  {ci.bodyRegion && <p className="text-white/30 text-[10px]">{ci.bodyRegion}</p>}
                  {ci.modificationNote && <p className="text-white/30 text-[10px] mt-0.5 italic">{ci.modificationNote}</p>}
                </div>
              </div>
            ))}
          </div>
        </Card>
      )}

      {/* ── DEFAULT PRESCRIPTION (coach exercises) ───────────── */}
      {!isSystem && (
        <Card tone="dark" padding="md">
          <SectionHeader
            label="Default Prescription"
            action={<SaveButton saving={prescriptionSaving} saved={prescriptionSaved} onClick={handlePrescriptionSave} />}
          />
          <p className="text-[11px] text-white/25 mb-4 leading-relaxed">
            When this exercise is added to a Blueprint, these values pre-fill the prescription fields. Coaches can always override per-blueprint.
          </p>
          <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
            {[["Sets", "sets"], ["Reps Min", "repsMin"], ["Reps Max", "repsMax"], ["RPE", "targetRpe"], ["Rest (s)", "restSeconds"]].map(([label, field]) => (
              <FieldGroup key={field} label={label}>
                <NumberField
                  value={prescriptionForm[field as keyof typeof prescriptionForm]}
                  onChange={(v) => setPrescriptionForm((f) => ({ ...f, [field]: v }))}
                  min={0}
                />
              </FieldGroup>
            ))}
          </div>
        </Card>
      )}

      {/* ── COACH OVERRIDES (system exercises) ───────────────── */}
      {isSystem && (
        <Card tone="dark" padding="md">
          <SectionHeader
            label="Your Coaching Preferences"
            action={<SaveButton saving={overrideSaving} saved={overrideSaved} onClick={handleOverrideSave} />}
          />
          <p className="text-[11px] text-white/25 mb-4 leading-relaxed">
            These preferences apply only to your account. Default Prescription pre-fills the Blueprint picker when you add this exercise. Private Notes are coach-only — never shown to clients.
          </p>
          <div className="space-y-4">
            <div>
              <p className="text-[9px] text-white/25 uppercase tracking-[0.25em] mb-3">Default Prescription</p>
              <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
                {[["Sets", "sets"], ["Reps Min", "repsMin"], ["Reps Max", "repsMax"], ["RPE", "targetRpe"], ["Rest (s)", "restSeconds"]].map(([label, field]) => (
                  <FieldGroup key={field} label={label}>
                    <NumberField
                      value={overrideForm[field as keyof typeof overrideForm] as number | null}
                      onChange={(v) => setOverrideForm((f) => ({ ...f, [field]: v }))}
                      min={0}
                    />
                  </FieldGroup>
                ))}
              </div>
            </div>
            <FieldGroup label="Private Notes (coach only)">
              <Textarea
                tone="dark"
                value={overrideForm.privateNotes}
                onChange={(e) => setOverrideForm((f) => ({ ...f, privateNotes: e.target.value }))}
                rows={3}
                placeholder="e.g. Works best with clients who have adequate hip mobility. Cue hard brace throughout."
              />
            </FieldGroup>
          </div>
        </Card>
      )}
    </div>
  );
}
