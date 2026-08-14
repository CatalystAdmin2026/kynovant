import Link from "next/link";
import {
  ArrowRight,
  Sparkles,
  LayoutDashboard,
  Dumbbell,
  ClipboardCheck,
  MessageSquare,
  CalendarDays,
  FileText,
  Smartphone,
  CheckCircle2,
  ShieldCheck,
  Users,
  Library,
  Check,
} from "lucide-react";

// ─────────────────────────────────────────────────────────────
// Kynovant — Public Homepage (shared content)
//
// Rendered from two places that both need to serve "/":
//   - app/(kynovant)/home/page.tsx — real content, reached via a
//     proxy.ts rewrite of "/" for the kynovant.com hostname (Next.js
//     route groups can't have two page.tsx at the same path, and
//     app/(site)/page.tsx already owns "/" for the shared route —
//     see docs/domain-architecture.md).
//   - app/(site)/page.tsx — "/" for any other host (the dormant
//     Catalyst Coaching Elite domain, and local/preview URLs with no
//     brand override). Same content, so a raw preview link doesn't
//     show a lower-quality "other" homepage.
//
// Every product claim on this page maps to a real, shipped surface
// (Coach HQ, the AI Program Generator, Check-ins, Messaging,
// Schedule, Documents, the Exercise Library, and the installable PWA
// shell) — see the section comments below for the source. No
// interface shown here is a live screenshot (none exist in the repo
// yet); each is a faithful, hand-built composition using the same
// terminology, statuses, and information hierarchy as the actual
// product, with illustrative (not fabricated-as-real) sample data.
//
// CTA architecture: Kynovant now has a public self-service entry point.
// Primary CTAs lead to /start-trial. /coach-apply remains available
// for legacy/inbound conversations, but it is not the main acquisition
// path.
// ─────────────────────────────────────────────────────────────

/* ── Shared building blocks ─────────────────────────────────── */

function Eyebrow({ children }: { children: React.ReactNode }) {
  return (
    <p className="text-[11px] font-semibold uppercase tracking-[0.32em] text-gold mb-4">
      {children}
    </p>
  );
}

function SectionHeading({
  eyebrow,
  title,
  body,
  align = "left",
}: {
  eyebrow: string;
  title: React.ReactNode;
  body?: React.ReactNode;
  align?: "left" | "center";
}) {
  return (
    <div className={`max-w-2xl ${align === "center" ? "mx-auto text-center" : ""}`}>
      <Eyebrow>{eyebrow}</Eyebrow>
      <h2 className="text-3xl md:text-[2.75rem] font-semibold tracking-tight text-white leading-[1.08]">
        {title}
      </h2>
      {body && <p className="mt-5 text-base leading-relaxed text-white/50">{body}</p>}
    </div>
  );
}

/** Faux macOS-style window chrome around every product mockup — signals
 * "this is a picture of software" without needing a real screenshot. */
function DeviceFrame({
  children,
  className = "",
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      className={`w-full max-w-full rounded-xl border border-mkt-border bg-mkt-surface-raised shadow-[0_40px_100px_-30px_rgba(0,0,0,0.7)] overflow-hidden ${className}`}
    >
      <div className="flex items-center gap-1.5 px-4 py-3 border-b border-mkt-border bg-mkt-surface">
        <span className="w-2.5 h-2.5 rounded-full bg-white/15" />
        <span className="w-2.5 h-2.5 rounded-full bg-white/15" />
        <span className="w-2.5 h-2.5 rounded-full bg-white/15" />
      </div>
      {children}
    </div>
  );
}

