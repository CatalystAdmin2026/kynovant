"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import OnboardingProgress from "./OnboardingProgress";

const STEPS = [
  { id: "client", label: "First Client" },
  { id: "program", label: "First Program" },
  { id: "assign", label: "Assign Workout" },
  { id: "done", label: "Done" },
] as const;

type StepId = (typeof STEPS)[number]["id"];

interface WizardState {
  clientId: string | null;
  clientName: string | null;
  programTemplateId: string | null;
  programName: string | null;
}

const EMPTY_STATE: WizardState = {
  clientId: null,
  clientName: null,
  programTemplateId: null,
  programName: null,
};

interface ProgramTemplateRow {
  id: string;
  name: string;
  status: string;
  category: string;
  experienceLevel: string;
}

function storageKey(coachId: string) {
  return `kynovant_onboarding_${coachId}`;
}

export default function OnboardingWizard({ coachId }: { coachId: string }) {
  const [state, setState] = useState<WizardState>(EMPTY_STATE);
  const [stepIndex, setStepIndex] = useState(0);
  const [hydrated, setHydrated] = useState(false);

  // Restore progress on mount so a refresh mid-wizard doesn't lose place.
  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(storageKey(coachId));
      if (raw) {
        const saved = JSON.parse(raw) as { state: WizardState; stepIndex: number };
        setState(saved.state);
        setStepIndex(saved.stepIndex);
      }
    } catch {
      // Corrupt or missing localStorage entry — start fresh.
    }
    setHydrated(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!hydrated) return;
    window.localStorage.setItem(
      storageKey(coachId),
      JSON.stringify({ state, stepIndex }),
    );
  }, [state, stepIndex, coachId, hydrated]);

  function advance(patch: Partial<WizardState>) {
    setState((s) => ({ ...s, ...patch }));
    setStepIndex((i) => Math.min(i + 1, STEPS.length - 1));
  }

  if (!hydrated) return null;

  const currentId: StepId = STEPS[stepIndex].id;

  return (
    <div className="max-w-xl mx-auto">
      <OnboardingProgress steps={STEPS} currentIndex={stepIndex} />

      <div className="bg-[#0d0e0f] border border-white/[0.06] px-8 py-10">
        {currentId === "client" && <StepFirstClient onDone={advance} />}
        {currentId === "program" && (
          <StepFirstProgram coachId={coachId} onDone={advance} />
        )}
        {currentId === "assign" && (
          <StepAssignWorkout
            clientId={state.clientId!}
            clientName={state.clientName!}
            programTemplateId={state.programTemplateId!}
            programName={state.programName!}
            onDone={advance}
          />
        )}
        {currentId === "done" && (
          <StepComplete clientId={state.clientId} clientName={state.clientName} />
        )}
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// STEP 1 — FIRST CLIENT
// ─────────────────────────────────────────────────────────────

function StepFirstClient({
  onDone,
}: {
  onDone: (patch: Partial<WizardState>) => void;
}) {
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!fullName.trim() || !email.trim()) {
      setError("Name and email are required.");
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch("/api/internal/clients", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ fullName: fullName.trim(), email: email.trim() }),
      });
      const data = await res.json() as {
        ok: boolean;
        client?: { id: string; name: string };
        error?: string;
      };
      if (data.ok && data.client) {
        onDone({ clientId: data.client.id, clientName: data.client.name });
      } else {
        setError(data.error ?? "Could not create client");
      }
    } catch {
      setError("Network error — please try again.");
    } finally {
      setSubmitting(false);
    }
  }

  const input =
    "w-full bg-[#141618] border border-white/8 px-4 py-3 text-white text-sm placeholder:text-gray-700 focus:outline-none focus:border-[#C9A24D]/50 transition-colors";

  return (
    <div>
      <StepHeader
        eyebrow="Step 1 of 3"
        title="Add Your First Client"
        body="We'll send them an email invite to set up their password and open their Kynovant portal. You can fill in the rest of their profile later."
      />
      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label className="block text-[10px] font-semibold tracking-[0.1em] uppercase text-gray-500 mb-2">
            Client Full Name
          </label>
          <input
            className={input}
            placeholder="Alex Johnson"
            value={fullName}
            onChange={(e) => setFullName(e.target.value)}
            disabled={submitting}
          />
        </div>
        <div>
          <label className="block text-[10px] font-semibold tracking-[0.1em] uppercase text-gray-500 mb-2">
            Client Email
          </label>
          <input
            type="email"
            className={input}
            placeholder="alex@example.com"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            disabled={submitting}
          />
        </div>
        {error && <p className="text-red-400 text-xs">{error}</p>}
        <button
          type="submit"
          disabled={submitting}
          className="w-full bg-[#C9A24D] text-black font-bold text-[11px] tracking-[0.14em] uppercase py-3.5 hover:bg-[#D4B56A] transition-colors disabled:opacity-50 mt-2"
        >
          {submitting ? "Creating client…" : "Create Client & Continue"}
        </button>
      </form>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// STEP 2 — FIRST PROGRAM
// ─────────────────────────────────────────────────────────────

function StepFirstProgram({
  onDone,
}: {
  coachId: string;
  onDone: (patch: Partial<WizardState>) => void;
}) {
  const [templates, setTemplates] = useState<ProgramTemplateRow[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [applyingId, setApplyingId] = useState<string | null>(null);
  const [applyError, setApplyError] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/internal/programs")
      .then((r) => r.json())
      .then((data: { ok: boolean; templates?: ProgramTemplateRow[]; error?: string }) => {
        if (data.ok && data.templates) {
          setTemplates(data.templates.filter((t) => t.status === "active"));
        } else {
          setLoadError(data.error ?? "Failed to load programs");
        }
      })
      .catch(() => setLoadError("Network error"));
  }, []);

  async function applyTemplate(id: string, name: string) {
    setApplyingId(id);
    setApplyError(null);
    try {
      const cloneRes = await fetch(`/api/internal/programs/${id}/clone`, { method: "POST" });
      const cloneData = await cloneRes.json() as {
        ok: boolean;
        template?: { id: string; name: string };
        error?: string;
      };
      if (!cloneData.ok || !cloneData.template) {
        setApplyError(cloneData.error ?? "Could not copy that program");
        setApplyingId(null);
        return;
      }

      const publishRes = await fetch(`/api/internal/programs/${cloneData.template.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ publish: true }),
      });
      const publishData = await publishRes.json() as { ok: boolean; errors?: string[] };
      if (!publishData.ok) {
        setApplyError(publishData.errors?.join(" ") ?? "Could not publish that program");
        setApplyingId(null);
        return;
      }

      onDone({ programTemplateId: cloneData.template.id, programName: name });
    } catch {
      setApplyError("Network error — please try again.");
      setApplyingId(null);
    }
  }

  return (
    <div>
      <StepHeader
        eyebrow="Step 2 of 3"
        title="Set Up Your First Program"
        body="Start from a proven template — we'll make you your own editable copy, ready to assign. You can customize it anytime from Programs."
      />

      {templates === null && !loadError && (
        <p className="text-gray-600 text-sm">Loading available programs…</p>
      )}

      {loadError && <p className="text-red-400 text-sm">{loadError}</p>}

      {templates && templates.length === 0 && (
        <div className="border border-dashed border-white/[0.08] px-5 py-8 text-center">
          <p className="text-gray-400 text-sm font-medium mb-1">No starter templates yet</p>
          <p className="text-gray-600 text-xs leading-relaxed mb-4">
            Build your first program from scratch in Programs, then come back
            here to assign it.
          </p>
          <Link
            href="/hq/programs"
            className="inline-block text-[10px] text-[#C9A24D] uppercase tracking-[0.2em] border border-[#C9A24D]/30 px-4 py-2 hover:bg-[#C9A24D]/10 transition-colors"
          >
            Go to Programs →
          </Link>
        </div>
      )}

      {templates && templates.length > 0 && (
        <div className="space-y-2">
          {templates.map((t) => (
            <button
              key={t.id}
              onClick={() => applyTemplate(t.id, t.name)}
              disabled={applyingId !== null}
              className="w-full text-left bg-[#141618] border border-white/[0.06] px-4 py-3.5 flex items-center justify-between gap-4 hover:border-[#C9A24D]/30 transition-colors disabled:opacity-50"
            >
              <div>
                <p className="text-white text-sm font-semibold">{t.name}</p>
                <p className="text-gray-500 text-[10px] uppercase tracking-[0.1em] mt-0.5">
                  {t.category.replace(/_/g, " ")} · {t.experienceLevel}
                </p>
              </div>
              <span className="text-[10px] text-[#C9A24D] uppercase tracking-[0.15em] shrink-0">
                {applyingId === t.id ? "Setting up…" : "Use This →"}
              </span>
            </button>
          ))}
        </div>
      )}

      {applyError && <p className="text-red-400 text-xs mt-3">{applyError}</p>}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// STEP 3 — ASSIGN FIRST WORKOUT
// ─────────────────────────────────────────────────────────────

function StepAssignWorkout({
  clientId,
  clientName,
  programTemplateId,
  programName,
  onDone,
}: {
  clientId: string;
  clientName: string;
  programTemplateId: string;
  programName: string;
  onDone: (patch: Partial<WizardState>) => void;
}) {
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleAssign() {
    setSubmitting(true);
    setError(null);
    try {
      const today = new Date().toISOString().split("T")[0];
      const res = await fetch("/api/internal/client-programs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ clientId, programTemplateId, startDate: today }),
      });
      const data = await res.json() as { ok: boolean; error?: string };
      if (data.ok) {
        onDone({});
      } else {
        setError(data.error ?? "Could not assign the program");
      }
    } catch {
      setError("Network error — please try again.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div>
      <StepHeader
        eyebrow="Step 3 of 3"
        title="Assign the First Workout"
        body="Starting today, this program is live on their schedule."
      />

      <div className="bg-[#141618] border border-white/[0.06] px-5 py-5 mb-6 space-y-3">
        <div className="flex justify-between items-center">
          <span className="text-gray-500 text-[10px] uppercase tracking-[0.15em]">Client</span>
          <span className="text-white text-sm font-semibold">{clientName}</span>
        </div>
        <div className="h-px bg-white/[0.05]" />
        <div className="flex justify-between items-center">
          <span className="text-gray-500 text-[10px] uppercase tracking-[0.15em]">Program</span>
          <span className="text-white text-sm font-semibold">{programName}</span>
        </div>
        <div className="h-px bg-white/[0.05]" />
        <div className="flex justify-between items-center">
          <span className="text-gray-500 text-[10px] uppercase tracking-[0.15em]">Start Date</span>
          <span className="text-white text-sm font-semibold">Today</span>
        </div>
      </div>

      {error && <p className="text-red-400 text-xs mb-3">{error}</p>}

      <button
        onClick={handleAssign}
        disabled={submitting}
        className="w-full bg-[#C9A24D] text-black font-bold text-[11px] tracking-[0.14em] uppercase py-3.5 hover:bg-[#D4B56A] transition-colors disabled:opacity-50"
      >
        {submitting ? "Assigning…" : "Assign Program"}
      </button>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// STEP 4 — COMPLETE
// ─────────────────────────────────────────────────────────────

function StepComplete({
  clientId,
  clientName,
}: {
  clientId: string | null;
  clientName: string | null;
}) {
  return (
    <div className="text-center py-4">
      <div
        className="w-14 h-14 rounded-full bg-[#C9A24D]/15 border border-[#C9A24D]/40 flex items-center justify-center mx-auto mb-6"
        style={{ boxShadow: "0 0 40px rgba(201,162,77,0.25)" }}
      >
        <span className="text-[#C9A24D] text-2xl">✓</span>
      </div>
      <h2 className="font-headline text-2xl font-bold uppercase text-white mb-3">
        You&apos;re Live
      </h2>
      <p className="text-gray-500 text-sm leading-relaxed max-w-sm mx-auto mb-8">
        {clientName ?? "Your first client"} has a program on the calendar and
        an invite waiting in their inbox. That&apos;s the whole loop — client,
        program, workout.
      </p>
      <div className="flex flex-col sm:flex-row gap-3 justify-center">
        {clientId && (
          <Link
            href={`/hq/clients/${clientId}`}
            className="bg-[#C9A24D] text-black font-bold text-[11px] tracking-[0.14em] uppercase px-6 py-3.5 hover:bg-[#D4B56A] transition-colors"
          >
            View Client
          </Link>
        )}
        <Link
          href="/hq"
          className="border border-white/10 text-white/70 font-bold text-[11px] tracking-[0.14em] uppercase px-6 py-3.5 hover:border-white/25 hover:text-white transition-colors"
        >
          Go to Mission Control
        </Link>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// SHARED
// ─────────────────────────────────────────────────────────────

function StepHeader({
  eyebrow,
  title,
  body,
}: {
  eyebrow: string;
  title: string;
  body: string;
}) {
  return (
    <div className="mb-7">
      <p className="text-[#C9A24D] text-[10px] font-semibold tracking-[0.3em] uppercase mb-2">
        {eyebrow}
      </p>
      <h2 className="font-headline text-xl font-bold uppercase text-white mb-2">
        {title}
      </h2>
      <p className="text-gray-500 text-sm leading-relaxed">{body}</p>
    </div>
  );
}
