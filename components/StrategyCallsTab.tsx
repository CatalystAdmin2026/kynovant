"use client";

import { useState, useEffect } from "react";
import { fetchCalendlyEvents, type CalendlyEvent } from "@/lib/calendly";
import { fetchSheetData, type SheetRow } from "@/lib/sheets";
import {
  COACHING_PACKAGES,
  PACKAGE_CONFIG,
  AGREEMENT_STATUS_LABELS,
  type AgreementState,
  type AgreementStatus,
  type CoachingPackage,
  type StrategyCallDecision,
  type StrategyCallOutcome,
  outcomeNextAction,
  agreementNextAction,
} from "@/lib/workflow";

/* ────────────────────────────────────────────────────────────
   TYPES
──────────────────────────────────────────────────────────── */

interface ApplicationData {
  email: string;
  name: string;
  phone: string;
  goal: string;
  commitment: string;
  budget: string;
  goalsDetails: string;
  referralSource: string;
  referralName: string;
}

// Derived lead: Calendly event + matched application + derived stage
interface StrategyCallLead {
  event: CalendlyEvent;
  application: ApplicationData | null;
  // "Strategy Call Booked" | "Strategy Call Completed" | "Cancelled"
  // (does not reflect decision state — check decisions[uri] for that)
  baseStage: "Strategy Call Booked" | "Strategy Call Completed" | "Cancelled";
}

type LoadStatus = "loading" | "ok" | "error";

interface CalendlyState {
  status: LoadStatus;
  upcoming: CalendlyEvent[];
  completed: CalendlyEvent[];
  cancelled: CalendlyEvent[];
  error?: string;
  unconfigured?: boolean;
}

interface AppsState {
  status: LoadStatus;
  byEmail: Map<string, ApplicationData>;
  error?: string;
  unconfigured?: boolean;
}

/* ────────────────────────────────────────────────────────────
   HELPERS
──────────────────────────────────────────────────────────── */

function field(row: SheetRow, ...keys: string[]): string {
  for (const k of keys) {
    const v = row[k] ?? row[k.toLowerCase()] ?? row[k.toUpperCase()];
    if (v !== undefined && v !== null && v !== "") return String(v);
  }
  return "";
}

function normalizeApplication(row: SheetRow): ApplicationData {
  return {
    email:         field(row, "email", "Email"),
    name:          field(row, "name", "Name", "Full Name"),
    phone:         field(row, "phone", "Phone"),
    goal:          field(row, "goal", "Goal", "Primary Goal"),
    commitment:    field(row, "commitment", "Commitment"),
    budget:        field(row, "budget", "Budget"),
    goalsDetails:  field(row, "goals_details", "goalsDetails", "Goals Details"),
    referralSource:field(row, "referral_source", "referralSource", "Referral Source"),
    referralName:  field(row, "referral_name", "referralName", "Referral Name"),
  };
}

function buildApplicationMap(rows: SheetRow[]): Map<string, ApplicationData> {
  const map = new Map<string, ApplicationData>();
  for (const row of rows) {
    const app = normalizeApplication(row);
    if (app.email) map.set(app.email.toLowerCase().trim(), app);
  }
  return map;
}

function matchApplication(
  event: CalendlyEvent,
  byEmail: Map<string, ApplicationData>,
): ApplicationData | null {
  if (!event.inviteeEmail) return null;
  return byEmail.get(event.inviteeEmail.toLowerCase().trim()) ?? null;
}

function fmtDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-US", {
    weekday: "short", month: "short", day: "numeric",
  });
}

function fmtTime(iso: string): string {
  return new Date(iso).toLocaleTimeString("en-US", {
    hour: "numeric", minute: "2-digit",
  });
}

function fmtRelative(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const days = Math.floor(diff / 86_400_000);
  if (days === 0) return "today";
  if (days === 1) return "yesterday";
  if (days < 7) return `${days}d ago`;
  return fmtDate(iso);
}

/* ────────────────────────────────────────────────────────────
   STAGE BADGE
──────────────────────────────────────────────────────────── */

function StageBadge({ stage }: { stage: string }) {
  const cls: Record<string, string> = {
    "Strategy Call Booked":    "bg-sky-500/10 text-sky-400 border border-sky-500/20",
    "Strategy Call Completed": "bg-indigo-500/10 text-indigo-400 border border-indigo-500/20",
    "Approved":                "bg-emerald-500/10 text-emerald-400 border border-emerald-500/20",
    "Needs Follow-Up":         "bg-yellow-500/10 text-yellow-400 border border-yellow-500/20",
    "Not a Fit":               "bg-red-500/10 text-red-400 border border-red-500/20",
    "No-Show":                 "bg-gray-500/10 text-gray-400 border border-gray-500/20",
    "Cancelled":               "bg-red-500/10 text-red-400 border border-red-500/20",
  };
  const c = cls[stage] ?? "bg-gray-500/10 text-gray-400 border border-gray-500/20";
  return (
    <span className={`inline-flex px-1.5 py-0.5 text-[10px] font-semibold tracking-wide whitespace-nowrap ${c}`}>
      {stage}
    </span>
  );
}

function PackageBadge({ pkg }: { pkg: CoachingPackage }) {
  const cls: Record<CoachingPackage, string> = {
    "Standard":              "bg-blue-500/10 text-blue-400 border border-blue-500/20",
    "Founding Member":       "bg-violet-500/10 text-violet-400 border border-violet-500/20",
    "Legacy":                "bg-amber-500/10 text-amber-300 border border-amber-500/20",
    "Executive Performance": "bg-[#C9A24D]/10 text-[#C9A24D] border border-[#C9A24D]/25",
  };
  return (
    <span className={`inline-flex px-1.5 py-0.5 text-[10px] font-semibold tracking-wide whitespace-nowrap ${cls[pkg]}`}>
      {pkg}
    </span>
  );
}

/* ────────────────────────────────────────────────────────────
   CLIENT JOURNEY TIMELINE
   Shown on approved client cards.
──────────────────────────────────────────────────────────── */

const TIMELINE_STEPS = [
  "Application",
  "Strategy Call",
  "Approved",
  "Agreement",
  "Payment",
  "Onboarding",
  "Program Build",
  "Active",
];

