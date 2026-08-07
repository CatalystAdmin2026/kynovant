import Link from "next/link";
import {
  Activity,
  ArrowUpRight,
  BarChart3,
  BellRing,
  BriefcaseBusiness,
  CheckCircle2,
  CircleDollarSign,
  ClipboardList,
  Database,
  Dumbbell,
  Gauge,
  LineChart,
  Lock,
  MailPlus,
  ServerCog,
  ShieldCheck,
  Sparkles,
  Users,
} from "lucide-react";
import { requireAdminPage } from "@/lib/auth/guards";
import { getOverwatchMetrics } from "@/lib/db/overwatch-service";

export const dynamic = "force-dynamic";

function fmtNumber(value: number): string {
  return new Intl.NumberFormat("en-US", { maximumFractionDigits: 1 }).format(value);
}

function fmtDate(date: Date | null): string {
  if (!date) return "No activity";
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(date);
}

function labelize(value: string): string {
  return value.replace(/_/g, " ").replace(/\b\w/g, (char) => char.toUpperCase());
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-[#050607] text-[#F3F1EA]">
      <div className="fixed inset-x-0 top-0 z-20 border-b border-white/[0.07] bg-[#050607]/90 backdrop-blur-md">
        <div className="mx-auto flex h-14 max-w-[1440px] items-center justify-between px-5 sm:px-8">
          <div className="flex min-w-0 items-center gap-3">
            <div className="flex h-7 w-7 items-center justify-center border border-[#C9A24D]/25 bg-[#C9A24D]/10">
              <ShieldCheck size={15} className="text-[#C9A24D]" />
            </div>
            <div className="min-w-0">
              <p className="text-[10px] font-bold uppercase tracking-[0.42em] text-[#C9A24D]/80">Overwatch</p>
              <p className="hidden text-[10px] uppercase tracking-[0.28em] text-white/28 sm:block">Kynovant Executive Control</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <span className="hidden items-center gap-1.5 border border-emerald-500/20 bg-emerald-500/[0.04] px-3 py-1.5 text-[10px] font-semibold uppercase tracking-[0.24em] text-emerald-300/75 sm:inline-flex">
              <Lock size={11} />
              Admin Only
            </span>
            <Link
              href="/admin"
              className="inline-flex items-center gap-1.5 border border-white/[0.08] px-3 py-2 text-[10px] font-semibold uppercase tracking-[0.24em] text-white/40 transition-colors hover:border-white/[0.16] hover:text-white/70"
            >
              Legacy Admin
              <ArrowUpRight size={12} />
            </Link>
          </div>
        </div>
      </div>
      <main className="mx-auto max-w-[1440px] px-5 pb-16 pt-24 sm:px-8">
        {children}
      </main>
    </div>
  );
}

function StatCard({
  icon: Icon,
  label,
  value,
  detail,
  tone = "neutral",
}: {
  icon: React.ComponentType<{ size?: number; className?: string }>;
  label: string;
  value: string | number;
  detail: string;
  tone?: "neutral" | "gold" | "green" | "blue";
}) {
  const toneClass = {
    neutral: "text-white/50 border-white/[0.08] bg-white/[0.025]",
    gold: "text-[#C9A24D] border-[#C9A24D]/20 bg-[#C9A24D]/[0.045]",
    green: "text-emerald-300/80 border-emerald-500/20 bg-emerald-500/[0.04]",
    blue: "text-sky-300/80 border-sky-500/20 bg-sky-500/[0.04]",
  }[tone];

  return (
    <div className="border border-white/[0.07] bg-white/[0.025] p-4 sm:p-5">
      <div className="mb-5 flex items-center justify-between gap-3">
        <div className={`flex h-8 w-8 items-center justify-center border ${toneClass}`}>
          <Icon size={15} />
        </div>
        <span className="text-[10px] uppercase tracking-[0.26em] text-white/22">Live</span>
      </div>
      <p className="text-[10px] font-semibold uppercase tracking-[0.3em] text-white/28">{label}</p>
      <p className="mt-2 text-3xl font-semibold tracking-tight text-white">{value}</p>
      <p className="mt-2 min-h-8 text-xs leading-relaxed text-white/35">{detail}</p>
    </div>
  );
}

function ComingOnlineCard({
  icon: Icon,
  title,
  detail,
}: {
  icon: React.ComponentType<{ size?: number; className?: string }>;
  title: string;
  detail: string;
}) {
  return (
    <div className="border border-dashed border-white/[0.1] bg-white/[0.018] p-4">
      <div className="mb-4 flex items-center justify-between gap-3">
        <div className="flex h-8 w-8 items-center justify-center border border-white/[0.08] bg-black/20 text-white/24">
          <Icon size={15} />
        </div>
        <span className="text-[9px] font-semibold uppercase tracking-[0.24em] text-white/22">Coming Online</span>
      </div>
      <p className="text-sm font-semibold text-white/70">{title}</p>
      <p className="mt-2 text-xs leading-relaxed text-white/32">{detail}</p>
    </div>
  );
}

