"use client";

import { useState, useEffect, use } from "react";
import Link from "next/link";
import { Star, ChevronDown, ChevronUp } from "lucide-react";

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

function statusCls(s: string) {
  if (s === "active") return "bg-emerald-500/10 text-emerald-400 border border-emerald-500/20";
  if (s === "archived") return "bg-gray-500/10 text-gray-500 border border-gray-500/20";
  return "bg-amber-500/10 text-amber-400 border border-amber-500/20";
}

function ScoreBar({ value, max = 10, label }: { value: number | null; max?: number; label: string }) {
  if (value === null) return (
    <div>
      <p className="text-[9px] text-white/25 uppercase tracking-[0.35em] mb-1">{label}</p>
      <p className="text-gray-700 text-xs">—</p>
    </div>
  );
  const pct = (value / max) * 100;
  return (
    <div>
      <div className="flex items-center justify-between mb-1">
        <p className="text-[9px] text-white/25 uppercase tracking-[0.35em]">{label}</p>
        <p className="text-[10px] text-white/50">{value}/{max}</p>
      </div>
      <div className="h-1 bg-white/[0.06] rounded-full overflow-hidden">
        <div
          className="h-full bg-[#C9A24D]/50 rounded-full transition-all"
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}

function FieldGroup({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="block text-[9px] text-gray-600 uppercase tracking-[0.4em] mb-1.5">{label}</label>
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
    <input
      type={type}
      value={value}
      onChange={onChange ? (e) => onChange(e.target.value) : undefined}
      disabled={disabled}
      placeholder={placeholder}
      className="w-full bg-[#080909] border border-white/[0.08] text-white px-3 py-2 text-xs focus:outline-none focus:border-[#C9A24D]/40 placeholder-gray-700 disabled:opacity-50 disabled:cursor-not-allowed"
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
    <input
      type="number"
      value={value ?? ""}
      min={min}
      max={max}
      onChange={onChange ? (e) => onChange(e.target.value === "" ? null : parseInt(e.target.value, 10)) : undefined}
      disabled={disabled}
      className="w-full bg-[#080909] border border-white/[0.08] text-white px-3 py-2 text-xs focus:outline-none focus:border-[#C9A24D]/40 disabled:opacity-50 disabled:cursor-not-allowed"
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
    <select
      value={value}
      onChange={onChange ? (e) => onChange(e.target.value) : undefined}
      disabled={disabled}
      className="w-full bg-[#080909] border border-white/[0.08] text-white px-3 py-2 text-xs focus:outline-none focus:border-[#C9A24D]/40 disabled:opacity-50 disabled:cursor-not-allowed"
    >
      {includeBlank && <option value="">{includeBlank}</option>}
      {options.map((o) => <option key={o} value={o}>{fmtLabel(o)}</option>)}
    </select>
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
      className={`flex items-center gap-3 mb-4 ${collapsible ? "cursor-pointer select-none" : ""}`}
      onClick={collapsible ? onToggle : undefined}
    >
      <span className="text-[9px] text-white/30 uppercase tracking-[0.5em] font-semibold">{label}</span>
      {count !== undefined && <span className="text-[10px] text-gray-700">{count}</span>}
      <div className="flex-1 h-px bg-white/[0.04]" />
      {action && <div onClick={(e) => e.stopPropagation()}>{action}</div>}
      {collapsible && (
        <span className="text-white/20">
          {open ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
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
            <p className="text-[9px] text-white/20 uppercase tracking-[0.45em] mb-2">{roleLabel[role]}</p>
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
                    <span className="text-gray-700 text-[10px] w-10 shrink-0">{m.emphasisPercent}%</span>
                  )}
                  {!isSystem && (
                    <button
                      onClick={() => handleDelete(m.id)}
                      className="text-gray-700 hover:text-red-400 transition-colors text-[10px] shrink-0"
                    >
                      ✕
                    </button>
                  )}
                </div>
              ))}
            </div>
          </div>
        )
      ))}

      {muscles.length === 0 && (
        <p className="text-gray-700 text-xs">No muscles defined yet.</p>
      )}

      {!isSystem && (
        adding ? (
          <div className="bg-[#0a0b0c] border border-white/[0.06] p-3 space-y-3">
            <div className="grid grid-cols-3 gap-2">
              <SelectField value={newMuscle.muscleGroup} onChange={(v) => setNewMuscle((n) => ({ ...n, muscleGroup: v }))} options={[...MUSCLE_GROUPS]} />
              <SelectField value={newMuscle.role} onChange={(v) => setNewMuscle((n) => ({ ...n, role: v }))} options={[...MUSCLE_ROLES]} />
              <input
                type="number"
                min={0}
                max={100}
                placeholder="Emphasis %"
                value={newMuscle.emphasisPercent}
                onChange={(e) => setNewMuscle((n) => ({ ...n, emphasisPercent: e.target.value }))}
                className="bg-[#080909] border border-white/[0.08] text-white px-2 py-1.5 text-xs focus:outline-none focus:border-[#C9A24D]/40 placeholder-gray-700"
              />
            </div>
            <div className="flex gap-2">
              <button onClick={handleAdd} disabled={saving} className="text-[10px] tracking-[0.2em] uppercase font-semibold text-black bg-[#C9A24D] px-3 py-1.5 hover:bg-[#D4B56A] disabled:opacity-50">
                {saving ? "Adding…" : "Add"}
              </button>
              <button onClick={() => setAdding(false)} className="text-[10px] text-gray-600 hover:text-gray-400 px-2">Cancel</button>
            </div>
          </div>
        ) : (
          <button
            onClick={() => setAdding(true)}
            className="text-[11px] text-gray-600 border border-dashed border-white/[0.06] px-4 py-2 hover:text-gray-400 hover:border-white/[0.12] transition-colors"
          >
            + Add Muscle
          </button>
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
          <p className="text-[9px] text-white/20 uppercase tracking-[0.45em] mb-2">{fmtLabel(type)}</p>
          <div className="space-y-1.5">
            {byType[type].sort((a, b) => a.orderIndex - b.orderIndex).map((cue, idx) => (
              <div key={cue.id} className="flex items-start gap-3">
                <span className="text-gray-700 text-[10px] w-4 shrink-0 mt-0.5">{idx + 1}.</span>
                <span className={`text-xs flex-1 leading-relaxed ${cue.isPublic ? "text-white/60" : "text-white/35 italic"}`}>
                  {cue.content}
                  {!cue.isPublic && <span className="ml-2 text-[9px] text-white/20">(coach only)</span>}
                </span>
                {!isSystem && (
                  <button onClick={() => handleDelete(cue.id)} className="text-gray-700 hover:text-red-400 transition-colors text-[10px] shrink-0 mt-0.5">✕</button>
                )}
              </div>
            ))}
          </div>
        </div>
      ))}

      {cues.length === 0 && <p className="text-gray-700 text-xs">No cues defined yet.</p>}

      {!isSystem && (
        adding ? (
          <div className="bg-[#0a0b0c] border border-white/[0.06] p-3 space-y-3">
            <div className="grid grid-cols-2 gap-2">
              <SelectField value={newCue.cueType} onChange={(v) => setNewCue((n) => ({ ...n, cueType: v }))} options={[...CUE_TYPES]} />
              <div className="flex items-center gap-2">
                <input type="checkbox" id="cue-public" checked={newCue.isPublic} onChange={(e) => setNewCue((n) => ({ ...n, isPublic: e.target.checked }))} className="accent-[#C9A24D]" />
                <label htmlFor="cue-public" className="text-[10px] text-gray-500 uppercase tracking-[0.3em]">Client visible</label>
              </div>
            </div>
            <textarea
              value={newCue.content}
              onChange={(e) => setNewCue((n) => ({ ...n, content: e.target.value }))}
              placeholder="Enter cue text…"
              rows={2}
              className="w-full bg-[#080909] border border-white/[0.08] text-white px-3 py-2 text-xs focus:outline-none focus:border-[#C9A24D]/40 placeholder-gray-700 resize-none"
            />
            <div className="flex gap-2">
              <button onClick={handleAdd} disabled={saving || !newCue.content.trim()} className="text-[10px] tracking-[0.2em] uppercase font-semibold text-black bg-[#C9A24D] px-3 py-1.5 hover:bg-[#D4B56A] disabled:opacity-50">
                {saving ? "Adding…" : "Add Cue"}
              </button>
              <button onClick={() => setAdding(false)} className="text-[10px] text-gray-600 hover:text-gray-400 px-2">Cancel</button>
            </div>
          </div>
        ) : (
          <button onClick={() => setAdding(true)} className="text-[11px] text-gray-600 border border-dashed border-white/[0.06] px-4 py-2 hover:text-gray-400 hover:border-white/[0.12] transition-colors">
            + Add Cue
          </button>
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
  const [starring, setStarring] = useState(false);
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
      .then((r) => r.json())
      .then((data: { ok: boolean; exercise?: Exercise; error?: string }) => {
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
          setError(data.error ?? "Exercise not found");
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
    const res = await fetch(`/api/internal/exercises/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action }),
    });
    const data = await res.json() as { ok: boolean; exercise?: Exercise };
    if (data.ok && data.exercise) setExercise((ex) => ex ? { ...ex, status: data.exercise!.status } : ex);
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
      <button
        onClick={onClick}
        disabled={saving || disabled}
        className={`text-[10px] tracking-[0.25em] uppercase font-semibold px-4 py-1.5 border transition-colors disabled:opacity-50 ${
          saved
            ? "border-emerald-500/30 text-emerald-400"
            : "border-white/[0.12] text-gray-400 hover:text-white hover:border-white/25"
        }`}
      >
        {saving ? "Saving…" : saved ? "Saved ✓" : "Save"}
      </button>
    );
  }

  // ─────────────────────────────────────────────────────────────

  if (loading) return (
    <div className="flex items-center justify-center py-32">
      <div className="text-gray-600 text-xs tracking-widest uppercase animate-pulse">Loading…</div>
    </div>
  );

  if (error || !exercise) return (
    <div className="flex flex-col items-center justify-center py-32 gap-4">
      <div className="text-red-400 text-sm">{error ?? "Not found"}</div>
      <Link href="/hq/exercises" className="text-gray-500 text-xs hover:text-white transition-colors">← Exercise Library</Link>
    </div>
  );

  const isSystem = exercise.scope === "system";

  return (
    <div className="space-y-8 max-w-3xl">
      {/* Back */}
      <Link href="/hq/exercises" className="text-[10px] text-gray-600 uppercase tracking-[0.3em] hover:text-gray-400 transition-colors">
        ← Exercise Library
      </Link>

      {/* Header */}
      <div className="space-y-3">
        <div className="flex items-start gap-4 flex-wrap">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-3 flex-wrap mb-1">
              <h1 className="text-white font-bold text-2xl tracking-tight">{exercise.name}</h1>
              <span className={`px-2 py-0.5 text-[10px] font-semibold tracking-wide ${statusCls(exercise.status)}`}>
                {exercise.status}
              </span>
              <span className="text-[9px] text-white/25 uppercase tracking-[0.3em] border border-white/10 px-1.5 py-0.5">
                {exercise.scope}
              </span>
            </div>
            <p className="text-gray-700 text-[11px] font-mono">{exercise.slug}</p>
          </div>

          {/* Star + status actions */}
          <div className="flex items-center gap-2 shrink-0">
            <button
              onClick={handleStar}
              disabled={starring}
              aria-label={exercise.isFavorited ? "Remove from favorites" : "Add to favorites"}
              className={`transition-colors ${exercise.isFavorited ? "text-[#C9A24D]" : "text-white/20 hover:text-white/50"}`}
            >
              <Star size={15} fill={exercise.isFavorited ? "currentColor" : "none"} />
            </button>

            {exercise.status === "draft" && (
              <>
                <button
                  onClick={() => handleStatusAction("publish")}
                  className="text-[10px] tracking-[0.2em] uppercase font-semibold text-black bg-[#C9A24D] px-3 py-1.5 hover:bg-[#D4B56A] transition-colors"
                >
                  Publish
                </button>
                <button
                  onClick={() => {
                    if (confirm(`Delete exercise "${exercise.name}"?`)) {
                      fetch(`/api/internal/exercises/${id}`, { method: "DELETE" }).then(() => {
                        window.location.href = "/hq/exercises";
                      });
                    }
                  }}
                  className="text-[10px] tracking-[0.2em] uppercase font-semibold text-gray-600 border border-white/[0.08] px-3 py-1.5 hover:text-red-400 hover:border-red-500/30 transition-colors"
                >
                  Delete
                </button>
              </>
            )}
            {exercise.status === "active" && !isSystem && (
              <button
                onClick={() => handleStatusAction("archive")}
                className="text-[10px] tracking-[0.2em] uppercase font-semibold text-gray-600 border border-white/[0.08] px-3 py-1.5 hover:text-gray-300 hover:border-white/20 transition-colors"
              >
                Archive
              </button>
            )}
            {exercise.status === "archived" && (
              <button
                onClick={() => handleStatusAction("restore")}
                className="text-[10px] tracking-[0.2em] uppercase font-semibold text-gray-600 border border-white/[0.08] px-3 py-1.5 hover:text-gray-300 hover:border-white/20 transition-colors"
              >
                Restore to Draft
              </button>
            )}
          </div>
        </div>

        {/* Classification chips */}
        <div className="flex flex-wrap gap-2">
          {[exercise.classification, exercise.movementPattern, exercise.difficulty, exercise.resistanceType].filter(Boolean).map((tag) => (
            <span key={tag} className="text-[10px] text-white/35 bg-white/[0.04] border border-white/[0.07] px-2 py-0.5">
              {fmtLabel(tag!)}
            </span>
          ))}
          {exercise.unilateral && <span className="text-[10px] text-white/35 bg-white/[0.04] border border-white/[0.07] px-2 py-0.5">Unilateral</span>}
        </div>

        {isSystem && (
          <div className="bg-white/[0.02] border border-white/[0.05] px-4 py-2.5">
            <p className="text-[11px] text-white/30 leading-relaxed">
              This is a Catalyst system exercise. All fields are read-only. Use the overrides below to set your preferred default prescription and private coaching notes.
            </p>
          </div>
        )}
      </div>

      {/* ── IDENTITY ────────────────────────────────────────── */}
      {!isSystem && (
        <div className="bg-[#0d0e0f] border border-white/[0.06] p-5 space-y-4">
          <SectionHeader
            label="Identity"
            action={<SaveButton saving={identitySaving} saved={identitySaved} onClick={handleIdentitySave} />}
          />
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
            <textarea
              value={identityForm.defaultNotes}
              onChange={(e) => setIdentityForm((f) => ({ ...f, defaultNotes: e.target.value }))}
              rows={2}
              placeholder="General coaching note shown alongside this exercise…"
              className="w-full bg-[#080909] border border-white/[0.08] text-white px-3 py-2 text-xs focus:outline-none focus:border-[#C9A24D]/40 placeholder-gray-700 resize-none"
            />
          </FieldGroup>
        </div>
      )}

      {/* ── BIOMECHANICS ─────────────────────────────────────── */}
      <div className="bg-[#0d0e0f] border border-white/[0.06] p-5">
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
                  <p className="text-[9px] text-white/25 uppercase tracking-[0.4em] mb-3">Joint Stress (0–10)</p>
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
      </div>

      {/* ── MUSCLES ──────────────────────────────────────────── */}
      <div className="bg-[#0d0e0f] border border-white/[0.06] p-5">
        <SectionHeader label="Muscles" count={exercise.muscles.length} />
        <MuscleManager
          exerciseId={id}
          muscles={exercise.muscles}
          isSystem={isSystem}
          onChange={(muscles) => setExercise((ex) => ex ? { ...ex, muscles } : ex)}
        />
      </div>

      {/* ── COACHING CUES ────────────────────────────────────── */}
      <div className="bg-[#0d0e0f] border border-white/[0.06] p-5">
        <SectionHeader label="Coaching Cues" count={exercise.cues.length} />
        <CueManager
          exerciseId={id}
          cues={exercise.cues}
          isSystem={isSystem}
          onChange={(cues) => setExercise((ex) => ex ? { ...ex, cues } : ex)}
        />
      </div>

      {/* ── RELATIONS ────────────────────────────────────────── */}
      {exercise.relations.length > 0 && (
        <div className="bg-[#0d0e0f] border border-white/[0.06] p-5">
          <SectionHeader label="Relations" count={exercise.relations.length} />
          <div className="space-y-2">
            {exercise.relations.map((rel) => (
              <div key={rel.id} className="flex items-center gap-3 py-1.5 border-b border-white/[0.04] last:border-0">
                <span className="text-[9px] text-white/25 uppercase tracking-[0.3em] w-24 shrink-0">{fmtLabel(rel.relationType)}</span>
                <span className="text-white/50 text-xs flex-1">{rel.targetExerciseId}</span>
                {rel.suitabilityScore !== null && (
                  <span className="text-gray-600 text-[10px]">{rel.suitabilityScore}/100</span>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── CONTRAINDICATIONS ─── read-only ──────────────────── */}
      {exercise.contraindications.length > 0 && (
        <div className="bg-[#0d0e0f] border border-white/[0.06] p-5">
          <SectionHeader label="Contraindications" count={exercise.contraindications.length} />
          <div className="space-y-2">
            {exercise.contraindications.map((ci) => (
              <div key={ci.id} className="flex items-start gap-3 py-1.5 border-b border-white/[0.04] last:border-0">
                <span className={`text-[9px] uppercase tracking-[0.25em] px-1.5 py-0.5 shrink-0 ${
                  ci.severity === "avoid" ? "text-red-400 bg-red-500/10" :
                  ci.severity === "modify" ? "text-amber-400 bg-amber-500/10" :
                  "text-yellow-400 bg-yellow-500/10"
                }`}>{ci.severity}</span>
                <div className="min-w-0">
                  <p className="text-white/60 text-xs">{ci.conditionOrInjury}</p>
                  {ci.bodyRegion && <p className="text-gray-600 text-[10px]">{ci.bodyRegion}</p>}
                  {ci.modificationNote && <p className="text-gray-600 text-[10px] mt-0.5 italic">{ci.modificationNote}</p>}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── DEFAULT PRESCRIPTION (coach exercises) ───────────── */}
      {!isSystem && (
        <div className="bg-[#0d0e0f] border border-white/[0.06] p-5">
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
        </div>
      )}

      {/* ── COACH OVERRIDES (system exercises) ───────────────── */}
      {isSystem && (
        <div className="bg-[#0d0e0f] border border-white/[0.06] p-5">
          <SectionHeader
            label="Your Coaching Preferences"
            action={<SaveButton saving={overrideSaving} saved={overrideSaved} onClick={handleOverrideSave} />}
          />
          <p className="text-[11px] text-white/25 mb-4 leading-relaxed">
            These preferences apply only to your account. Default Prescription pre-fills the Blueprint picker when you add this exercise. Private Notes are coach-only — never shown to clients.
          </p>
          <div className="space-y-4">
            <div>
              <p className="text-[9px] text-white/25 uppercase tracking-[0.4em] mb-3">Default Prescription</p>
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
              <textarea
                value={overrideForm.privateNotes}
                onChange={(e) => setOverrideForm((f) => ({ ...f, privateNotes: e.target.value }))}
                rows={3}
                placeholder="e.g. Works best with clients who have adequate hip mobility. Cue hard brace throughout."
                className="w-full bg-[#080909] border border-white/[0.08] text-white px-3 py-2 text-xs focus:outline-none focus:border-[#C9A24D]/40 placeholder-gray-700 resize-none"
              />
            </FieldGroup>
          </div>
        </div>
      )}
    </div>
  );
}
