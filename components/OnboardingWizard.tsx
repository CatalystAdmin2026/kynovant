"use client";

import { useState, useEffect, useRef } from "react";
import Image from "next/image";
import {
  ChevronLeft,
  ChevronRight,
  Check,
  Clock,
  Save,
  AlertCircle,
} from "lucide-react";

// ── Types ──────────────────────────────────────────────────────────────────

export type FieldType =
  | "text" | "email" | "tel" | "date"
  | "textarea" | "select" | "checkbox" | "info" | "signature"
  | "card";

export interface CardOption {
  value: string;
  label: string;
  description?: string;
}

export interface Field {
  id: string;
  label: string;
  type: FieldType;
  placeholder?: string;
  required?: boolean;
  options?: string[];
  cardOptions?: CardOption[];
  rows?: number;
  hint?: string;
  content?: string;
}

export interface Phase {
  title: string;
  subtitle: string;
  fields: Field[];
}

export interface WizardProps {
  phases: Phase[];
  heading: string;
  headingLine2: string;
  welcomeSubheading: string;
  welcomeBody: string;
  welcomeChecklist: string[];
  totalMinutes: number;
  scriptUrl: string;
  storageKey: string;
  formType: string;
  packageType: string;
}

type FormValues = Record<string, string>;
type SubmitPhase = "idle" | "building" | "done" | "error";

const SUBMIT_SEQUENCE = [
  "Analyzing your goals…",
  "Reviewing your lifestyle and schedule…",
  "Mapping your nutrition strategy…",
  "Designing your training framework…",
  "Preparing your complete coaching system…",
];

// ── Card selection field ───────────────────────────────────────────────────

function CardField({
  field,
  value,
  onChange,
}: {
  field: Field;
  value: string;
  onChange: (id: string, val: string) => void;
}) {
  return (
    <div className="grid grid-cols-2 gap-2">
      {field.cardOptions?.map(opt => {
        const selected = value === opt.value;
        return (
          <button
            key={opt.value}
            type="button"
            onClick={() => onChange(field.id, opt.value)}
            className={[
              "relative text-left p-4 transition-all duration-200 outline-none focus-visible:ring-1 focus-visible:ring-[#C9A44C]/50",
              selected
                ? "bg-[#C9A44C]/[0.07] border border-[#C9A44C]/40"
                : "bg-white/[0.02] border border-white/[0.08] hover:border-white/[0.18] hover:bg-white/[0.04]",
            ].join(" ")}
          >
            {selected && (
              <div className="absolute inset-x-0 top-0 h-[1.5px] bg-[#C9A44C]" />
            )}
            <div className="absolute top-3 right-3">
              <div
                className={`w-2 h-2 rounded-full transition-colors duration-200 ${
                  selected ? "bg-[#C9A44C]" : "border border-white/20"
                }`}
              />
            </div>
            <p
              className={`font-semibold text-[12px] leading-tight mb-1 pr-5 transition-colors duration-200 ${
                selected ? "text-white" : "text-gray-300"
              }`}
            >
              {opt.label}
            </p>
            {opt.description && (
              <p
                className={`text-[11px] leading-relaxed transition-colors duration-200 ${
                  selected ? "text-gray-400" : "text-gray-600"
                }`}
              >
                {opt.description}
              </p>
            )}
          </button>
        );
      })}
    </div>
  );
}

// ── Standard field renderer ────────────────────────────────────────────────