function Section({
  title,
  eyebrow,
  children,
}: {
  title: string;
  eyebrow: string;
  children: React.ReactNode;
}) {
  return (
    <section className="space-y-4">
      <div>
        <p className="text-[10px] font-semibold uppercase tracking-[0.36em] text-[#C9A24D]/55">{eyebrow}</p>
        <h2 className="mt-2 text-xl font-semibold text-white">{title}</h2>
      </div>
      {children}
    </section>
  );
}

export default async function OverwatchPage() {
  const { dbUser } = await requireAdminPage();
  const data = await getOverwatchMetrics();
  const recentCoachRows = data.coaches.slice(0, 7);
  const maxDistribution = Math.max(1, ...data.coaching.clientDistribution.map((bucket) => bucket.coaches));

  return (
    <Shell>
      <div className="mb-10 grid gap-6 lg:grid-cols-[1.35fr_0.65fr]">
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-[0.42em] text-[#C9A24D]/60">Executive Overview</p>
          <h1 className="mt-3 max-w-4xl text-4xl font-semibold tracking-tight text-white sm:text-5xl">
            Platform command center for Kynovant operations.
          </h1>
          <p className="mt-4 max-w-2xl text-sm leading-7 text-white/42">
            Aggregate-only visibility across growth, coach supply, content inventory, platform health, and revenue instrumentation. No coach client records are exposed here.
          </p>
        </div>
        <div className="border border-white/[0.07] bg-white/[0.025] p-5">
          <p className="text-[10px] font-semibold uppercase tracking-[0.3em] text-white/28">Executive Session</p>
          <p className="mt-3 truncate text-sm text-white/70">{dbUser.email}</p>
          <div className="mt-5 grid grid-cols-2 gap-3 text-xs">
            <div className="border border-white/[0.06] bg-black/15 p-3">
              <p className="text-white/25">Admin users</p>
              <p className="mt-1 text-lg font-semibold text-white">{data.users.admins}</p>
            </div>
            <div className="border border-white/[0.06] bg-black/15 p-3">
              <p className="text-white/25">Platform users</p>
              <p className="mt-1 text-lg font-semibold text-white">{data.users.total}</p>
            </div>
          </div>
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard icon={Users} label="Coaches" value={data.users.coaches} detail={`${data.users.activeCoaches} active, ${data.users.invitedCoaches} invited seats.`} tone="gold" />
        <StatCard icon={BriefcaseBusiness} label="Applications" value={data.growth.applicationsTotal} detail={`${data.growth.applicationsNew} new and ${data.growth.applicationsQualified} qualified in the coach pipeline.`} tone="blue" />
        <StatCard icon={ClipboardList} label="Programs" value={data.library.programsTotal} detail={`${data.library.programsActive} published, ${data.library.programsDraft} draft Program templates.`} />
        <StatCard icon={Dumbbell} label="Exercise Library" value={data.library.exercisesTotal} detail={`${data.library.exercisesActive} active exercises across system, organization, and coach scopes.`} tone="green" />
      </div>

      <div className="mt-10 grid gap-8 xl:grid-cols-[1fr_380px]">
        <div className="space-y-10">
          <Section eyebrow="Growth" title="Coach Acquisition">
            <div className="grid gap-4 lg:grid-cols-[1fr_0.9fr]">
              <div className="border border-white/[0.07] bg-white/[0.025] p-5">
                <div className="mb-5 flex items-center justify-between">
                  <div>
                    <p className="text-sm font-semibold text-white">Applications</p>
                    <p className="mt-1 text-xs text-white/32">Pipeline status from the coach application table.</p>
                  </div>
                  <Link href="/admin/growth/applications" className="text-[10px] font-semibold uppercase tracking-[0.24em] text-[#C9A24D]/70 hover:text-[#C9A24D]">
                    Open
                  </Link>
                </div>
                <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                  {[
                    ["New", data.growth.applicationsNew],
                    ["Qualified", data.growth.applicationsQualified],
                    ["Demo Scheduled", data.growth.demosScheduled],
                    ["Demo Complete", data.growth.demosComplete],
                    ["Accepted", data.growth.accepted],
                    ["Declined", data.growth.declined],
                  ].map(([label, value]) => (
                    <div key={label} className="border border-white/[0.06] bg-black/15 p-3">
                      <p className="text-[10px] uppercase tracking-[0.24em] text-white/24">{label}</p>
                      <p className="mt-2 text-2xl font-semibold text-white">{value}</p>
                    </div>
                  ))}
                </div>
              </div>

              <div className="border border-white/[0.07] bg-white/[0.025] p-5">
                <p className="text-sm font-semibold text-white">Recent Applications</p>
                <div className="mt-4 space-y-2">
                  {data.growth.recentApplications.length > 0 ? data.growth.recentApplications.map((app) => (
                    <div key={app.id} className="flex items-center justify-between gap-3 border border-white/[0.055] bg-black/15 p-3">
                      <div className="min-w-0">
                        <p className="truncate text-sm font-medium text-white/75">{app.name}</p>
                        <p className="mt-1 text-[11px] text-white/28">{app.businessStage ?? "Stage unavailable"} - {fmtDate(app.createdAt)}</p>
                      </div>
                      <span className="shrink-0 border border-white/[0.08] px-2 py-1 text-[9px] uppercase tracking-[0.18em] text-white/35">
                        {labelize(app.status)}
                      </span>
                    </div>
                  )) : (
                    <p className="border border-dashed border-white/[0.08] p-4 text-sm text-white/32">No coach applications have arrived yet.</p>
                  )}
                </div>
              </div>
            </div>
          </Section>

          <Section eyebrow="Supply" title="Coach Directory">
            <div className="grid gap-4 lg:grid-cols-[1fr_260px]">
              <div className="overflow-x-auto border border-white/[0.07] bg-white/[0.025]">
                <div className="min-w-[680px]">
                  <div className="grid grid-cols-[1.4fr_0.6fr_0.5fr_0.5fr] border-b border-white/[0.06] px-4 py-3 text-[10px] font-semibold uppercase tracking-[0.24em] text-white/26">
                    <span>Coach</span>
                    <span>Status</span>
                    <span>Role</span>
                    <span className="text-right">Active Clients</span>
                  </div>
                  {recentCoachRows.length > 0 ? recentCoachRows.map((coach) => (
                    <div key={coach.id} className="grid grid-cols-[1.4fr_0.6fr_0.5fr_0.5fr] items-center border-b border-white/[0.045] px-4 py-3 last:border-b-0">
                      <div className="min-w-0">
                        <p className="truncate text-sm font-medium text-white/75">{coach.displayName ?? coach.email}</p>
                        <p className="truncate text-[11px] text-white/25">{coach.email}</p>
                      </div>
                      <span className="text-xs text-white/42">{labelize(coach.status)}</span>
                      <span className="text-xs text-white/42">{labelize(coach.role)}</span>
                      <span className="text-right text-sm font-semibold text-white">{coach.activeClientCount}</span>
                    </div>
                  )) : (
                    <p className="p-5 text-sm text-white/32">No coach seats exist yet.</p>
                  )}
                </div>
              </div>

              <div className="border border-white/[0.07] bg-white/[0.025] p-5">
                <p className="text-sm font-semibold text-white">Client-count Distribution</p>
                <p className="mt-1 text-xs text-white/32">Aggregated active enrollment counts by coach.</p>
                <div className="mt-5 space-y-3">
                  {data.coaching.clientDistribution.map((bucket) => (
                    <div key={bucket.label}>
                      <div className="mb-1 flex justify-between text-xs">
                        <span className="text-white/35">{bucket.label}</span>
                        <span className="text-white/55">{bucket.coaches}</span>
                      </div>
                      <div className="h-1.5 bg-white/[0.06]">
                        <div className="h-full bg-[#C9A24D]/70" style={{ width: `${(bucket.coaches / maxDistribution) * 100}%` }} />
                      </div>
                    </div>
                  ))}
                </div>
                <div className="mt-5 border-t border-white/[0.06] pt-4">
                  <p className="text-[10px] uppercase tracking-[0.24em] text-white/24">Average Clients / Coach</p>
                  <p className="mt-1 text-2xl font-semibold text-white">{fmtNumber(data.coaching.averageClientsPerCoach)}</p>
                </div>
              </div>
            </div>
          </Section>

          <Section eyebrow="Product" title="Programs and Exercise Intelligence">
            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
              <StatCard icon={Sparkles} label="Programs Created 30d" value={data.generatedPrograms.createdLast30d} detail="Real Program template creation count. AI attribution is not persisted yet." tone="gold" />
              <StatCard icon={ClipboardList} label="Blueprints" value={data.library.blueprintsTotal} detail={`${data.library.blueprintsActive} active reusable single-workout templates.`} />
              <StatCard icon={Database} label="Prescriptions" value={data.library.exercisePrescriptions} detail={`${data.library.blueprintSections} Blueprint sections support workout structure.`} />
              <StatCard icon={Gauge} label="Library Gaps" value={data.library.missingFatigueCost + data.library.missingMuscleGroup} detail={`${data.library.missingFatigueCost} missing fatigue cost, ${data.library.missingMuscleGroup} missing primary muscle.`} tone="blue" />
            </div>
          </Section>
        </div>

        <aside className="space-y-6">
          <Section eyebrow="Revenue" title="Subscription Metrics">
            <div className="space-y-3">
              <ComingOnlineCard icon={CircleDollarSign} title="MRR" detail="Stripe subscription records are not yet normalized into platform billing tables." />
              <ComingOnlineCard icon={LineChart} title="Trial Conversions" detail="Trial lifecycle events need a product billing pipeline before conversion rates can be calculated honestly." />
              <ComingOnlineCard icon={BarChart3} title="Revenue Cohorts" detail="Reserved for plan mix, expansion, contraction, churn, and net revenue retention." />
              <div className="border border-white/[0.07] bg-white/[0.025] p-4">
                <p className="text-sm font-semibold text-white">Stripe Instrumentation</p>
                <div className="mt-4 grid grid-cols-2 gap-3">
                  <div className="border border-white/[0.06] bg-black/15 p-3">
                    <p className="text-[10px] uppercase tracking-[0.2em] text-white/24">Identities</p>
                    <p className="mt-1 text-xl font-semibold text-white">{data.integrations.stripeIdentities}</p>
                  </div>
                  <div className="border border-white/[0.06] bg-black/15 p-3">
                    <p className="text-[10px] uppercase tracking-[0.2em] text-white/24">Subscriptions</p>
                    <p className="mt-1 text-xl font-semibold text-white">{data.integrations.stripeSubscriptions}</p>
                  </div>
                </div>
              </div>
            </div>
          </Section>

          <Section eyebrow="Health" title="Platform Health">
            <div className="space-y-3">
              <div className="border border-emerald-500/20 bg-emerald-500/[0.04] p-4">
                <div className="flex items-center gap-2">
                  <CheckCircle2 size={15} className="text-emerald-300/80" />
                  <p className="text-sm font-semibold text-white">Database Reachable</p>
                </div>
                <p className="mt-2 text-xs leading-relaxed text-white/35">Overwatch loaded aggregate data through the server-side database client.</p>
              </div>
              <div className="border border-white/[0.07] bg-white/[0.025] p-4">
                <p className="text-sm font-semibold text-white">Recent Platform Activity</p>
                <div className="mt-4 space-y-2">
                  {data.activity.length > 0 ? data.activity.map((item) => (
                    <div key={item.eventType} className="flex items-center justify-between gap-3 border border-white/[0.055] bg-black/15 p-3">
                      <div className="min-w-0">
                        <p className="truncate text-sm text-white/65">{labelize(item.eventType)}</p>
                        <p className="text-[11px] text-white/28">{fmtDate(item.lastOccurredAt)}</p>
                      </div>
                      <span className="text-sm font-semibold text-white">{item.count}</span>
                    </div>
                  )) : (
                    <p className="border border-dashed border-white/[0.08] p-4 text-sm text-white/32">No aggregate timeline activity in the last 7 days.</p>
                  )}
                </div>
              </div>
              <ComingOnlineCard icon={ServerCog} title="Background Jobs" detail="Reserved for queue depth, retry rate, stale jobs, and last-success timestamps once workers are registered." />
              <ComingOnlineCard icon={BellRing} title="Incident Signals" detail="Reserved for alert routing, webhook failures, billing sync errors, and service degradation notices." />
              <div className="grid grid-cols-2 gap-3">
                <div className="border border-white/[0.07] bg-white/[0.025] p-4">
                  <Activity size={15} className="text-[#C9A24D]/70" />
                  <p className="mt-3 text-[10px] uppercase tracking-[0.22em] text-white/24">Workouts 7d</p>
                  <p className="mt-1 text-xl font-semibold text-white">{data.coaching.completedWorkoutsLast7d}</p>
                </div>
                <div className="border border-white/[0.07] bg-white/[0.025] p-4">
                  <MailPlus size={15} className="text-[#C9A24D]/70" />
                  <p className="mt-3 text-[10px] uppercase tracking-[0.22em] text-white/24">Invites</p>
                  <p className="mt-1 text-xl font-semibold text-white">{data.users.invitedCoaches}</p>
                </div>
              </div>
            </div>
          </Section>
        </aside>
      </div>
    </Shell>
  );
}