function StatusPill({
  tone,
  children,
}: {
  tone: "ok" | "caution" | "critical" | "info" | "neutral";
  children: React.ReactNode;
}) {
  const tones: Record<typeof tone, string> = {
    ok: "bg-emerald-500/10 text-emerald-400 border-emerald-500/20",
    caution: "bg-amber-500/10 text-amber-400 border-amber-500/20",
    critical: "bg-red-500/10 text-red-400 border-red-500/20",
    info: "bg-signal/10 text-signal border-signal/25",
    neutral: "bg-white/[0.06] text-white/50 border-white/10",
  };
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-medium ${tones[tone]}`}>
      {children}
    </span>
  );
}

/* ── Page ──────────────────────────────────────────────────── */

export default function KynovantHomeContent() {
  return (
    <main className="bg-ink">
      <Hero />
      <WhoItsFor />
      <PromiseSection />
      <PlatformShowcase />
      <AIProgramming />
      <ClientOperations />
      <OperationsRow />
      <MobileSection />
      <Pricing />
      <FinalCTA />
    </main>
  );
}

/* ── Hero ──────────────────────────────────────────────────── */

function Hero() {
  return (
    <section className="relative overflow-hidden pt-40 pb-28 px-6">
      {/* Ambient glow — restrained, two accents instead of a wall of gold */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0"
        style={{
          background:
            "radial-gradient(60% 50% at 20% 0%, rgba(201,162,77,0.10), transparent 60%), radial-gradient(50% 40% at 85% 10%, rgba(79,168,201,0.12), transparent 60%)",
        }}
      />
      {/* Faint technical grid — subtle, not neon */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 opacity-[0.05]"
        style={{
          backgroundImage:
            "linear-gradient(to right, white 1px, transparent 1px), linear-gradient(to bottom, white 1px, transparent 1px)",
          backgroundSize: "56px 56px",
          maskImage: "linear-gradient(to bottom, black, transparent 75%)",
        }}
      />

      <div className="relative max-w-6xl mx-auto">
        <div className="max-w-3xl">
          <div className="inline-flex items-center gap-2 rounded-full border border-mkt-border bg-mkt-surface-raised px-3.5 py-1.5 mb-8">
            <Sparkles className="w-3.5 h-3.5 text-gold" />
            <span className="text-[11px] font-medium tracking-wide text-white/60">
              Training and coaching operations, run on software
            </span>
          </div>

          <h1 className="max-w-[320px] text-3xl leading-[1.08] sm:max-w-none sm:text-[2.6rem] md:text-6xl md:leading-[1.03] font-semibold tracking-tight text-white">
            <span className="block sm:inline">The operating system</span>{" "}
            <span className="block sm:inline">for personal trainers</span>{" "}
            <span className="block sm:inline">and online coaches.</span>
          </h1>

          <p className="mt-7 max-w-[320px] text-base leading-relaxed text-white/55 sm:max-w-xl sm:text-lg">
            Kynovant replaces the spreadsheets, PDFs, and scattered DMs trainers and coaches
            patch together with one workspace — programming, AI-assisted program building,
            check-ins, nutrition targets, scheduling, messaging, and documents.
          </p>

          <div className="mt-10 flex flex-col items-start gap-4 sm:flex-row sm:flex-wrap sm:items-center">
            <Link
              href="/start-trial"
              className="group inline-flex max-w-full items-center justify-center gap-2 rounded-md bg-white px-6 py-3.5 text-sm font-semibold text-[#0d0f11] hover:bg-white/90 transition-colors sm:justify-start"
            >
              Start 14-Day Free Trial
              <ArrowRight className="w-4 h-4 transition-transform group-hover:translate-x-0.5" />
            </Link>
            <Link
              href="#platform"
              className="inline-flex max-w-full items-center justify-center gap-2 rounded-md border border-mkt-border-strong px-6 py-3.5 text-sm font-semibold text-white/80 hover:text-white hover:border-white/30 transition-colors sm:justify-start"
            >
              See the Platform
            </Link>
          </div>

          <p className="mt-5 text-xs text-white/30">
            Kynovant Professional — $99/month, 14-day free trial. No demo call required to see how it works.
          </p>
        </div>
      </div>

      {/* Hero product proof — a condensed Coach HQ overview */}
      <div className="relative max-w-6xl mx-auto mt-16">
        <DeviceFrame>
          <div className="grid grid-cols-1 md:grid-cols-[220px_1fr]">
            <aside className="hidden md:flex flex-col gap-1 border-r border-mkt-border bg-mkt-surface p-4">
              {[
                { icon: LayoutDashboard, label: "Overview", active: true },
                { icon: Users, label: "Clients" },
                { icon: Dumbbell, label: "Programs" },
                { icon: ClipboardCheck, label: "Check-ins" },
                { icon: MessageSquare, label: "Messages" },
                { icon: CalendarDays, label: "Schedule" },
                { icon: FileText, label: "Documents" },
                { icon: Library, label: "Exercises" },
              ].map(({ icon: Icon, label, active }) => (
                <div
                  key={label}
                  className={`flex items-center gap-2.5 rounded-md px-3 py-2 text-[13px] ${
                    active ? "bg-white/[0.06] text-white" : "text-white/40"
                  }`}
                >
                  <Icon className="w-4 h-4" />
                  {label}
                </div>
              ))}
            </aside>

            <div className="min-w-0 p-6 md:p-8">
              <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <p className="text-[11px] uppercase tracking-[0.18em] text-white/35">Coach HQ</p>
                  <h3 className="text-lg font-semibold text-white mt-1">Overview</h3>
                </div>
                <StatusPill tone="info">
                  <Sparkles className="w-3 h-3" /> AI draft ready for review
                </StatusPill>
              </div>

              <div className="grid grid-cols-1 gap-3 mb-6 sm:grid-cols-3">
                {[
                  { label: "Healthy", value: "Live", tone: "ok" as const },
                  { label: "Needs Attention", value: "Review", tone: "caution" as const },
                  { label: "Critical", value: "Priority", tone: "critical" as const },
                ].map((s) => (
                  <div key={s.label} className="rounded-lg border border-mkt-border bg-mkt-surface p-4">
                    <p className="text-lg font-semibold text-white">{s.value}</p>
                    <p className="mt-1 text-[11px] text-white/40">{s.label}</p>
                  </div>
                ))}
              </div>

              <div className="rounded-lg border border-mkt-border bg-mkt-surface divide-y divide-mkt-border">
                {[
                  { name: "Client profile", note: "Check-in waiting for review", tone: "caution" as const },
                  { name: "Program timeline", note: "Milestone reached", tone: "ok" as const },
                  { name: "Attention queue", note: "Follow-up required", tone: "critical" as const },
                ].map((row) => (
                  <div key={row.name} className="flex items-center justify-between px-4 py-3">
                    <div className="flex items-center gap-3">
                      <span className="flex h-7 w-7 items-center justify-center rounded-full bg-white/[0.06] text-[11px] font-medium text-white/70">
                        {row.name.split(" ").map((n) => n[0]).join("")}
                      </span>
                      <span className="text-sm text-white/80">{row.name}</span>
                    </div>
                    <StatusPill tone={row.tone}>{row.note}</StatusPill>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </DeviceFrame>
      </div>
    </section>
  );
}

/* ── Who it's for ─────────────────────────────────────────── */

const AUDIENCES = [
  {
    title: "Independent personal trainers",
    body: "Training clients on the floor, online, or both — and ready to stop rebuilding the same spreadsheet every month.",
  },
  {
    title: "Online coaches scaling past a handful of clients",
    body: "The DM-and-PDF workflow that worked at 5 clients breaks at 25. Kynovant is built to hold the load.",
  },
  {
    title: "Trainers and coaches who want software that looks the part",
    body: "Your programming is professional. Your tools should feel that way too — for you and your clients.",
  },
];

function WhoItsFor() {
  return (
    <section className="px-6 py-20 border-t border-mkt-border">
      <div className="max-w-6xl mx-auto">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
          {AUDIENCES.map((a) => (
            <div key={a.title}>
              <div className="mb-4 h-px w-8 bg-gold" />
              <h3 className="text-base font-semibold text-white mb-2">{a.title}</h3>
              <p className="text-sm leading-relaxed text-white/45">{a.body}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

/* ── Brand promise ────────────────────────────────────────── */

function PromiseSection() {
  return (
    <section className="border-t border-mkt-border px-6 py-28 md:py-32">
      <div className="mx-auto max-w-6xl">
        <div className="grid grid-cols-1 gap-12 lg:grid-cols-[0.78fr_1.22fr] lg:items-end">
          <div>
            <Eyebrow>The Reason Behind The Software</Eyebrow>
            <div className="mt-8 hidden h-px w-28 bg-gradient-to-r from-gold/70 to-transparent lg:block" />
          </div>

          <div className="max-w-4xl">
            <h2 className="max-w-[720px] text-4xl font-semibold leading-[1.03] tracking-tight text-white sm:text-5xl md:text-[4.5rem]">
              Your clients made the promise. Help them keep it.
            </h2>
            <p className="mt-8 max-w-3xl text-base leading-relaxed text-white/55 md:text-lg">
              Every client who hires a trainer or coach is trying to follow through on
              something that matters. Kynovant was built around a simple belief: great
              coaching is not only writing the right program. It is the structure,
              accountability, communication, and context that help a person keep going when
              motivation is no longer enough.
            </p>
            <p className="mt-6 max-w-2xl text-sm leading-relaxed text-white/38">
              Programming gives the commitment a plan. Check-ins keep it visible. Messaging
              keeps the relationship connected. Client context helps you remember what matters
              to the person behind the plan.
            </p>
          </div>
        </div>
      </div>
    </section>
  );
}

/* ── Platform showcase ────────────────────────────────────── */
/* Mirrors app/hq/page.tsx (Coach HQ Overview): client severity
   buckets (Healthy / Needs Attention / Critical) and the AI-draft
   surfacing pattern used in the real dashboard. */

function PlatformShowcase() {
  return (
    <section id="platform" className="px-6 py-24 scroll-mt-24 border-t border-mkt-border">
      <div className="max-w-6xl mx-auto">
        <SectionHeading
          eyebrow="The Platform"
          title="One workspace for the entire coaching operation."
          body="Coach HQ replaces the spreadsheet-plus-app-stack most trainers and coaches run today. Clients, programs, check-ins, nutrition, scheduling, messaging, and documents — in one place, built around how client work actually happens week to week."
        />

        <div className="mt-14 grid grid-cols-1 md:grid-cols-3 gap-5">
          {[
            {
              icon: Users,
              title: "Client operations",
              body: "Every client's program, check-in history, nutrition targets, and progress in one record — not scattered across five tools.",
            },
            {
              icon: Dumbbell,
              title: "Program Builder + Exercise Library",
              body: "Build reusable blueprints against a real, structured exercise library instead of retyping the same block for every client.",
            },
            {
              icon: ShieldCheck,
              title: "Built for how coaching actually runs",
              body: "Weekly check-in review, entitlement-aware access, and workflows shaped by real coaching operations — not a generic CRM.",
            },
          ].map(({ icon: Icon, title, body }) => (
            <div key={title} className="rounded-xl border border-mkt-border bg-mkt-surface-raised p-6">
              <div className="w-9 h-9 rounded-lg bg-gold/10 flex items-center justify-center mb-4">
                <Icon className="w-5 h-5 text-gold" />
              </div>
              <h3 className="text-sm font-semibold text-white mb-2">{title}</h3>
              <p className="text-sm leading-relaxed text-white/45">{body}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

/* ── AI Programming ───────────────────────────────────────── */
/* Mirrors app/hq/programs/generate (brief → AI draft) and
   lib/program-generator/approval.ts (coach review before anything
   reaches a client) — the actual shipped AI Program Generator flow. */

function AIProgramming() {
  return (
    <section id="ai-programming" className="px-6 py-24 scroll-mt-24 border-t border-mkt-border">
      <div className="max-w-6xl mx-auto">
        <div className="grid grid-cols-1 lg:grid-cols-[0.85fr_1.15fr] gap-14 items-center">
          <div>
            <SectionHeading
              eyebrow="AI Programming"
              title="AI that drafts. You decide."
            />
            <p className="mt-5 text-base leading-relaxed text-white/50">
              Give it a brief — goal, schedule, equipment, constraints — and Kynovant drafts a
              full program pulled from your own exercise library, not generic filler text. Every
              draft lands in your review queue. Nothing reaches a client until you approve it.
            </p>
            <ul className="mt-7 space-y-3.5">
              {[
                "Grounded in your exercise library, not invented movements",
                "Respects the client's actual equipment and constraints",
                "You review, edit, and approve — the AI never publishes on its own",
              ].map((item) => (
                <li key={item} className="flex items-start gap-3 text-sm text-white/60">
                  <CheckCircle2 className="w-4 h-4 text-signal mt-0.5 shrink-0" />
                  {item}
                </li>
              ))}
            </ul>
          </div>

          <DeviceFrame>
            <div className="grid grid-cols-1 sm:grid-cols-2 divide-y sm:divide-y-0 sm:divide-x divide-mkt-border">
              <div className="p-6">
                <p className="text-[11px] uppercase tracking-[0.18em] text-white/35 mb-4">Brief</p>
                <div className="space-y-3">
                  {[
                    ["Goal", "Hypertrophy, upper-body focus"],
                    ["Days / week", "4"],
                    ["Equipment", "Full gym"],
                    ["Constraint", "Left shoulder — avoid overhead press"],
                  ].map(([k, v]) => (
                    <div key={k} className="rounded-md border border-mkt-border bg-mkt-surface px-3 py-2.5">
                      <p className="text-[10px] uppercase tracking-wide text-white/30">{k}</p>
                      <p className="text-sm text-white/75 mt-0.5">{v}</p>
                    </div>
                  ))}
                </div>
              </div>

              <div className="p-6">
                <div className="flex items-center justify-between mb-4">
                  <p className="text-[11px] uppercase tracking-[0.18em] text-white/35">Draft — Week 1, Day 1</p>
                  <StatusPill tone="info">Needs review</StatusPill>
                </div>
                <div className="space-y-2">
                  {[
                    ["Incline DB Press", "4×8–10"],
                    ["Chest-Supported Row", "4×10–12"],
                    ["Cable Lateral Raise", "3×12–15"],
                    ["Face Pull", "3×15"],
                  ].map(([ex, scheme]) => (
                    <div key={ex} className="flex items-center justify-between rounded-md bg-mkt-surface px-3 py-2 text-sm">
                      <span className="text-white/75">{ex}</span>
                      <span className="text-white/35 text-xs">{scheme}</span>
                    </div>
                  ))}
                </div>
                <button
                  type="button"
                  disabled
                  className="mt-5 w-full rounded-md bg-signal/15 border border-signal/25 text-signal text-xs font-semibold py-2.5 cursor-default"
                >
                  Approve &amp; assign to client
                </button>
              </div>
            </div>
          </DeviceFrame>
        </div>
      </div>
    </section>
  );
}

/* ── Client operations (check-ins) ────────────────────────── */
/* Mirrors app/hq/check-ins (status queue: Waiting for Review / In
   Review / Reviewed) and the previous-week-context feature from
   the check-ins foundation sprint. */

function ClientOperations() {
  return (
    <section className="px-6 py-24 border-t border-mkt-border">
      <div className="max-w-6xl mx-auto">
        <SectionHeading
          eyebrow="Client Operations"
          title="See exactly which clients need you this week."
          body="Check-ins queue by status, so review time goes to the clients who need it — with last week's context surfaced automatically, helping follow-through stay visible instead of buried."
        />

        <div className="mt-12">
          <DeviceFrame>
            <div className="p-6">
              <div className="flex items-center justify-between mb-5">
                <p className="text-sm font-semibold text-white">Check-in Review Queue</p>
                <div className="flex items-center gap-2 text-[11px]">
                  <StatusPill tone="caution">3 waiting for review</StatusPill>
                </div>
              </div>
              <div className="rounded-lg border border-mkt-border divide-y divide-mkt-border bg-mkt-surface">
                {[
                  { name: "Submitted check-in", status: "Waiting for Review", tone: "caution" as const, note: "Prior-week context is visible during review." },
                  { name: "Coach review", status: "In Review", tone: "info" as const, note: "Coach notes and action items stay with the client record." },
                  { name: "Resolved check-in", status: "Reviewed", tone: "ok" as const, note: "The reviewed status is reflected in the queue." },
                ].map((row) => (
                  <div key={row.name} className="flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-4 px-4 py-3.5">
                    <div className="flex items-center gap-3 sm:w-40 shrink-0">
                      <span className="flex h-7 w-7 items-center justify-center rounded-full bg-white/[0.06] text-[11px] font-medium text-white/70">
                        {row.name.split(" ").map((n) => n[0]).join("")}
                      </span>
                      <span className="text-sm text-white/80">{row.name}</span>
                    </div>
                    <StatusPill tone={row.tone}>{row.status}</StatusPill>
                    <p className="text-xs text-white/35 sm:ml-auto sm:max-w-xs sm:text-right">{row.note}</p>
                  </div>
                ))}
              </div>
            </div>
          </DeviceFrame>
        </div>
      </div>
    </section>
  );
}

/* ── Operations row: Messaging / Schedule / Documents ─────── */

const OPERATIONS = [
  {
    icon: MessageSquare,
    title: "Messaging",
    body: "Direct coach ↔ client messaging, in the same workspace as the program and check-in you're discussing.",
  },
  {
    icon: CalendarDays,
    title: "Native scheduling",
    body: "Book and manage sessions inside Kynovant — no separate booking tool to reconcile against your roster.",
  },
  {
    icon: FileText,
    title: "Documents & agreements",
    body: "Agreements and client documents live with the client record, not in a separate e-sign inbox.",
  },
];

function OperationsRow() {
  return (
    <section className="px-6 py-24 border-t border-mkt-border">
      <div className="max-w-6xl mx-auto">
        <SectionHeading
          eyebrow="Communication & Ops"
          title="The parts of coaching that aren't programming — handled too."
        />
        <div className="mt-12 grid grid-cols-1 md:grid-cols-3 gap-5">
          {OPERATIONS.map(({ icon: Icon, title, body }) => (
            <div key={title} className="rounded-xl border border-mkt-border bg-mkt-surface-raised overflow-hidden">
              <div className="p-6 pb-5">
                <div className="w-9 h-9 rounded-lg bg-signal/10 flex items-center justify-center mb-4">
                  <Icon className="w-5 h-5 text-signal" />
                </div>
                <h3 className="text-sm font-semibold text-white mb-2">{title}</h3>
                <p className="text-sm leading-relaxed text-white/45">{body}</p>
              </div>
              <div className="border-t border-mkt-border bg-mkt-surface px-6 py-4">
                {title === "Messaging" && (
                  <div className="space-y-2">
                    <div className="max-w-[75%] rounded-lg rounded-bl-sm bg-white/[0.06] px-3 py-2 text-xs text-white/60">
                      How does the tempo look on set 3?
                    </div>
                    <div className="ml-auto max-w-[75%] rounded-lg rounded-br-sm bg-signal/15 px-3 py-2 text-xs text-white/70">
                      Slow it down — 3 count on the eccentric.
                    </div>
                  </div>
                )}
                {title === "Native scheduling" && (
                  <div className="space-y-1.5">
                    {["Mon · 9:00 AM — Check-in call", "Wed · 4:30 PM — New client intro"].map((s) => (
                      <div key={s} className="rounded-md bg-white/[0.05] px-3 py-2 text-xs text-white/55">
                        {s}
                      </div>
                    ))}
                  </div>
                )}
                {title === "Documents & agreements" && (
                  <div className="space-y-1.5">
                    {["Coaching Agreement.pdf", "Intake Form — signed"].map((f) => (
                      <div key={f} className="flex items-center gap-2 rounded-md bg-white/[0.05] px-3 py-2 text-xs text-white/55">
                        <FileText className="w-3.5 h-3.5 text-white/30" />
                        {f}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

/* ── Mobile / installable ─────────────────────────────────── */
/* Backed by app/manifest.ts — a real installable PWA (display:
   "standalone"), not aspirational copy. */

function MobileSection() {
  return (
    <section className="px-6 py-24 border-t border-mkt-border">
      <div className="max-w-6xl mx-auto grid grid-cols-1 lg:grid-cols-[1.1fr_0.9fr] gap-14 items-center">
        <div>
          <SectionHeading
            eyebrow="Mobile"
            title="Full access on mobile. Installable to the home screen."
            body="Coaches and clients both work from their phones day to day. Kynovant runs in the browser and can be installed to the home screen as a PWA where the platform supports it."
          />
          <ul className="mt-7 space-y-3.5">
            {[
              "Coach HQ and the client portal both work fully on mobile",
              "Installs to the home screen where supported",
              "No App Store or Play Store app is required",
            ].map((item) => (
              <li key={item} className="flex items-start gap-3 text-sm text-white/60">
                <Smartphone className="w-4 h-4 text-gold mt-0.5 shrink-0" />
                {item}
              </li>
            ))}
          </ul>
        </div>

        <div className="flex justify-center">
          <div className="w-[260px] rounded-[2.2rem] border border-mkt-border-strong bg-mkt-surface-raised p-2.5 shadow-[0_40px_100px_-30px_rgba(0,0,0,0.7)]">
            <div className="rounded-[1.7rem] overflow-hidden bg-mkt-surface">
              <div className="flex items-center justify-between px-5 pt-4 pb-3">
                <span className="text-[10px] text-white/30">9:41</span>
                <span className="text-[10px] text-white/30">●●●</span>
              </div>
              <div className="px-5 pb-6">
                <p className="text-[10px] uppercase tracking-[0.16em] text-white/35 mb-1">This Week</p>
                <h4 className="text-base font-semibold text-white mb-4">Upper Body — Day 2</h4>
                <div className="space-y-2">
                  {["Incline DB Press", "Lat Pulldown", "Cable Lateral Raise"].map((ex, i) => (
                    <div key={ex} className="flex items-center justify-between rounded-lg bg-white/[0.05] px-3 py-2.5">
                      <span className="text-xs text-white/70">{ex}</span>
                      {i === 0 ? (
                        <Check className="w-3.5 h-3.5 text-emerald-400" />
                      ) : (
                        <span className="text-[10px] text-white/25">4×10</span>
                      )}
                    </div>
                  ))}
                </div>
                <div className="mt-5 rounded-lg bg-gold/10 border border-gold/20 px-3 py-2.5 text-[11px] text-gold/90">
                  Check-in due tomorrow
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

/* ── Pricing ───────────────────────────────────────────────── */

const PRICING_INCLUDES = [
  "Coach HQ — client operations, all in one workspace",
  "AI Program Generator with coach review & approval",
  "Program Builder + Exercise Library",
  "Client portal — workouts, nutrition, progress",
  "Check-in review queue with prior-week context",
  "Messaging, internal scheduling, and documents",
  "Responsive web/PWA experience for coaches and clients",
];

function Pricing() {
  return (
    <section id="pricing" className="px-6 py-24 scroll-mt-24 border-t border-mkt-border">
      <div className="max-w-6xl mx-auto">
        <SectionHeading eyebrow="Pricing" title="One plan. Everything included." align="center" />

        <div className="mt-14 max-w-md mx-auto rounded-2xl border border-gold/25 bg-mkt-surface-raised overflow-hidden">
          <div className="h-px w-full bg-gradient-to-r from-transparent via-gold/60 to-transparent" />
          <div className="p-9">
            <p className="text-[11px] font-semibold uppercase tracking-[0.3em] text-gold mb-4">
              Kynovant Professional
            </p>
            <div className="flex items-baseline gap-2">
              <span className="text-5xl font-semibold text-white">$99</span>
              <span className="text-white/40 text-sm">/ month</span>
            </div>
            <p className="mt-3 text-sm text-white/45">Starts with a 14-day free trial. Cancel anytime.</p>

            <div className="my-8 h-px bg-mkt-border" />

            <ul className="space-y-3">
              {PRICING_INCLUDES.map((item) => (
                <li key={item} className="flex items-start gap-3 text-sm text-white/65">
                  <Check className="w-4 h-4 text-signal mt-0.5 shrink-0" />
                  <span>{item}</span>
                </li>
              ))}
            </ul>

            <Link
              href="/start-trial"
              className="mt-9 flex items-center justify-center gap-2 rounded-md bg-white px-6 py-3.5 text-sm font-semibold text-[#0d0f11] hover:bg-white/90 transition-colors"
            >
              Start Free Trial
              <ArrowRight className="w-4 h-4" />
            </Link>
            <p className="mt-4 text-center text-xs text-white/30">
              No payment required to create your coach account.
            </p>
          </div>
        </div>
      </div>
    </section>
  );
}

/* ── Final CTA ─────────────────────────────────────────────── */

function FinalCTA() {
  return (
    <section className="px-6 py-28 border-t border-mkt-border">
      <div className="max-w-3xl mx-auto text-center">
        <h2 className="text-3xl md:text-[2.75rem] font-semibold tracking-tight text-white leading-[1.08]">
          Build the system behind the follow-through.
        </h2>
        <p className="mt-5 text-base leading-relaxed text-white/50 max-w-xl mx-auto">
          Kynovant Professional is $99/month with a 14-day free trial for personal trainers
          and online coaches. Get started in minutes — no demo call required to see how it works.
        </p>
        <div className="mt-9 flex flex-wrap items-center justify-center gap-4">
          <Link
            href="/start-trial"
            className="group inline-flex items-center gap-2 rounded-md bg-white px-7 py-3.5 text-sm font-semibold text-[#0d0f11] hover:bg-white/90 transition-colors"
          >
            Start 14-Day Free Trial
            <ArrowRight className="w-4 h-4 transition-transform group-hover:translate-x-0.5" />
          </Link>
          <Link
            href="#platform"
            className="inline-flex items-center gap-2 rounded-md border border-mkt-border-strong px-7 py-3.5 text-sm font-semibold text-white/80 hover:text-white hover:border-white/30 transition-colors"
          >
            See the Platform
          </Link>
        </div>
      </div>
    </section>
  );
}
