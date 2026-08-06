"use client";

// ─────────────────────────────────────────────────────────────
// Catalyst HQ — Get Started Checklist
//
// First-run onboarding checklist, not a locked step-by-step wizard.
// Two independent, skippable items:
//   1. Invite your first client (uses the same AddClientModal as
//      the Clients page — one shared invitation surface).
//   2. Optionally set up and publish a first program. Never
//      prerequisite for #1, and assigning that program to a client
//      is a separate, later action taken from Programs — this
//      checklist does not do assignment at all.
//
// State is derived from real server data (does the coach already
// have clients / programs?) passed in as props, refined by
// in-session events (an invite or a program created just now). None
// of it is written to localStorage/sessionStorage, so there is no
// stale persisted state to leave this page stuck on a terminal
// screen — it always reflects current reality. This intentionally
// replaces the old wizard's `kynovant_onboarding_${coachId}`
// localStorage step tracker, which was the source of that bug.
// ─────────────────────────────────────────────────────────────

import { useState } from "react";
import Link from "next/link";
import AddClientModal from "@/components/hq/clients/AddClientModal";

interface ProgramTemplateRow {
  id: string;
  name: string;
  status: string;
  category: string;
  experienceLevel: string;
}

interface Props {
  initialHasClients: boolean;
  initialHasPrograms: boolean;
}