function ClientTimeline({ currentStep = 2 }: { currentStep?: number }) {
  return (
    <div className="mt-3 pt-3 border-t border-white/[0.05]">
      <p className="text-[10px] text-gray-700 uppercase tracking-[0.35em] font-semibold mb-2.5">
        Client Journey
      </p>
      <div className="overflow-x-auto pb-1">
        <div className="flex items-center min-w-max gap-0">
          {TIMELINE_STEPS.map((step, i) => {
            const isCompleted = i < currentStep;
            const isCurrent   = i === currentStep;
            return (
              <div key={step} className="flex items-center">
                {/* Node */}
                <div className="flex flex-col items-center">
                  <div
                    className={`w-5 h-5 rounded-full flex items-center justify-center border text-[9px] font-bold shrink-0 ${
                      isCompleted
                        ? "bg-emerald-500/20 border-emerald-500/40 text-emerald-400"
                        : isCurrent
                        ? "bg-[#C9A24D]/20 border-[#C9A24D]/50 text-[#C9A24D]"
                        : "bg-white/[0.03] border-white/[0.1] text-gray-700"
                    }`}
                  >
                    {isCompleted ? "✓" : isCurrent ? "●" : "○"}
                  </div>
                  <span
                    className={`text-[9px] mt-1 whitespace-nowrap ${
                      isCompleted ? "text-emerald-500/70" : isCurrent ? "text-[#C9A24D]" : "text-gray-700"
                    }`}
                  >
                    {step}
                  </span>
                </div>
                {/* Connector */}
                {i < TIMELINE_STEPS.length - 1 && (
                  <div
                    className={`h-px w-6 mx-0.5 mb-3 shrink-0 ${
                      i < currentStep ? "bg-emerald-500/30" : "bg-white/[0.06]"
                    }`}
                  />
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

/* ────────────────────────────────────────────────────────────
   APPROVE PACKAGE MODAL
──────────────────────────────────────────────────────────── */

function ApproveModal({
  inviteeName,
  onSelect,
  onClose,
}: {
  inviteeName: string;
  onSelect: (pkg: CoachingPackage) => void;
  onClose: () => void;
}) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm px-4"
      onClick={onClose}
    >
      <div
        className="bg-[#0d0e0f] border border-white/[0.1] w-full max-w-sm p-6 relative"
        onClick={e => e.stopPropagation()}
      >
        <div className="h-px absolute top-0 left-0 right-0 bg-gradient-to-r from-transparent via-[#C9A24D]/30 to-transparent" />

        <p className="text-white font-semibold text-sm mb-0.5">Approve Client</p>
        <p className="text-gray-500 text-xs mb-5">
          Select a package for {inviteeName || "this client"}.
        </p>

        <div className="space-y-2 mb-5">
          {COACHING_PACKAGES.map(pkg => {
            const config = PACKAGE_CONFIG[pkg];
            return (
              <button
                key={pkg}
                onClick={() => onSelect(pkg)}
                className="w-full text-left bg-[#141618] border border-white/[0.07] px-4 py-3 hover:border-[#C9A24D]/40 hover:bg-[#C9A24D]/[0.03] transition-colors group"
              >
                <div className="flex items-center justify-between">
                  <span className="text-white text-sm font-medium group-hover:text-[#C9A24D] transition-colors">
                    {pkg}
                  </span>
                  <span className="text-gray-600 text-xs group-hover:text-[#C9A24D]/70 transition-colors">
                    {config.monthlyRateLabel}
                  </span>
                </div>
              </button>
            );
          })}
        </div>

        <button
          onClick={onClose}
          className="w-full text-center text-gray-600 text-xs hover:text-gray-400 transition-colors py-1"
        >
          Cancel
        </button>
      </div>
    </div>
  );
}

/* ────────────────────────────────────────────────────────────
   AGREEMENT STATUS BADGE
──────────────────────────────────────────────────────────── */

function AgreementStatusBadge({
  status,
  isDryRun,
}: {
  status: AgreementStatus;
  isDryRun?: boolean;
}) {
  const cls: Record<AgreementStatus, string> = {
    not_sent:       "bg-gray-500/10 text-gray-500 border border-gray-500/20",
    sent:           "bg-sky-500/10 text-sky-400 border border-sky-500/20",
    client_signed:  "bg-violet-500/10 text-violet-400 border border-violet-500/20",
    awaiting_coach: "bg-amber-500/10 text-amber-400 border border-amber-500/20",
    fully_executed: "bg-emerald-500/10 text-emerald-400 border border-emerald-500/20",
  };
  return (
    <span className="flex items-center gap-1.5 flex-wrap">
      <span className={`inline-flex px-1.5 py-0.5 text-[10px] font-semibold tracking-wide whitespace-nowrap ${cls[status]}`}>
        {AGREEMENT_STATUS_LABELS[status]}
      </span>
      {isDryRun && (
        <span className="inline-flex px-1.5 py-0.5 text-[10px] font-semibold tracking-wide whitespace-nowrap bg-amber-500/10 text-amber-400/70 border border-amber-500/15">
          Dry Run
        </span>
      )}
    </span>
  );
}

/* ────────────────────────────────────────────────────────────
   SEND AGREEMENT MODAL
──────────────────────────────────────────────────────────── */

function ModalRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline gap-2">
      <span className="text-gray-700 text-[10px] uppercase tracking-[0.25em] font-semibold shrink-0 w-16">
        {label}
      </span>
      <span className="text-gray-300 text-xs truncate">{value}</span>
    </div>
  );
}

function SendAgreementModal({
  lead,
  decision,
  onConfirm,
  onClose,
  isSending,
  error,
}: {
  lead: StrategyCallLead;
  decision: StrategyCallDecision;
  onConfirm: (monthlyRate: string, monthlyRateLabel: string, startDate: string) => void;
  onClose: () => void;
  isSending: boolean;
  error?: string | null;
}) {
  const [startDate, setStartDate] = useState(
    new Date().toISOString().split("T")[0],
  );
  // Rate override — default: locked to package config rate
  const [isRateOverridden, setIsRateOverridden] = useState(false);
  const [overrideRate, setOverrideRate] = useState("");
  // TODO: Future — persist rate override with audit trail (who changed it, when, from what)

  const packageRate      = decision.monthlyRate ?? "";
  const packageRateLabel = decision.monthlyRateLabel ?? (packageRate ? `$${packageRate}/month` : "");
  const effectiveRate    = isRateOverridden ? overrideRate.trim() : packageRate;
  const effectiveLabel   = isRateOverridden
    ? (overrideRate.trim() ? `$${overrideRate.trim()}/month` : "")
    : packageRateLabel;

  const canSend = !isSending && effectiveRate.length > 0 && startDate.length > 0;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm px-4"
      onClick={onClose}
    >
      <div
        className="bg-[#0d0e0f] border border-white/[0.1] w-full max-w-sm p-6 relative"
        onClick={e => e.stopPropagation()}
      >
        <div className="h-px absolute top-0 left-0 right-0 bg-gradient-to-r from-transparent via-[#C9A24D]/30 to-transparent" />

        <p className="text-white font-semibold text-sm mb-0.5">Send Agreement</p>
        <p className="text-gray-500 text-xs mb-4">
          Review details before sending the Kynovant agreement to{" "}
          {lead.event.inviteeName || "client"}.
        </p>

        {/* Client + package summary */}
        <div className="bg-[#141618] border border-white/[0.06] px-4 py-3 mb-4 space-y-1.5">
          <ModalRow label="Client"  value={lead.event.inviteeName || "—"} />
          <ModalRow label="Email"   value={lead.event.inviteeEmail || "—"} />
          <ModalRow label="Package" value={decision.package ?? "—"} />
          <ModalRow label="Rate"    value={packageRateLabel || "—"} />
        </div>

        {/* Monthly rate — auto-populated, with optional override */}
        <div className="mb-3">
          <div className="flex items-center justify-between mb-1.5">
            <label className="text-[10px] text-gray-600 uppercase tracking-[0.3em] font-semibold">
              Monthly Rate
            </label>
            {!isRateOverridden ? (
              <button
                type="button"
                onClick={() => { setIsRateOverridden(true); setOverrideRate(packageRate); }}
                className="text-[10px] text-gray-700 hover:text-gray-400 transition-colors"
              >
                Override
              </button>
            ) : (
              <button
                type="button"
                onClick={() => { setIsRateOverridden(false); setOverrideRate(""); }}
                className="text-[10px] text-amber-400/60 hover:text-amber-300 transition-colors"
              >
                Use Package Rate
              </button>
            )}
          </div>
          {isRateOverridden ? (
            <input
              type="text"
              inputMode="numeric"
              placeholder="Enter rate"
              value={overrideRate}
              onChange={e => setOverrideRate(e.target.value)}
              className="w-full bg-[#141618] border border-amber-500/30 px-3 py-2 text-amber-300 text-sm focus:outline-none focus:border-amber-500/50"
            />
          ) : (
            <div className="bg-[#141618] border border-white/[0.07] px-3 py-2 text-gray-400 text-sm flex items-center justify-between select-none">
              <span>{packageRateLabel || "—"}</span>
              <span className="text-gray-700 text-[10px] uppercase tracking-widest">locked</span>
            </div>
          )}
          {isRateOverridden && (
            <p className="text-[10px] text-amber-400/60 mt-1">
              Rate overridden — original: {packageRateLabel}
            </p>
          )}
        </div>

        {/* Start date */}
        <div className="mb-5">
          <label className="text-[10px] text-gray-600 uppercase tracking-[0.3em] font-semibold block mb-1.5">
            Coaching Start Date
          </label>
          <input
            type="date"
            value={startDate}
            onChange={e => setStartDate(e.target.value)}
            className="w-full bg-[#141618] border border-white/[0.07] px-3 py-2 text-white text-sm focus:outline-none focus:border-[#C9A24D]/40"
          />
        </div>

        {/* Error / not-configured message */}
        {error && (
          <div className="mb-4 bg-amber-500/[0.05] border border-amber-500/20 px-3 py-2.5 text-amber-400/80 text-xs leading-relaxed">
            {error}
          </div>
        )}

        <button
          onClick={() => onConfirm(effectiveRate, effectiveLabel, startDate)}
          disabled={!canSend}
          className="w-full py-2.5 text-xs font-semibold tracking-[0.2em] uppercase bg-[#C9A24D]/10 text-[#C9A24D] border border-[#C9A24D]/30 hover:bg-[#C9A24D]/20 hover:border-[#C9A24D]/50 transition-colors disabled:opacity-40 disabled:cursor-not-allowed mb-2"
        >
          {isSending ? "Sending…" : "Send Agreement"}
        </button>

        <button
          onClick={onClose}
          disabled={isSending}
          className="w-full text-center text-gray-600 text-xs hover:text-gray-400 transition-colors py-1 disabled:opacity-40"
        >
          Cancel
        </button>
      </div>
    </div>
  );
}

/* ────────────────────────────────────────────────────────────
   APPLICATION MATCH PANEL
──────────────────────────────────────────────────────────── */

function ApplicationMatchPanel({ app }: { app: ApplicationData | null }) {
  if (!app) {
    return (
      <div className="mt-2 bg-amber-500/[0.04] border border-amber-500/15 px-3 py-2">
        <p className="text-amber-400/70 text-[11px]">No application match found</p>
      </div>
    );
  }
  return (
    <div className="mt-2 bg-white/[0.02] border border-white/[0.05] px-3 py-2.5 space-y-1.5">
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-x-4 gap-y-1.5 text-[11px]">
        {app.goal && (
          <div>
            <span className="text-gray-700 uppercase tracking-[0.25em] text-[9px] font-semibold">Goal</span>
            <p className="text-gray-300 mt-0.5">{app.goal}</p>
          </div>
        )}
        {app.budget && (
          <div>
            <span className="text-gray-700 uppercase tracking-[0.25em] text-[9px] font-semibold">Budget</span>
            <p className="text-gray-300 mt-0.5">{app.budget}</p>
          </div>
        )}
        {app.commitment && (
          <div>
            <span className="text-gray-700 uppercase tracking-[0.25em] text-[9px] font-semibold">Timeline</span>
            <p className="text-gray-300 mt-0.5">{app.commitment}</p>
          </div>
        )}
        {app.referralSource && (
          <div>
            <span className="text-gray-700 uppercase tracking-[0.25em] text-[9px] font-semibold">Source</span>
            <p className="text-gray-300 mt-0.5">
              {app.referralSource}
              {app.referralName && <span className="text-gray-600"> — {app.referralName}</span>}
            </p>
          </div>
        )}
      </div>
      {app.goalsDetails && (
        <div className="pt-1.5 border-t border-white/[0.05]">
          <span className="text-gray-700 uppercase tracking-[0.25em] text-[9px] font-semibold">Notes</span>
          <p className="text-gray-500 text-[11px] mt-0.5 leading-relaxed line-clamp-3">{app.goalsDetails}</p>
        </div>
      )}
    </div>
  );
}

/* ────────────────────────────────────────────────────────────
   STRATEGY CALL CARD
──────────────────────────────────────────────────────────── */

function outcomeLabel(outcome: StrategyCallOutcome): string {
  const m: Record<StrategyCallOutcome, string> = {
    pending:          "Pending",
    approved:         "Approved",
    "needs-follow-up":"Needs Follow-Up",
    "not-a-fit":      "Not a Fit",
    "no-show":        "No-Show",
  };
  return m[outcome];
}

function borderColor(baseStage: StrategyCallLead["baseStage"], outcome: StrategyCallOutcome): string {
  if (outcome === "approved")         return "border-l-emerald-500/60";
  if (outcome === "needs-follow-up")  return "border-l-yellow-500/60";
  if (outcome === "not-a-fit")        return "border-l-red-500/60";
  if (outcome === "no-show")          return "border-l-gray-600/60";
  if (baseStage === "Strategy Call Booked")    return "border-l-sky-500/50";
  if (baseStage === "Strategy Call Completed") return "border-l-indigo-500/50";
  return "border-l-red-500/40";
}

interface StrategyCallCardProps {
  lead: StrategyCallLead;
  decision: StrategyCallDecision | undefined;
  onApprove: () => void;
  onOutcome: (outcome: Exclude<StrategyCallOutcome, "approved" | "pending">) => void;
  onStartEdit: () => void;
  onCancelEdit: () => void;
  showActions: boolean;
  isEditing: boolean;
  onArchive?: () => void;
  onRestore?: () => void;
  agreementState?: AgreementState;
  onSendAgreementClick?: () => void;
}

function StrategyCallCard({
  lead,
  decision,
  onApprove,
  onOutcome,
  onStartEdit,
  onCancelEdit,
  showActions,
  isEditing,
  onArchive,
  onRestore,
  agreementState,
  onSendAgreementClick,
}: StrategyCallCardProps) {
  const { event, application, baseStage } = lead;
  const outcome: StrategyCallOutcome = decision?.outcome ?? "pending";
  const border = borderColor(baseStage, outcome);

  const displayStage =
    outcome === "approved"          ? "Approved"
    : outcome === "needs-follow-up" ? "Needs Follow-Up"
    : outcome === "not-a-fit"       ? "Not a Fit"
    : outcome === "no-show"         ? "No-Show"
    : baseStage;

  // Show action buttons when: pending with showActions=true, OR currently editing
  const showingActions = (showActions && outcome === "pending") || isEditing;
  // Show the "Edit Decision" button when a decision exists and we're not already editing
  const showEditButton = outcome !== "pending" && !isEditing;

  const nextAction =
    outcome !== "pending" && !isEditing
      ? outcomeNextAction(outcome, decision?.package)
      : baseStage === "Strategy Call Booked"
      ? `Prepare for call on ${fmtDate(event.startTime)} at ${fmtTime(event.startTime)}`
      : baseStage === "Strategy Call Completed"
      ? "Record outcome using the buttons below"
      : "Reach out to reschedule or nurture";

  return (
    <div className={`bg-[#0d0e0f] border border-white/[0.06] border-l-2 ${border} relative overflow-hidden`}>
      <div className="h-px absolute top-0 left-0 right-0 bg-gradient-to-r from-transparent via-white/[0.03] to-transparent" />

      <div className="px-4 py-3">
        {/* Header row */}
        <div className="flex items-start justify-between gap-4">
          <div className="flex-1 min-w-0">
            <div className="flex flex-wrap items-center gap-2 mb-0.5">
              <span className="text-white text-sm font-semibold">
                {event.inviteeName || "Unknown"}
              </span>
              <StageBadge stage={isEditing ? baseStage : displayStage} />
              {!isEditing && decision?.package && <PackageBadge pkg={decision.package} />}
              {application && (
                <span className="text-[10px] bg-emerald-500/10 text-emerald-500/70 border border-emerald-500/15 px-1.5 py-0.5">
                  Matched
                </span>
              )}
            </div>
            <p className="text-gray-600 text-xs">{event.inviteeEmail || "—"}</p>
          </div>

          <div className="text-right shrink-0">
            <p className="text-white/70 text-xs font-medium">
              {baseStage === "Strategy Call Booked"
                ? fmtDate(event.startTime)
                : fmtRelative(event.startTime)}
            </p>
            <p className="text-gray-700 text-[11px]">{fmtTime(event.startTime)}</p>
            {event.location && (
              <p className="text-gray-700 text-[10px] mt-0.5 max-w-[140px] truncate" title={event.location}>
                {event.location.startsWith("http") ? "Video call" : event.location}
              </p>
            )}
          </div>
        </div>

        {/* Event name */}
        <p className="text-gray-700 text-[11px] mt-0.5">{event.name}</p>

        {/* Cancellation reason */}
        {event.cancellationReason && (
          <p className="text-gray-600 text-[11px] mt-1 italic">
            Reason: {event.cancellationReason}
          </p>
        )}

        {/* Application match panel */}
        <ApplicationMatchPanel app={application} />

        {/* Next action */}
        <div className="mt-2.5 pt-2 border-t border-white/[0.04] flex items-center gap-2">
          <span className="text-gray-700 text-[11px] shrink-0">Next:</span>
          <span className="text-gray-500 text-[11px] leading-relaxed">{nextAction}</span>
        </div>

        {/* ── Action buttons ── */}
        {showingActions && (
          <div className="mt-3">
            {isEditing && outcome !== "pending" && (
              <p className="text-[10px] text-gray-700 uppercase tracking-[0.3em] font-semibold mb-2">
                Change outcome
              </p>
            )}
            <div className="flex flex-wrap gap-2">
              <button
                onClick={onApprove}
                className="px-3 py-1.5 text-[11px] font-semibold tracking-wide bg-emerald-500/10 text-emerald-400 border border-emerald-500/25 hover:bg-emerald-500/20 hover:border-emerald-500/40 transition-colors"
              >
                Approve Client
              </button>
              <button
                onClick={() => onOutcome("needs-follow-up")}
                className="px-3 py-1.5 text-[11px] font-semibold tracking-wide bg-yellow-500/10 text-yellow-400 border border-yellow-500/25 hover:bg-yellow-500/20 hover:border-yellow-500/40 transition-colors"
              >
                Needs Follow-Up
              </button>
              <button
                onClick={() => onOutcome("not-a-fit")}
                className="px-3 py-1.5 text-[11px] font-semibold tracking-wide bg-red-500/10 text-red-400 border border-red-500/25 hover:bg-red-500/20 hover:border-red-500/40 transition-colors"
              >
                Not a Fit
              </button>
              <button
                onClick={() => onOutcome("no-show")}
                className="px-3 py-1.5 text-[11px] font-semibold tracking-wide bg-white/[0.04] text-gray-500 border border-white/[0.1] hover:bg-white/[0.07] hover:text-gray-300 transition-colors"
              >
                No-Show
              </button>
              {/* Cancel edit — only shown when correcting an existing decision */}
              {isEditing && (
                <button
                  onClick={onCancelEdit}
                  className="px-3 py-1.5 text-[11px] text-gray-700 hover:text-gray-400 transition-colors"
                >
                  Cancel
                </button>
              )}
            </div>
          </div>
        )}

        {/* ── Outcome display + Edit Decision button ── */}
        {outcome !== "pending" && !isEditing && (
          <div className="mt-3 flex flex-wrap items-center gap-3">
            <span className="text-[10px] text-gray-700 uppercase tracking-[0.3em] font-semibold">
              Outcome:
            </span>
            <span className={`text-xs font-semibold ${
              outcome === "approved"          ? "text-emerald-400"
              : outcome === "needs-follow-up" ? "text-yellow-400"
              : outcome === "not-a-fit"       ? "text-red-400"
              :                                 "text-gray-400"
            }`}>
              {outcomeLabel(outcome)}
            </span>
            {decision?.decidedAt && (
              <span className="text-gray-700 text-[10px]">
                — {new Date(decision.decidedAt).toLocaleDateString("en-US", { month: "short", day: "numeric" })}
              </span>
            )}
            {/* Edit Decision — allows correcting a mistake or updating outcome/package */}
            {/* TODO: Future persistence will save decision changes to CRM/database. */}
            {showEditButton && (
              <button
                onClick={onStartEdit}
                className="ml-auto text-[11px] text-gray-600 border border-white/[0.07] px-2.5 py-1 hover:text-gray-300 hover:border-white/20 transition-colors"
              >
                Edit Decision
              </button>
            )}
          </div>
        )}

        {/* ── Timeline — approved clients only (hidden while editing) ── */}
        {outcome === "approved" && !isEditing && <ClientTimeline currentStep={2} />}

        {/* ── Agreement Workflow — approved clients only ── */}
        {outcome === "approved" && !isEditing && (
          <div className="mt-3 pt-3 border-t border-white/[0.05]">
            {/* Status row */}
            <div className="flex flex-wrap items-center gap-2 mb-2">
              <span className="text-[10px] text-gray-700 uppercase tracking-[0.35em] font-semibold shrink-0">
                Agreement
              </span>
              <AgreementStatusBadge
                status={agreementState?.status ?? "not_sent"}
                isDryRun={agreementState?.isDryRun}
              />
            </div>

            {/* Rate / start date — shown once agreement has been sent */}
            {agreementState && agreementState.status !== "not_sent" && (
              <div className="text-[11px] space-y-0.5 mb-2">
                <p className="text-gray-700">
                  Package: <span className="text-gray-400">{agreementState.packageName}</span>
                </p>
                <p className="text-gray-700">
                  Monthly Rate:{" "}
                  <span className={`${agreementState.rateWasOverridden ? "text-amber-400/80" : "text-gray-400"}`}>
                    {agreementState.monthlyRateLabel}
                    {agreementState.rateWasOverridden && (
                      <span className="text-amber-500/60 text-[10px] ml-1">(overridden)</span>
                    )}
                  </span>
                </p>
                <p className="text-gray-700">
                  Start Date: <span className="text-gray-400">{agreementState.startDate}</span>
                </p>
                {agreementState.envelopeId && !agreementState.isDryRun && (
                  <p className="text-gray-700 mt-0.5">
                    Envelope:{" "}
                    <span className="font-mono text-[10px] text-gray-600 tracking-tight">
                      {agreementState.envelopeId}
                    </span>
                  </p>
                )}
              </div>
            )}

            {/* Next action for the agreement step */}
            <p className="text-[11px] text-gray-700 mb-2">
              Next:{" "}
              <span className="text-gray-500">
                {agreementNextAction(agreementState?.status ?? "not_sent")}
              </span>
            </p>

            {/* Send Agreement button — only shown when agreement not yet sent */}
            {(!agreementState || agreementState.status === "not_sent") &&
              onSendAgreementClick && (
                <button
                  onClick={onSendAgreementClick}
                  className="px-3 py-1.5 text-[11px] font-semibold tracking-wide bg-[#C9A24D]/10 text-[#C9A24D] border border-[#C9A24D]/30 hover:bg-[#C9A24D]/20 hover:border-[#C9A24D]/50 transition-colors"
                >
                  Send Agreement
                </button>
              )}
          </div>
        )}

        {/* ── Archive / Restore footer ── */}
        {(onArchive || onRestore) && (
          <div className="mt-2.5 pt-2 border-t border-white/[0.04] flex items-center">
            {onArchive && (
              <button
                onClick={onArchive}
                className="text-[11px] text-gray-700 hover:text-gray-400 transition-colors"
              >
                Archive Lead
              </button>
            )}
            {onRestore && (
              <button
                onClick={onRestore}
                className="text-[11px] text-gray-600 border border-white/[0.07] px-2.5 py-1 hover:text-gray-300 hover:border-white/20 transition-colors"
              >
                Restore Lead
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

/* ────────────────────────────────────────────────────────────
   SECTION WRAPPER
──────────────────────────────────────────────────────────── */

function Section({
  title,
  count,
  children,
  emptyMessage,
}: {
  title: string;
  count: number;
  children: React.ReactNode;
  emptyMessage: string;
}) {
  return (
    <div>
      <div className="flex items-center gap-3 mb-3">
        <h3 className="text-[10px] tracking-[0.5em] text-gray-600 uppercase font-semibold">
          {title}
        </h3>
        <span className="text-[10px] text-gray-700 border border-white/[0.07] px-2 py-0.5">
          {count}
        </span>
      </div>
      {count === 0 ? (
        <p className="text-gray-700 text-xs py-3">{emptyMessage}</p>
      ) : (
        <div className="space-y-3">{children}</div>
      )}
    </div>
  );
}

/* ────────────────────────────────────────────────────────────
   MAIN TAB
──────────────────────────────────────────────────────────── */

const INIT_CALENDLY: CalendlyState = {
  status: "loading",
  upcoming: [],
  completed: [],
  cancelled: [],
};

const INIT_APPS: AppsState = {
  status: "loading",
  byEmail: new Map(),
};

// TODO: Future persistence should save archived lead status to CRM/database.
const ARCHIVE_STORAGE_KEY = "catalyst_sc_archived_uris";

export default function StrategyCallsTab() {
  const [calendly, setCalendly] = useState<CalendlyState>(INIT_CALENDLY);
  const [apps, setApps]         = useState<AppsState>(INIT_APPS);
  // Keyed by event.uri — local UI state only (not persisted)
  const [decisions, setDecisions] = useState<Record<string, StrategyCallDecision>>({});
  const [pendingApprovalUri, setPendingApprovalUri] = useState<string | null>(null);
  const [editingUri, setEditingUri] = useState<string | null>(null);
  // Agreement workflow state — keyed by event.uri
  // TODO: Future automation: real DocuSign envelope ID should be persisted and tracked via DocuSign webhook.
  const [agreements, setAgreements] = useState<Record<string, AgreementState>>({});
  const [pendingSendAgreementUri, setPendingSendAgreementUri] = useState<string | null>(null);
  const [sendingAgreement, setSendingAgreement] = useState(false);
  const [sendAgreementError, setSendAgreementError] = useState<string | null>(null);
  // Persisted in localStorage; CRM persistence is a future sprint
  const [archivedUris, setArchivedUris] = useState<Set<string>>(() => {
    if (typeof window === "undefined") return new Set<string>();
    try {
      const raw = localStorage.getItem(ARCHIVE_STORAGE_KEY);
      return new Set(raw ? (JSON.parse(raw) as string[]) : []);
    } catch {
      return new Set<string>();
    }
  });
  const [showArchived, setShowArchived] = useState(false);
  const [lastFetch, setLastFetch]   = useState<string | null>(null);
  const [refreshTick, setRefreshTick] = useState(0);

  useEffect(() => {
    let mounted = true;

    Promise.all([
      fetchCalendlyEvents(),
      fetchSheetData("applications"),
    ]).then(([calRes, appsRes]) => {
      if (!mounted) return;

      setCalendly({
        status:     calRes.ok ? "ok" : "error",
        upcoming:   calRes.upcoming,
        completed:  calRes.recent,
        cancelled:  calRes.cancelled,
        error:      calRes.error,
        unconfigured: calRes.unconfigured,
      });

      setApps({
        status:     appsRes.ok ? "ok" : "error",
        byEmail:    appsRes.ok ? buildApplicationMap(appsRes.rows) : new Map(),
        error:      appsRes.error,
        unconfigured: appsRes.error?.includes("not set in .env.local"),
      });

      setLastFetch(new Date().toLocaleTimeString());
    });

    return () => { mounted = false; };
  }, [refreshTick]);

  const handleRefresh = () => {
    setCalendly(INIT_CALENDLY);
    setApps(INIT_APPS);
    setRefreshTick(t => t + 1);
  };

  const handleApprove = (uri: string) => setPendingApprovalUri(uri);

  const handlePackageSelect = (pkg: CoachingPackage) => {
    if (!pendingApprovalUri) return;
    const config = PACKAGE_CONFIG[pkg];
    setDecisions(prev => ({
      ...prev,
      [pendingApprovalUri]: {
        outcome:          "approved",
        package:          pkg,
        monthlyRate:      config.monthlyRate,
        monthlyRateLabel: config.monthlyRateLabel,
        decidedAt:        new Date().toISOString(),
      },
    }));
    setPendingApprovalUri(null);
    setEditingUri(null);
  };

  const handleOutcome = (
    uri: string,
    outcome: Exclude<StrategyCallOutcome, "approved" | "pending">,
  ) => {
    setDecisions(prev => ({
      ...prev,
      [uri]: { outcome, decidedAt: new Date().toISOString() },
    }));
    setEditingUri(null);
  };

  const handleArchive = (uri: string) => {
    if (editingUri === uri) setEditingUri(null);
    setArchivedUris(prev => {
      const next = new Set(prev);
      next.add(uri);
      try { localStorage.setItem(ARCHIVE_STORAGE_KEY, JSON.stringify([...next])); } catch { /* storage unavailable */ }
      return next;
    });
  };

  const handleRestore = (uri: string) => {
    setArchivedUris(prev => {
      const next = new Set(prev);
      next.delete(uri);
      try { localStorage.setItem(ARCHIVE_STORAGE_KEY, JSON.stringify([...next])); } catch { /* storage unavailable */ }
      return next;
    });
  };

  const handleSendAgreementConfirm = async (
    monthlyRate: string,
    monthlyRateLabel: string,
    startDate: string,
  ) => {
    const uri = pendingSendAgreementUri;
    if (!uri) return;

    const decision = decisions[uri];
    if (!decision?.package) {
      setSendAgreementError("No package selected. Please re-approve the client first.");
      return;
    }

    setSendingAgreement(true);
    setSendAgreementError(null);

    const lead = [...allUpcomingLeads, ...allCompletedLeads, ...allCancelledLeads]
      .find(l => l.event.uri === uri);

    try {
      const res = await fetch("/api/docusign/send-agreement", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          clientName:       lead?.event.inviteeName ?? "",
          clientEmail:      lead?.event.inviteeEmail ?? "",
          packageName:      decision.package,
          monthlyRate,
          monthlyRateLabel,
          startDate,
        }),
      });
      const data = (await res.json()) as {
        ok: boolean;
        configured: boolean;
        mode?: string;
        envelopeId?: string;
        message: string;
      };

      if (!data.configured) {
        setSendAgreementError(
          "DocuSign is not configured yet. Add DocuSign environment variables before sending real agreements.",
        );
        setSendingAgreement(false);
        return;
      }

      if (!data.ok) {
        setSendAgreementError(data.message ?? "DocuSign error — check server logs.");
        setSendingAgreement(false);
        return;
      }

      // TODO: Future — envelopeId should be persisted to CRM/database and tracked via DocuSign Connect webhook.
      setAgreements(prev => ({
        ...prev,
        [uri]: {
          status:            "sent",
          packageName:       decision.package as NonNullable<typeof decision.package>,
          monthlyRate,
          monthlyRateLabel,
          startDate,
          sentAt:            new Date().toISOString(),
          envelopeId:        data.envelopeId,
          isDryRun:          data.mode === "dry_run",
          rateWasOverridden: monthlyRate !== (decision.monthlyRate ?? ""),
        },
      }));
      setPendingSendAgreementUri(null);
      setSendAgreementError(null);
    } catch {
      setSendAgreementError("Network error — please try again.");
    }
    setSendingAgreement(false);
  };

  // Build leads from live Calendly data + application matches
  function buildLeads(events: CalendlyEvent[], baseStage: StrategyCallLead["baseStage"]): StrategyCallLead[] {
    return events.map(event => ({
      event,
      application: apps.status === "ok" ? matchApplication(event, apps.byEmail) : null,
      baseStage,
    }));
  }

  const allUpcomingLeads  = buildLeads(calendly.upcoming,  "Strategy Call Booked");
  const allCompletedLeads = buildLeads(calendly.completed, "Strategy Call Completed");
  const allCancelledLeads = buildLeads(calendly.cancelled, "Cancelled");

  const upcomingLeads  = allUpcomingLeads.filter(l => !archivedUris.has(l.event.uri));
  const completedLeads = allCompletedLeads.filter(l => !archivedUris.has(l.event.uri));
  const cancelledLeads = allCancelledLeads.filter(l => !archivedUris.has(l.event.uri));

  // Unmatched = any active (non-archived) event with no application match
  const unmatchedLeads = [
    ...upcomingLeads,
    ...completedLeads,
    ...cancelledLeads,
  ].filter(l => l.application === null);

  // Archived leads — sourced from all raw event lists so URIs stored in localStorage always resolve
  const archivedLeads = [
    ...allUpcomingLeads,
    ...allCompletedLeads,
    ...allCancelledLeads,
  ].filter(l => archivedUris.has(l.event.uri));

  // Stats
  const approvedCount = Object.values(decisions).filter(d => d.outcome === "approved").length;
  const pendingDecisionCount = completedLeads.filter(l => !decisions[l.event.uri]).length;

  // The event name of the pending approval (for modal)
  const pendingInviteeName = pendingApprovalUri
    ? ([...upcomingLeads, ...completedLeads, ...cancelledLeads]
        .find(l => l.event.uri === pendingApprovalUri)?.event.inviteeName ?? "")
    : "";

  // Pre-computed lead + decision for the Send Agreement modal
  const allLeadsFlat = [...allUpcomingLeads, ...allCompletedLeads, ...allCancelledLeads];
  const pendingSendAgreementLead     = pendingSendAgreementUri
    ? (allLeadsFlat.find(l => l.event.uri === pendingSendAgreementUri) ?? null)
    : null;
  const pendingSendAgreementDecision = pendingSendAgreementUri
    ? (decisions[pendingSendAgreementUri] ?? null)
    : null;

  const isLoading = calendly.status === "loading" || apps.status === "loading";

  return (
    <>
      {/* ── APPROVE PACKAGE MODAL ─────────────────────── */}
      {pendingApprovalUri && (
        <ApproveModal
          inviteeName={pendingInviteeName}
          onSelect={handlePackageSelect}
          onClose={() => setPendingApprovalUri(null)}
        />
      )}

      {/* ── SEND AGREEMENT MODAL ──────────────────────── */}
      {pendingSendAgreementUri &&
        pendingSendAgreementLead &&
        pendingSendAgreementDecision && (
          <SendAgreementModal
            lead={pendingSendAgreementLead}
            decision={pendingSendAgreementDecision}
            onConfirm={handleSendAgreementConfirm}
            onClose={() => {
              setPendingSendAgreementUri(null);
              setSendAgreementError(null);
            }}
            isSending={sendingAgreement}
            error={sendAgreementError}
          />
        )}

      <div className="space-y-8">

        {/* ── HEADER ──────────────────────────────────── */}
        <div className="flex items-center justify-between">
          <div>
            <p className="text-white text-sm font-semibold tracking-wide">Strategy Call Workflow</p>
            <p className="text-gray-600 text-xs mt-0.5">
              {lastFetch ? `Last fetched at ${lastFetch}` : "Fetching…"}
            </p>
          </div>
          <button
            onClick={handleRefresh}
            disabled={isLoading}
            className="text-[11px] tracking-[0.25em] uppercase font-semibold text-gray-500 border border-white/[0.08] px-4 py-2 hover:text-white hover:border-white/20 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
          >
            Refresh
          </button>
        </div>

        {/* ── LOADING ─────────────────────────────────── */}
        {isLoading && (
          <div className="space-y-2">
            {[1, 2, 3, 4].map(i => (
              <div key={i} className="h-20 bg-white/[0.02] animate-pulse" />
            ))}
          </div>
        )}

        {/* ── CALENDLY NOT CONFIGURED ─────────────────── */}
        {!isLoading && calendly.status === "error" && calendly.unconfigured && (
          <div className="bg-amber-500/[0.05] border border-amber-500/20 px-5 py-4 space-y-1">
            <div className="flex items-center gap-2">
              <div className="w-1.5 h-1.5 rounded-full bg-amber-500 shrink-0" />
              <p className="text-amber-400 text-xs font-semibold tracking-wide">Calendly Not Configured</p>
            </div>
            <p className="text-amber-400/70 text-xs leading-relaxed">
              Add <code className="text-amber-300 font-mono text-[11px]">CALENDLY_PERSONAL_ACCESS_TOKEN</code>
              {" "}and <code className="text-amber-300 font-mono text-[11px]">CALENDLY_USER_URI</code>
              {" "}to <code className="text-amber-300 font-mono text-[11px]">.env.local</code> to connect your Calendly account.
            </p>
          </div>
        )}

        {/* ── CALENDLY ERROR ──────────────────────────── */}
        {!isLoading && calendly.status === "error" && !calendly.unconfigured && (
          <div className="bg-red-500/[0.04] border border-red-500/15 px-4 py-3 text-xs text-red-400/80">
            {calendly.error ?? "Error fetching Calendly events"}
          </div>
        )}

        {/* ── APPLICATIONS WARNING (non-blocking) ─────── */}
        {!isLoading && apps.status === "error" && (
          <div className="bg-amber-500/[0.04] border border-amber-500/15 px-4 py-2.5 flex items-start gap-2">
            <div className="w-1 h-1 rounded-full bg-amber-500/60 mt-1.5 shrink-0" />
            <p className="text-amber-400/60 text-[11px] leading-relaxed">
              Application data unavailable
              {apps.unconfigured && " — SHEETS_APPLICATIONS_GAS_URL not configured"}.
              Strategy calls will show without application matches.
            </p>
          </div>
        )}

        {/* ── LIVE DATA ───────────────────────────────── */}
        {!isLoading && calendly.status === "ok" && (
          <>
            {/* Stats bar */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              {[
                { label: "Upcoming Calls",      value: calendly.upcoming.length,  gold: calendly.upcoming.length > 0, warn: false },
                { label: "Needs Decision",       value: pendingDecisionCount,      gold: false, warn: pendingDecisionCount > 0 },
                { label: "Approved",             value: approvedCount,             gold: false, emerald: approvedCount > 0 },
                { label: "Cancelled (30d)",      value: calendly.cancelled.length, gold: false, warn: false },
              ].map(({ label, value, gold, warn, emerald }) => (
                <div key={label} className="bg-[#0d0e0f] border border-white/[0.06] px-4 py-4 relative overflow-hidden">
                  <div className="h-px absolute top-0 left-0 right-0 bg-gradient-to-r from-transparent via-[#C9A24D]/15 to-transparent" />
                  <p className={`text-2xl font-bold tabular-nums leading-none mb-1.5 ${
                    gold    ? "text-[#C9A24D]"
                    : warn  ? "text-red-400"
                    : (emerald as boolean | undefined) ? "text-emerald-400"
                    : "text-white"
                  }`}>
                    {value}
                  </p>
                  <p className="text-[10px] text-gray-600 uppercase tracking-[0.35em]">{label}</p>
                </div>
              ))}
            </div>

            {/* ── UPCOMING STRATEGY CALLS ───────────────── */}
            <Section
              title="Upcoming Strategy Calls"
              count={upcomingLeads.length}
              emptyMessage="No upcoming strategy calls scheduled."
            >
              {upcomingLeads.map(lead => (
                <StrategyCallCard
                  key={lead.event.uri}
                  lead={lead}
                  decision={decisions[lead.event.uri]}
                  onApprove={() => handleApprove(lead.event.uri)}
                  onOutcome={outcome => handleOutcome(lead.event.uri, outcome)}
                  showActions={false}
                  isEditing={editingUri === lead.event.uri}
                  onStartEdit={() => setEditingUri(lead.event.uri)}
                  onCancelEdit={() => setEditingUri(null)}
                  onArchive={() => handleArchive(lead.event.uri)}
                  agreementState={agreements[lead.event.uri]}
                  onSendAgreementClick={() => setPendingSendAgreementUri(lead.event.uri)}
                />
              ))}
            </Section>

            <div className="h-px bg-white/[0.04]" />

            {/* ── COMPLETED STRATEGY CALLS ─────────────── */}
            <Section
              title="Completed Strategy Calls"
              count={completedLeads.length}
              emptyMessage="No completed calls in the last 30 days."
            >
              {completedLeads.map(lead => (
                <StrategyCallCard
                  key={lead.event.uri}
                  lead={lead}
                  decision={decisions[lead.event.uri]}
                  onApprove={() => handleApprove(lead.event.uri)}
                  onOutcome={outcome => handleOutcome(lead.event.uri, outcome)}
                  showActions={true}
                  isEditing={editingUri === lead.event.uri}
                  onStartEdit={() => setEditingUri(lead.event.uri)}
                  onCancelEdit={() => setEditingUri(null)}
                  onArchive={() => handleArchive(lead.event.uri)}
                  agreementState={agreements[lead.event.uri]}
                  onSendAgreementClick={() => setPendingSendAgreementUri(lead.event.uri)}
                />
              ))}
            </Section>

            <div className="h-px bg-white/[0.04]" />

            {/* ── CANCELLED CALLS ──────────────────────── */}
            <Section
              title="Cancelled Calls"
              count={cancelledLeads.length}
              emptyMessage="No cancelled calls in the last 30 days."
            >
              {cancelledLeads.map(lead => (
                <StrategyCallCard
                  key={lead.event.uri}
                  lead={lead}
                  decision={decisions[lead.event.uri]}
                  onApprove={() => handleApprove(lead.event.uri)}
                  onOutcome={outcome => handleOutcome(lead.event.uri, outcome)}
                  showActions={false}
                  isEditing={editingUri === lead.event.uri}
                  onStartEdit={() => setEditingUri(lead.event.uri)}
                  onCancelEdit={() => setEditingUri(null)}
                  onArchive={() => handleArchive(lead.event.uri)}
                  agreementState={agreements[lead.event.uri]}
                  onSendAgreementClick={() => setPendingSendAgreementUri(lead.event.uri)}
                />
              ))}
            </Section>

            <div className="h-px bg-white/[0.04]" />

            {/* ── UNMATCHED BOOKINGS ────────────────────── */}
            <Section
              title="Unmatched Calendly Bookings"
              count={unmatchedLeads.length}
              emptyMessage="All bookings have matching applications."
            >
              {unmatchedLeads.map(lead => (
                <StrategyCallCard
                  key={`unmatched-${lead.event.uri}`}
                  lead={lead}
                  decision={decisions[lead.event.uri]}
                  onApprove={() => handleApprove(lead.event.uri)}
                  onOutcome={outcome => handleOutcome(lead.event.uri, outcome)}
                  showActions={lead.baseStage === "Strategy Call Completed"}
                  isEditing={editingUri === lead.event.uri}
                  onStartEdit={() => setEditingUri(lead.event.uri)}
                  onCancelEdit={() => setEditingUri(null)}
                  onArchive={() => handleArchive(lead.event.uri)}
                  agreementState={agreements[lead.event.uri]}
                  onSendAgreementClick={() => setPendingSendAgreementUri(lead.event.uri)}
                />
              ))}
            </Section>

            <div className="h-px bg-white/[0.04]" />

            {/* ── ARCHIVED LEADS ───────────────────────── */}
            <div>
              <button
                onClick={() => setShowArchived(v => !v)}
                className="flex items-center gap-3 w-full text-left group"
              >
                <h3 className="text-[10px] tracking-[0.5em] text-gray-700 uppercase font-semibold group-hover:text-gray-500 transition-colors">
                  Archived Leads
                </h3>
                <span className="text-[10px] text-gray-700 border border-white/[0.07] px-2 py-0.5">
                  {archivedLeads.length}
                </span>
                <span className="text-gray-700 text-[10px] ml-auto group-hover:text-gray-500 transition-colors">
                  {showArchived ? "▲ Hide" : "▼ Show"}
                </span>
              </button>

              {showArchived && (
                <div className="mt-3">
                  {archivedLeads.length === 0 ? (
                    <p className="text-gray-700 text-xs py-3">No archived leads.</p>
                  ) : (
                    <div className="space-y-3">
                      {archivedLeads.map(lead => (
                        <StrategyCallCard
                          key={`archived-${lead.event.uri}`}
                          lead={lead}
                          decision={decisions[lead.event.uri]}
                          onApprove={() => {}}
                          onOutcome={() => {}}
                          showActions={false}
                          isEditing={false}
                          onStartEdit={() => {}}
                          onCancelEdit={() => {}}
                          onRestore={() => handleRestore(lead.event.uri)}
                        />
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          </>
        )}

        {/* ── FUTURE INTEGRATIONS NOTE ───────────────── */}
        {!isLoading && calendly.status === "ok" && (
          <div className="bg-[#0a0b0c] border border-white/[0.04] border-dashed px-5 py-4">
            <p className="text-[10px] tracking-[0.5em] text-gray-700 uppercase font-semibold mb-2">
              Sprint 2 — Upcoming Automation
            </p>
            <ul className="space-y-1 text-[11px] text-gray-700 leading-relaxed">
              <li>→ Persist workflow decisions (approved/follow-up/not-a-fit/no-show) to Google Sheets</li>
              <li>→ Trigger agreement email when client is approved</li>
              <li>→ Auto-advance pipeline stage after each lifecycle event</li>
              <li>→ DocuSign / PandaDoc integration for agreement signing</li>
            </ul>
          </div>
        )}

      </div>
    </>
  );
}