function InputField({
  field,
  value,
  onChange,
}: {
  field: Field;
  value: string;
  onChange: (id: string, val: string) => void;
}) {
  if (field.type === "card") {
    return <CardField field={field} value={value} onChange={onChange} />;
  }

  const base = [
    "w-full bg-white/[0.04] border border-white/[0.08] text-white placeholder-gray-600",
    "px-4 py-4 text-[14px] leading-relaxed",
    "focus:outline-none focus:border-[#C9A44C]/50 focus:bg-white/[0.06]",
    "transition-all duration-200",
  ].join(" ");

  switch (field.type) {
    case "info":
      return (
        <div className="bg-[#C9A44C]/[0.04] border border-[#C9A44C]/15 px-5 py-4">
          <p className="text-gray-400 text-[13px] leading-relaxed">{field.content}</p>
        </div>
      );

    case "checkbox": {
      const checked = value === "true";
      return (
        <button
          type="button"
          onClick={() => onChange(field.id, checked ? "" : "true")}
          className="flex items-start gap-4 group w-full text-left py-1"
        >
          <div
            className={`shrink-0 mt-0.5 w-5 h-5 border flex items-center justify-center transition-colors duration-150 ${
              checked
                ? "bg-[#C9A44C] border-[#C9A44C]"
                : "border-white/[0.18] group-hover:border-[#C9A44C]/50"
            }`}
          >
            {checked && <Check size={11} className="text-black" strokeWidth={3} />}
          </div>
          <span
            className={`text-[13px] leading-relaxed transition-colors duration-150 ${
              checked ? "text-white" : "text-gray-400 group-hover:text-gray-300"
            }`}
          >
            {field.label}
          </span>
        </button>
      );
    }

    case "signature":
      return (
        <div>
          <input
            type="text"
            value={value}
            onChange={e => onChange(field.id, e.target.value)}
            placeholder={field.placeholder ?? "Type your full legal name"}
            required={field.required}
            className={`${base} italic text-base tracking-wide`}
          />
          <p className="text-[10px] text-gray-600 mt-2 tracking-wide">
            By typing your name above, you are providing your legally binding electronic
            signature.
          </p>
        </div>
      );

    case "textarea":
      return (
        <textarea
          value={value}
          onChange={e => onChange(field.id, e.target.value)}
          placeholder={field.placeholder}
          rows={field.rows ?? 4}
          required={field.required}
          className={`${base} resize-none`}
        />
      );

    case "select":
      return (
        <select
          value={value}
          onChange={e => onChange(field.id, e.target.value)}
          required={field.required}
          className={`${base} cursor-pointer bg-[#0c0d0e]`}
        >
          <option value="" disabled>
            Select an option
          </option>
          {field.options?.map(opt => (
            <option key={opt} value={opt}>
              {opt}
            </option>
          ))}
        </select>
      );

    default:
      return (
        <input
          type={field.type}
          value={value}
          onChange={e => onChange(field.id, e.target.value)}
          placeholder={field.placeholder}
          required={field.required}
          className={base}
        />
      );
  }
}

// ── Wizard ─────────────────────────────────────────────────────────────────