export default function OnboardingWizard({ initialHasClients, initialHasPrograms }: Props) {
  const [hasClients, setHasClients] = useState(initialHasClients);
  const [lastClient, setLastClient] = useState<{ id: string; name: string } | null>(null);
  const [addClientOpen, setAddClientOpen] = useState(false);

  const [hasPrograms, setHasPrograms] = useState(initialHasPrograms);
  const [lastProgram, setLastProgram] = useState<{ id: string; name: string } | null>(null);
  const [programSkipped, setProgramSkipped] = useState(false);

  return (
    <div className="max-w-2xl mx-auto space-y-4">
      {/* ── Item 1: Invite your first client ─────────────────── */}
      <ChecklistCard
        done={hasClients}
        title="Invite your first client"
        body="Send an email invite so they can set their password and log into their Kynovant portal. Their profile and program can be filled in later."
      >
        {hasClients ? (
          <div className="flex flex-wrap items-center gap-3">
            {lastClient && (
              <Link
                href={`/hq/clients/${lastClient.id}`}
                className="text-[11px] text-white/70 hover:text-white uppercase tracking-[0.1em] border border-white/10 hover:border-white/25 px-4 py-2 transition-colors"
              >
                View {lastClient.name} →
              </Link>
            )}
            <button
              onClick={() => setAddClientOpen(true)}
              className="text-[11px] text-[#C9A24D] hover:text-[#D4B56A] uppercase tracking-[0.1em] px-1 py-2 transition-colors"
            >
              Invite another client
            </button>
          </div>
        ) : (
          <button
            onClick={() => setAddClientOpen(true)}
            className="bg-[#C9A24D] text-black font-bold text-[11px] tracking-[0.14em] uppercase px-6 py-3 hover:bg-[#D4B56A] transition-colors"
          >
            Invite a Client
          </button>
        )}
      </ChecklistCard>

      <AddClientModal
        open={addClientOpen}
        onClose={() => setAddClientOpen(false)}
        onCreated={(client) => {
          setHasClients(true);
          setLastClient(client);
        }}
      />

      {/* ── Item 2: optional program setup ───────────────────── */}
      <ChecklistCard
        done={hasPrograms}
        optional
        title="Set up a program"
        body="Start from a template, or build one from scratch anytime in Programs. Assigning it to a client is a separate step you can do whenever you're ready."
      >
        {hasPrograms ? (
          <div className="flex flex-wrap items-center gap-3">
            <Link
              href={lastProgram ? `/hq/programs/${lastProgram.id}` : "/hq/programs"}
              className="text-[11px] text-white/70 hover:text-white uppercase tracking-[0.1em] border border-white/10 hover:border-white/25 px-4 py-2 transition-colors"
            >
              {lastProgram ? `Open ${lastProgram.name} →` : "Go to Programs →"}
            </Link>
          </div>
        ) : programSkipped ? (
          <p className="text-white/35 text-xs">
            Skipped for now —{" "}
            <button
              onClick={() => setProgramSkipped(false)}
              className="text-[#C9A24D] hover:text-[#D4B56A] transition-colors"
            >
              set one up
            </button>
          </p>
        ) : (
          <ProgramPicker
            onCreated={(program) => {
              setHasPrograms(true);
              setLastProgram(program);
            }}
            onSkip={() => setProgramSkipped(true)}
          />
        )}
      </ChecklistCard>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// CHECKLIST CARD
// ─────────────────────────────────────────────────────────────

function ChecklistCard({
  done,
  optional,
  title,
  body,
  children,
}: {
  done: boolean;
  optional?: boolean;
  title: string;
  body: string;
  children: React.ReactNode;
}) {
  return (
    <div className="bg-[#0d0e0f] border border-white/[0.06] px-6 py-6 flex gap-4">
      <div
        role="img"
        aria-label={done ? "Complete" : "Not started"}
        className={`w-7 h-7 rounded-full flex items-center justify-center text-[11px] font-bold shrink-0 transition-colors ${
          done
            ? "bg-[#C9A24D] text-black"
            : "bg-white/[0.04] border border-white/10 text-white/30"
        }`}
      >
        {done ? "✓" : ""}
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 mb-1.5">
          <h2 className="font-headline text-lg font-bold uppercase text-white">{title}</h2>
          {optional && (
            <span className="text-[9px] text-white/35 uppercase tracking-[0.15em] border border-white/10 px-1.5 py-0.5">
              Optional
            </span>
          )}
        </div>
        <p className="text-white/45 text-sm leading-relaxed mb-4">{body}</p>
        {children}
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// PROGRAM PICKER — clone a starter template and publish it.
// Assignment to a client is deliberately not part of this flow.
// ─────────────────────────────────────────────────────────────

function ProgramPicker({
  onCreated,
  onSkip,
}: {
  onCreated: (program: { id: string; name: string }) => void;
  onSkip: () => void;
}) {
  const [templates, setTemplates] = useState<ProgramTemplateRow[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [applyingId, setApplyingId] = useState<string | null>(null);
  const [applyError, setApplyError] = useState<string | null>(null);
  const [requested, setRequested] = useState(false);

  function loadTemplates() {
    setRequested(true);
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
  }

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

      onCreated({ id: cloneData.template.id, name });
    } catch {
      setApplyError("Network error — please try again.");
      setApplyingId(null);
    }
  }

  if (!requested) {
    return (
      <div className="flex flex-wrap items-center gap-3">
        <button
          onClick={loadTemplates}
          className="bg-[#C9A24D] text-black font-bold text-[11px] tracking-[0.14em] uppercase px-6 py-3 hover:bg-[#D4B56A] transition-colors"
        >
          Choose a Template
        </button>
        <button
          onClick={onSkip}
          className="text-white/35 hover:text-white/55 text-[11px] tracking-[0.1em] uppercase px-1 py-3 transition-colors"
        >
          Skip for now
        </button>
      </div>
    );
  }

  return (
    <div>
      {templates === null && !loadError && (
        <p className="text-white/35 text-sm">Loading available programs…</p>
      )}

      {loadError && <p className="text-red-400 text-sm">{loadError}</p>}

      {templates && templates.length === 0 && (
        <div className="border border-dashed border-white/[0.08] px-5 py-8 text-center">
          <p className="text-white/60 text-sm font-medium mb-1">No starter templates yet</p>
          <p className="text-white/35 text-xs leading-relaxed mb-4">
            Build your first program from scratch in Programs, then come back
            here to check this off — or just skip it.
          </p>
          <div className="flex items-center justify-center gap-4">
            <Link
              href="/hq/programs"
              className="inline-block text-[10px] text-[#C9A24D] uppercase tracking-[0.2em] border border-[#C9A24D]/30 px-4 py-2 hover:bg-[#C9A24D]/10 transition-colors"
            >
              Go to Programs →
            </Link>
            <button
              onClick={onSkip}
              className="text-white/35 hover:text-white/55 text-[10px] tracking-[0.1em] uppercase transition-colors"
            >
              Skip for now
            </button>
          </div>
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
                <p className="text-white/45 text-[10px] uppercase tracking-[0.1em] mt-0.5">
                  {t.category.replace(/_/g, " ")} · {t.experienceLevel}
                </p>
              </div>
              <span className="text-[10px] text-[#C9A24D] uppercase tracking-[0.15em] shrink-0">
                {applyingId === t.id ? "Setting up…" : "Use This →"}
              </span>
            </button>
          ))}
          <button
            onClick={onSkip}
            disabled={applyingId !== null}
            className="text-white/35 hover:text-white/55 text-[10px] tracking-[0.1em] uppercase px-1 py-2 transition-colors disabled:opacity-50"
          >
            Skip for now
          </button>
        </div>
      )}

      {applyError && <p className="text-red-400 text-xs mt-3">{applyError}</p>}
    </div>
  );
}