export default function OnboardingWizard({
  phases,
  heading,
  headingLine2,
  welcomeSubheading,
  welcomeBody,
  welcomeChecklist,
  totalMinutes,
  scriptUrl,
  storageKey,
  formType,
  packageType,
}: WizardProps) {
  const total = phases.length;

  const [step, setStep] = useState(0);
  const [values, setValues] = useState<FormValues>({});
  const [visible, setVisible] = useState(true);
  const [saveMsg, setSaveMsg] = useState("");
  const [submitPhase, setSubmitPhase] = useState<SubmitPhase>("idle");
  const [seqIndex, setSeqIndex] = useState(0);
  const [resumeData, setResumeData] = useState<{
    step: number;
    values: FormValues;
  } | null>(null);

  const fetchRef = useRef<Promise<boolean> | null>(null);

  // Load saved progress once on mount
  useEffect(() => {
    try {
      const raw = localStorage.getItem(storageKey);
      if (raw) {
        const parsed = JSON.parse(raw) as { step: number; values: FormValues };
        if (parsed.step > 0) setResumeData(parsed);
      }
    } catch { /* ignore */ }
  }, [storageKey]);

  // Auto-save whenever step or values change
  useEffect(() => {
    if (step === 0) return;
    try {
      localStorage.setItem(storageKey, JSON.stringify({ step, values }));
    } catch { /* ignore */ }
  }, [step, values, storageKey]);

  // Submit animation + result handling
  useEffect(() => {
    if (submitPhase !== "building") return;

    const timers: ReturnType<typeof setTimeout>[] = [];

    for (let i = 1; i < SUBMIT_SEQUENCE.length; i++) {
      timers.push(setTimeout(() => setSeqIndex(i), i * 900));
    }

    const finalDelay = SUBMIT_SEQUENCE.length * 900 + 600;
    timers.push(
      setTimeout(async () => {
        const success = await fetchRef.current;
        if (success) {
          setSubmitPhase("done");
          setTimeout(() => {
            localStorage.removeItem(storageKey);
            window.location.href = "/onboarding-complete";
          }, 1400);
        } else {
          setSubmitPhase("error");
        }
      }, finalDelay)
    );

    return () => timers.forEach(clearTimeout);
  }, [submitPhase, storageKey]);

  const updateField = (id: string, val: string) =>
    setValues(prev => ({ ...prev, [id]: val }));

  const go = (next: number) => {
    setVisible(false);
    setTimeout(() => {
      setStep(next);
      setVisible(true);
      window.scrollTo({ top: 0, behavior: "smooth" });
    }, 200);
  };

  const saveProgress = () => {
    try {
      localStorage.setItem(storageKey, JSON.stringify({ step, values }));
      setSaveMsg("Saved ✓");
      setTimeout(() => setSaveMsg(""), 2500);
    } catch { /* ignore */ }
  };

  const canProceed = (): boolean => {
    if (step === 0 || step > total) return true;
    const phase = phases[step - 1];
    const textOk = phase.fields
      .filter(
        f => f.required && f.type !== "checkbox" && f.type !== "info"
      )
      .every(f => (values[f.id] ?? "").trim().length > 0);
    const checkOk = phase.fields
      .filter(f => f.required && f.type === "checkbox")
      .every(f => values[f.id] === "true");
    return textOk && checkOk;
  };

  const handleSubmit = () => {
    if (!canProceed() || submitPhase !== "idle") return;
    setSubmitPhase("building");
    setSeqIndex(0);

    fetchRef.current = (async (): Promise<boolean> => {
      try {
        const fd = new FormData();
        fd.append("form_type", formType);
        fd.append("packageType", packageType);
        fd.append("submission_timestamp", new Date().toISOString());
        Object.entries(values).forEach(([k, v]) => fd.append(k, v));
        const res = await fetch(scriptUrl, { method: "POST", body: fd });
        const json = await res.json().catch(() => ({})) as { status?: string };
        return res.ok && json.status === "success";
      } catch {
        return false;
      }
    })();
  };

  const handleRetry = () => {
    setSubmitPhase("idle");
    setSeqIndex(0);
    fetchRef.current = null;
  };

  const phasePct =
    step === 0 ? 0 : Math.round((step / total) * 100);
  const minsLeft =
    step === 0
      ? totalMinutes
      : Math.max(1, Math.round((totalMinutes * (total - step + 1)) / total));

  const phase = step > 0 && step <= total ? phases[step - 1] : null;
  const isLast = step === total;
  const ok = canProceed();

  return (
    <div className="min-h-screen bg-[#080909] flex flex-col">
      {/* ── Animations ── */}
      <style>{`
        @keyframes ow-pulse { 0%,100%{opacity:0.6;transform:scale(1)} 50%{opacity:1;transform:scale(1.25)} }
        .ow-dot-active { animation: ow-pulse 1.4s ease-in-out infinite; }
        @keyframes ow-done-in { from{opacity:0;transform:scale(0.92)} to{opacity:1;transform:scale(1)} }
        .ow-done-in { animation: ow-done-in 0.5s ease forwards; }
      `}</style>

      {/* ── Submit animation overlay ── */}
      {submitPhase !== "idle" && (
        <div className="fixed inset-0 z-50 bg-[#080909] flex flex-col items-center justify-center px-8">
          {submitPhase === "building" && (
            <div className="max-w-sm w-full">
              <p className="text-[9px] tracking-[0.6em] text-[#C9A44C]/50 uppercase font-semibold mb-10 text-center">
                Processing Blueprint
              </p>
              <div className="space-y-5">
                {SUBMIT_SEQUENCE.map((line, i) => (
                  <div
                    key={i}
                    className="flex items-center gap-4 transition-all duration-500"
                    style={{
                      opacity: i <= seqIndex ? 1 : 0,
                      transform:
                        i <= seqIndex ? "none" : "translateX(-10px)",
                    }}
                  >
                    <div
                      className={`w-1.5 h-1.5 rounded-full flex-shrink-0 transition-colors duration-300 ${
                        i < seqIndex
                          ? "bg-[#C9A44C]"
                          : i === seqIndex
                          ? "bg-[#C9A44C] ow-dot-active"
                          : "bg-white/10"
                      }`}
                    />
                    <p
                      className={`text-[14px] transition-colors duration-300 ${
                        i < seqIndex
                          ? "text-gray-600"
                          : i === seqIndex
                          ? "text-white font-medium"
                          : "text-gray-800"
                      }`}
                    >
                      {line}
                    </p>
                  </div>
                ))}
              </div>
            </div>
          )}

          {submitPhase === "done" && (
            <div className="text-center max-w-sm ow-done-in">
              <div className="w-14 h-14 border border-[#C9A44C]/40 flex items-center justify-center mx-auto mb-8">
                <Check size={22} className="text-[#C9A44C]" strokeWidth={1.5} />
              </div>
              <p className="text-[9px] tracking-[0.6em] text-[#C9A44C] uppercase font-semibold mb-6">
                Blueprint Received
              </p>
              <h2 className="font-headline text-[44px] md:text-[56px] font-bold uppercase text-white leading-[0.92]">
                Your Blueprint Is<br />Being Built.
              </h2>
              <p className="text-gray-600 text-[12px] mt-6 tracking-[0.15em]">
                Redirecting you now…
              </p>
            </div>
          )}

          {submitPhase === "error" && (
            <div className="text-center max-w-sm">
              <div className="w-12 h-12 border border-red-800/40 flex items-center justify-center mx-auto mb-8">
                <AlertCircle size={20} className="text-red-400" />
              </div>
              <p className="text-[9px] tracking-[0.5em] text-red-400/70 uppercase font-semibold mb-5">
                Submission Error
              </p>
              <h3 className="font-headline text-3xl font-bold uppercase text-white mb-4">
                Something Went Wrong.
              </h3>
              <p className="text-gray-500 text-[13px] leading-relaxed mb-8 max-w-xs mx-auto">
                We were unable to reach the server. Please check your connection and
                try again. Your answers have been saved locally.
              </p>
              <button
                onClick={handleRetry}
                className="bg-[#C9A44C] text-black font-bold tracking-[0.2em] text-[11px] px-10 py-4 uppercase hover:bg-[#D4B56A] transition-colors"
              >
                Try Again
              </button>
            </div>
          )}
        </div>
      )}

      {/* ── Navbar spacer ── */}
      <div className="h-16 shrink-0" />

      {/* ── Resume banner (welcome screen only) ── */}
      {step === 0 && resumeData && (
        <div className="bg-[#121416] border-b border-[#C9A44C]/20 px-6 py-3.5 flex items-center justify-between gap-4">
          <p className="text-[13px] text-gray-400">
            Saved progress found.{" "}
            <span className="text-white font-medium">Resume where you left off?</span>
          </p>
          <div className="flex gap-5 shrink-0">
            <button
              onClick={() => {
                setValues(resumeData.values);
                go(resumeData.step);
                setResumeData(null);
              }}
              className="text-[#C9A44C] text-[13px] font-semibold hover:text-[#D4B56A] transition-colors"
            >
              Resume
            </button>
            <button
              onClick={() => setResumeData(null)}
              className="text-gray-600 text-[13px] hover:text-gray-400 transition-colors"
            >
              Start Fresh
            </button>
          </div>
        </div>
      )}

      {/* ── Fixed progress header (during phases) ── */}
      {step > 0 && step <= total && (
        <div className="fixed top-16 inset-x-0 z-40 bg-[#0c0d0e]/96 backdrop-blur-sm border-b border-white/[0.04]">
          <div className="max-w-2xl mx-auto px-6 pt-4 pb-3.5">
            <div className="flex items-start justify-between mb-2.5">
              <div>
                <p className="text-[8px] tracking-[0.55em] text-[#C9A44C]/55 uppercase font-semibold leading-none mb-1.5">
                  Building Your Performance Blueprint
                </p>
                <p className="text-[9px] tracking-[0.25em] text-gray-500 uppercase leading-none">
                  Phase {step} of {total}&nbsp;&nbsp;·&nbsp;&nbsp;
                  {phase?.title}&nbsp;&nbsp;·&nbsp;&nbsp;~{minsLeft} min remaining
                </p>
              </div>
              <span className="text-[10px] tracking-[0.35em] text-[#C9A44C] font-bold uppercase shrink-0 ml-4 mt-0.5">
                {phasePct}%
              </span>
            </div>
            <div className="h-[2px] bg-white/[0.07] overflow-hidden">
              <div
                className="h-full bg-gradient-to-r from-[#C9A44C] to-[#D4B56A] transition-all duration-500 ease-out"
                style={{ width: `${phasePct}%` }}
              />
            </div>
          </div>
        </div>
      )}

      {/* ── Transition wrapper ── */}
      <div
        className="flex-1 flex flex-col transition-all duration-200 ease-out"
        style={{
          opacity: visible ? 1 : 0,
          transform: visible ? "none" : "translateY(10px)",
        }}
      >
        {/* ─────────────────────────────────────────── WELCOME SCREEN */}
        {step === 0 && (
          <div className="flex-1 flex flex-col items-center justify-center px-6 py-24 text-center">
            {/* Logo mark */}
            <div className="mb-10">
              <Image
                src="/logos/kynovant-mark.png"
                alt="Kynovant"
                width={40}
                height={40}
                className="mx-auto opacity-80"
              />
            </div>

            {/* Eyebrow */}
            <p className="text-[#C9A44C] text-[10px] font-semibold tracking-[0.7em] uppercase mb-5">
              Welcome to
            </p>

            {/* Headline */}
            <h1 className="font-headline text-[64px] sm:text-[80px] md:text-[96px] font-bold uppercase leading-[0.88] tracking-tight text-white mb-2">
              {heading}
            </h1>
            <h2 className="font-headline text-[64px] sm:text-[80px] md:text-[96px] font-bold uppercase leading-[0.88] tracking-tight text-[#C9A44C] mb-8">
              {headingLine2}
            </h2>

            {/* Sub-headline */}
            <p className="text-white/70 text-[17px] md:text-[19px] font-light tracking-wide mb-8 max-w-sm leading-snug">
              {welcomeSubheading}
            </p>

            <div className="w-8 h-px bg-[#C9A44C]/40 mx-auto mb-8" />

            {/* Body */}
            <p className="text-gray-400 text-[14px] leading-relaxed max-w-sm mb-10">
              {welcomeBody}
            </p>

            {/* Deliverables checklist */}
            <div className="max-w-[280px] w-full text-left space-y-3.5 mb-12">
              {welcomeChecklist.map((item, i) => (
                <div key={i} className="flex items-center gap-3">
                  <div className="w-4 h-4 border border-[#C9A44C]/40 flex items-center justify-center flex-shrink-0">
                    <Check size={9} className="text-[#C9A44C]" strokeWidth={3} />
                  </div>
                  <span className="text-[13px] text-gray-300 leading-tight">
                    {item}
                  </span>
                </div>
              ))}
            </div>

            {/* CTA */}
            <button
              onClick={() => go(1)}
              className="bg-[#C9A44C] text-black font-bold tracking-[0.22em] text-[11px] px-16 py-5 uppercase hover:bg-[#D4B56A] transition-colors duration-300 mb-7"
            >
              Begin Building My Blueprint
            </button>

            {/* Time badge */}
            <div className="inline-flex items-center gap-2 text-[10px] tracking-[0.3em] text-gray-600 uppercase">
              <Clock size={11} className="text-gray-600" />
              {totalMinutes}–{totalMinutes + 5} minutes to complete
            </div>
          </div>
        )}

        {/* ─────────────────────────────────────────── PHASE SCREEN */}
        {step > 0 && step <= total && phase && (
          <div
            className="max-w-2xl mx-auto w-full px-5 sm:px-6 pb-16"
            style={{ paddingTop: "132px" }}
          >
            {/* Phase header */}
            <div className="mb-8">
              <p className="text-[9px] tracking-[0.6em] text-[#C9A44C]/45 uppercase font-semibold mb-3">
                Phase {step} of {total}
              </p>
              <h2 className="font-headline text-[44px] md:text-[56px] font-bold uppercase text-white leading-none mb-5">
                {phase.title}
              </h2>
              {phase.subtitle && (
                <p className="text-gray-400 text-[14px] leading-[1.75] max-w-lg border-l-2 border-[#C9A44C]/20 pl-4">
                  {phase.subtitle}
                </p>
              )}
            </div>

            {/* Form card */}
            <div
              className="bg-white/[0.025] border border-white/[0.07] p-5 sm:p-8 mb-6 space-y-7"
              style={{ borderTop: "1.5px solid rgba(201,164,76,0.22)" }}
            >
              {phase.fields.map(field => (
                <div key={field.id}>
                  {field.type !== "checkbox" &&
                    field.type !== "info" && (
                      <label className="block text-[10px] tracking-[0.3em] text-gray-500 uppercase mb-2.5">
                        {field.label}
                        {field.required && (
                          <span className="text-[#C9A44C] ml-1.5">*</span>
                        )}
                      </label>
                    )}
                  <InputField
                    field={field}
                    value={values[field.id] ?? ""}
                    onChange={updateField}
                  />
                  {field.hint && (
                    <p className="text-[11px] text-gray-600 mt-1.5 leading-relaxed">
                      {field.hint}
                    </p>
                  )}
                </div>
              ))}
            </div>

            {/* ── Mobile navigation ── */}
            <div className="sm:hidden flex flex-col gap-3 mb-4">
              {isLast ? (
                <button
                  onClick={handleSubmit}
                  disabled={!ok}
                  className={`w-full flex items-center justify-center gap-2 font-bold tracking-[0.18em] text-[11px] py-5 uppercase transition-all duration-300 ${
                    ok
                      ? "bg-[#C9A44C] text-black"
                      : "bg-white/[0.05] text-gray-600 border border-white/[0.06]"
                  }`}
                >
                  Submit Blueprint
                  {ok && <Check size={13} strokeWidth={3} />}
                </button>
              ) : (
                <button
                  onClick={() => ok && go(step + 1)}
                  disabled={!ok}
                  className={`w-full flex items-center justify-center gap-2 font-bold tracking-[0.18em] text-[11px] py-5 uppercase transition-all duration-300 ${
                    ok
                      ? "bg-[#C9A44C] text-black"
                      : "bg-white/[0.05] text-gray-600 border border-white/[0.06]"
                  }`}
                >
                  Continue
                  <ChevronRight size={13} />
                </button>
              )}
              <div className="flex items-center justify-between">
                <button
                  onClick={() => go(step - 1)}
                  className="flex items-center gap-1.5 text-gray-500 text-[13px] hover:text-white transition-colors py-2"
                >
                  <ChevronLeft size={14} />
                  Back
                </button>
                <button
                  onClick={saveProgress}
                  className="flex items-center gap-1.5 text-gray-700 text-[10px] tracking-[0.2em] uppercase hover:text-gray-400 transition-colors py-2"
                >
                  <Save size={11} />
                  {saveMsg || "Save"}
                </button>
              </div>
            </div>

            {/* ── Desktop navigation ── */}
            <div className="hidden sm:flex items-center justify-between gap-4">
              <button
                onClick={() => go(step - 1)}
                className="flex items-center gap-1.5 text-gray-500 text-[13px] hover:text-white transition-colors group py-2"
              >
                <ChevronLeft
                  size={14}
                  className="group-hover:-translate-x-0.5 transition-transform"
                />
                Back
              </button>

              <div className="flex items-center gap-5">
                <button
                  onClick={saveProgress}
                  className="flex items-center gap-1.5 text-gray-700 text-[10px] tracking-[0.2em] uppercase hover:text-gray-400 transition-colors"
                >
                  <Save size={11} />
                  {saveMsg || "Save Progress"}
                </button>

                {isLast ? (
                  <button
                    onClick={handleSubmit}
                    disabled={!ok}
                    className={`flex items-center gap-2 font-bold tracking-[0.18em] text-[10px] px-8 py-4 uppercase transition-all duration-300 ${
                      ok
                        ? "bg-[#C9A44C] text-black hover:bg-[#D4B56A] cursor-pointer"
                        : "bg-white/[0.05] text-gray-600 cursor-not-allowed border border-white/[0.06]"
                    }`}
                  >
                    Submit Blueprint
                    {ok && <Check size={12} strokeWidth={3} />}
                  </button>
                ) : (
                  <button
                    onClick={() => ok && go(step + 1)}
                    disabled={!ok}
                    className={`flex items-center gap-2 font-bold tracking-[0.18em] text-[10px] px-8 py-4 uppercase transition-all duration-300 ${
                      ok
                        ? "bg-[#C9A44C] text-black hover:bg-[#D4B56A] cursor-pointer"
                        : "bg-white/[0.05] text-gray-600 cursor-not-allowed border border-white/[0.06]"
                    }`}
                  >
                    Continue
                    <ChevronRight size={12} />
                  </button>
                )}
              </div>
            </div>

            <p className="text-center text-[10px] text-gray-700 mt-6">
              Progress saves automatically — close this tab anytime and return to
              continue.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
