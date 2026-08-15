import Link from "next/link";
import type React from "react";
import {
  Activity,
  ArrowUpDown,
  Brain,
  CircleDollarSign,
  Database,
  HeartPulse,
  ReceiptText,
  ShieldCheck,
  Users,
} from "lucide-react";
import { requireOverwatchAdminPage } from "@/lib/auth/guards";
import {
  getOverwatchFounderProfile,
  getOverwatchMetrics,
  type OverwatchCoachRow,
  type OverwatchFunnelStage,
} from "@/lib/db/overwatch-service";

export const dynamic = "force-dynamic";

type Search = {
  status?: string;
  subscription?: string;
  sort?: string;
};

function labelize(value: string | null | undefined): string {
  if (!value) return "None";
  return value.replace(/_/g, " ").replace(/\b\w/g, (char) => char.toUpperCase());
}

function fmtNumber(value: number): string {
  return new Intl.NumberFormat("en-US", { maximumFractionDigits: 1 }).format(value);
}

function toDate(value: Date | string | null | undefined): Date | null {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function dateTime(value: Date | string | null | undefined): number {
  return toDate(value)?.getTime() ?? 0;
}

function fmtDate(date: Date | string | null | undefined): string {
  const parsed = toDate(date);
  if (!parsed) return "None";
  return new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", year: "numeric" }).format(parsed);
}

function fmtPercent(value: number | null): string {
  if (value === null) return "Not enough data";
  return new Intl.NumberFormat("en-US", { style: "percent", maximumFractionDigits: 0 }).format(value);
}

function fmtDuration(ms: number | null): string {
  if (ms === null) return "Not enough data";
  if (ms < 1000) return `${Math.round(ms)} ms`;
  return `${fmtNumber(ms / 1000)} sec`;
}

function greetingForNow(name: string | null, timezone: string): string {
  const hour = Number(
    new Intl.DateTimeFormat("en-US", {
      hour: "numeric",
      hour12: false,
      timeZone: timezone,
    }).format(new Date()),
  );
  const daypart = hour < 12 ? "morning" : hour < 18 ? "afternoon" : "evening";
  return name ? `Good ${daypart}, ${name}.` : `Good ${daypart}.`;
}

function statusTone(value: string | null | undefined): string {
  if (value === "active" || value === "trialing" || value === "manually_activated") {
    return "border-emerald-400/20 bg-emerald-400/[0.06] text-emerald-200";
  }
  if (value === "past_due" || value === "invited") {
    return "border-amber-300/25 bg-amber-300/[0.07] text-amber-100";
  }
  if (value === "cancelled" || value === "suspended") {
    return "border-red-300/20 bg-red-300/[0.06] text-red-100";
  }
  return "border-white/[0.08] bg-white/[0.035] text-white/46";
}

function MetricCard({
  icon: Icon,
  label,
  value,
  detail,
}: {
  icon: React.ComponentType<{ size?: number; className?: string }>;
  label: string;
  value: string | number;
  detail: string;
}) {
  return (
    <div className="border border-white/[0.08] bg-[#101113] p-3.5">
      <div className="mb-3 flex h-7 w-7 items-center justify-center border border-[#C9A24D]/25 bg-[#C9A24D]/10 text-[#D8B867]">
        <Icon size={14} />
      </div>
      <p className="text-[10px] font-semibold uppercase tracking-[0.22em] text-white/34">{label}</p>
      <p className="mt-1.5 text-2xl font-semibold tracking-tight text-white">{value}</p>
      <p className="mt-1 text-[11px] leading-5 text-white/42">{detail}</p>
    </div>
  );
}

function FilterLink({
  href,
  active,
  children,
}: {
  href: string;
  active: boolean;
  children: React.ReactNode;
}) {
  return (
    <Link
      href={href}
      className={`border px-3 py-2 text-[10px] font-semibold uppercase tracking-[0.16em] transition-colors ${
        active
          ? "border-[#C9A24D]/45 bg-[#C9A24D]/10 text-[#E3C778]"
          : "border-white/[0.08] bg-white/[0.025] text-white/38 hover:border-white/[0.16] hover:text-white/70"
      }`}
    >
      {children}
    </Link>
  );
}

function filterAndSortAccounts(accounts: OverwatchCoachRow[], search: Search): OverwatchCoachRow[] {
  const filtered = accounts.filter((coach) => {
    const sub = coach.subscriptionStatus;
    const statusOk =
      !search.status ||
      search.status === "all" ||
      (search.status === "active" ? coach.accountStatus === "active" : coach.accountStatus === search.status);
    const subOk =
      !search.subscription ||
      search.subscription === "all" ||
      (search.subscription === "none"
        ? !sub
        : search.subscription === "cancelled"
          ? sub === "cancelled" || sub === "suspended"
          : sub === search.subscription);
    return statusOk && subOk;
  });

  return filtered.sort((a, b) => {
    switch (search.sort) {
      case "last-active":
        return dateTime(b.lastActiveAt) - dateTime(a.lastActiveAt);
      case "clients":
        return b.activeClientCount - a.activeClientCount;
      case "name":
        return (a.displayName ?? a.email).localeCompare(b.displayName ?? b.email);
      case "subscription":
        return labelize(a.subscriptionStatus).localeCompare(labelize(b.subscriptionStatus));
      case "newest":
      default:
        return dateTime(b.createdAt) - dateTime(a.createdAt);
    }
  });
}

function FunnelRate({ stage }: { stage: OverwatchFunnelStage }) {
  return (
    <div className="grid grid-cols-2 gap-2 text-[11px] text-white/38">
      <span>Prev: {fmtPercent(stage.previousRate)}</span>
      <span>Start: {fmtPercent(stage.startedRate)}</span>
    </div>
  );
}

export default async function OverwatchPage({
  searchParams,
}: {
  searchParams: Promise<Search>;
}) {
  const { dbUser } = await requireOverwatchAdminPage();
  const search = await searchParams;
  const data = await getOverwatchMetrics();
  const founderProfile = await getOverwatchFounderProfile(dbUser.id);
  const accounts = filterAndSortAccounts(data.accounts, search);
  const maxFunnel = Math.max(1, ...data.acquisition.stages.map((stage) => stage.count));

  return (
    <main className="min-h-screen bg-[#080909] text-[#F3F1EA]">
      <header className="border-b border-white/[0.07] bg-[#080909]/95">
        <div className="mx-auto flex max-w-[1500px] items-center justify-between gap-4 px-5 py-4 sm:px-8">
          <div className="flex min-w-0 items-center gap-3">
            <div className="flex h-8 w-8 items-center justify-center border border-[#C9A24D]/30 bg-[#C9A24D]/10 text-[#D8B867]">
              <ShieldCheck size={16} />
            </div>
            <div>
              <p className="text-[10px] font-bold uppercase tracking-[0.42em] text-[#D8B867]/80">Overwatch</p>
              <p className="text-[11px] text-white/34">Founder command center</p>
            </div>
          </div>
          <div className="hidden min-w-0 text-right sm:block">
            <p className="truncate text-sm text-white/64">{dbUser.email}</p>
            <p className="text-[10px] uppercase tracking-[0.22em] text-emerald-200/55">Admin-only session</p>
          </div>
        </div>
      </header>

      <div className="mx-auto max-w-[1500px] space-y-7 px-5 py-7 sm:px-8">
        <section className="flex flex-col justify-between gap-4 lg:flex-row lg:items-end">
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-[0.34em] text-[#D8B867]/65">Executive Pulse</p>
            <h1 className="mt-2 text-3xl font-semibold tracking-tight text-white sm:text-5xl">
              {greetingForNow(founderProfile.firstName, founderProfile.timezone)}
            </h1>
            <p className="mt-3 max-w-3xl text-sm leading-6 text-white/46">
              Kynovant SaaS operating view. Client PII is excluded from founder analytics.
            </p>
          </div>
          <div className="border border-emerald-300/18 bg-emerald-300/[0.04] px-3 py-2 text-[10px] font-semibold uppercase tracking-[0.2em] text-emerald-100/72">
            Business accounts only
          </div>
        </section>

        <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <MetricCard icon={ReceiptText} label="Active Trials" value={data.overview.activeTrials} detail="Customer accounts in trialing billing state." />
          <MetricCard icon={CircleDollarSign} label="Paying Accounts" value={data.overview.payingAccounts} detail="Active or manually activated customer billing." />
          <MetricCard icon={Users} label="New Signups 7D" value={data.overview.newSignups7d} detail="New customer coach/trainer accounts." />
          <MetricCard icon={ShieldCheck} label="Active Customer Coaches" value={data.overview.activeCustomerCoaches} detail="Active real business coach/trainer accounts." />
          <MetricCard icon={Users} label="Active Clients" value={data.overview.activeClients} detail="Count only, no client identities exposed." />
          <MetricCard icon={Activity} label="Workouts 7D" value={data.overview.workouts7d} detail="Completed sessions under customer coaches." />
          <MetricCard icon={CircleDollarSign} label="Trial → Paid" value={fmtPercent(data.overview.trialToPaid)} detail="Hidden until the recorded trial denominator is meaningful." />
          <MetricCard icon={Brain} label="AI Generations 7D" value={data.overview.aiGenerations7d} detail="Program generation runs by customer accounts." />
        </section>

        <section className="grid gap-5 xl:grid-cols-[0.9fr_1.1fr]">
          <div className="border border-white/[0.08] bg-[#101113] p-5">
            <div className="mb-5 flex items-start justify-between gap-4">
              <div>
                <p className="text-[10px] font-semibold uppercase tracking-[0.3em] text-[#D8B867]/62">Acquisition</p>
                <h2 className="mt-2 text-xl font-semibold text-white">Signup Funnel</h2>
              </div>
              <span className="border border-white/[0.08] px-3 py-1.5 text-[10px] uppercase tracking-[0.18em] text-white/34">Lead ledger</span>
            </div>
            <div className="space-y-3">
              {data.acquisition.stages.map((stage) => (
                <div key={stage.key}>
                  <div className="mb-1.5 flex items-center justify-between text-xs">
                    <span className="text-white/55">{stage.label}</span>
                    <span className="font-semibold text-white">{stage.count}</span>
                  </div>
                  <div className="mb-1.5 h-2 bg-white/[0.06]">
                    <div className="h-full bg-[#C9A24D]" style={{ width: `${(stage.count / maxFunnel) * 100}%` }} />
                  </div>
                  <FunnelRate stage={stage} />
                </div>
              ))}
            </div>
          </div>

          <div className="overflow-x-auto border border-white/[0.08] bg-[#101113]">
            <div className="min-w-[760px]">
              <div className="grid grid-cols-[1.25fr_1fr_0.7fr_0.8fr_0.8fr] border-b border-white/[0.07] px-4 py-3 text-[10px] font-semibold uppercase tracking-[0.2em] text-white/30">
                <span>Lead</span>
                <span>Email</span>
                <span>Invite</span>
                <span>Account</span>
                <span>Subscription</span>
              </div>
              {data.acquisition.recentLeads.length > 0 ? data.acquisition.recentLeads.map((lead) => (
                <div key={lead.id} className="grid grid-cols-[1.25fr_1fr_0.7fr_0.8fr_0.8fr] items-center border-b border-white/[0.045] px-4 py-3 last:border-b-0">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium text-white/78">{lead.submittedName}</p>
                    <p className="text-[11px] text-white/30">{fmtDate(lead.firstSignupAt)}</p>
                  </div>
                  <p className="truncate text-xs text-white/42">{lead.normalizedEmail}</p>
                  <span className={`mr-3 border px-2 py-1 text-[10px] ${statusTone(lead.inviteStatus)}`}>{labelize(lead.inviteStatus)}</span>
                  <span className={`mr-3 border px-2 py-1 text-[10px] ${statusTone(lead.accountStatus)}`}>{labelize(lead.accountStatus)}</span>
                  <span className={`mr-3 border px-2 py-1 text-[10px] ${statusTone(lead.subscriptionStatus)}`}>{labelize(lead.subscriptionStatus)}</span>
                </div>
              )) : (
                <p className="p-5 text-sm text-white/36">No acquisition leads yet. New trial signups will appear here.</p>
              )}
            </div>
          </div>
        </section>

        <section className="grid gap-4 lg:grid-cols-4">
          <div className="border border-white/[0.08] bg-[#101113] p-4">
            <ReceiptText size={16} className="text-[#D8B867]" />
            <p className="mt-3 text-sm font-semibold text-white">Revenue / Billing</p>
            <p className="mt-2 text-xs leading-6 text-white/42">
              {data.revenue.activeTrials} trials, {data.revenue.payingAccounts} paying, {data.revenue.pastDueSubscriptions} past due, {data.revenue.cancelledSubscriptions} cancelled/suspended. {data.revenue.trialEndingSoon} trials end within 7 days.
            </p>
          </div>
          <div className="border border-white/[0.08] bg-[#101113] p-4">
            <HeartPulse size={16} className="text-[#D8B867]" />
            <p className="mt-3 text-sm font-semibold text-white">Engagement</p>
            <p className="mt-2 text-xs leading-6 text-white/42">
              {data.engagement.workouts7d} workouts, {data.engagement.checkInsSubmitted7d} check-ins, {data.engagement.messages7d} messages in 7 days.
            </p>
          </div>
          <div className="border border-white/[0.08] bg-[#101113] p-4">
            <Brain size={16} className="text-[#D8B867]" />
            <p className="mt-3 text-sm font-semibold text-white">AI Operations</p>
            <p className="mt-2 text-xs leading-6 text-white/42">
              {data.aiOperations.runs7d} runs 7D, {data.aiOperations.runs30d} runs 30D, {fmtPercent(data.aiOperations.successRate)} success, {fmtDuration(data.aiOperations.averageLatencyMs)} average latency.
            </p>
          </div>
          <div className="border border-white/[0.08] bg-[#101113] p-4">
            <Database size={16} className="text-[#D8B867]" />
            <p className="mt-3 text-sm font-semibold text-white">Platform Health</p>
            <p className="mt-2 text-xs leading-6 text-white/42">
              DB reachable. Recent Stripe event: {fmtDate(data.platform.recentStripeEventAt)}. Failed invites: {data.platform.failedSignupInvites}. Past due: {data.platform.pastDueSubscriptions}.
            </p>
          </div>
        </section>

        <section className="space-y-4">
          <div className="flex flex-col justify-between gap-4 xl:flex-row xl:items-end">
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-[0.3em] text-[#D8B867]/62">Accounts</p>
              <h2 className="mt-2 text-xl font-semibold text-white">Customer Account Directory</h2>
            </div>
            <div className="flex flex-wrap gap-2">
              <FilterLink href="/overwatch?status=all" active={!search.status && !search.subscription || search.status === "all"}>All Customers</FilterLink>
              <FilterLink href="/overwatch?subscription=trialing" active={search.subscription === "trialing"}>Trialing</FilterLink>
              <FilterLink href="/overwatch?subscription=active" active={search.subscription === "active"}>Paying</FilterLink>
              <FilterLink href="/overwatch?subscription=past_due" active={search.subscription === "past_due"}>Past Due</FilterLink>
              <FilterLink href="/overwatch?subscription=cancelled" active={search.subscription === "cancelled"}>Cancelled</FilterLink>
              <FilterLink href="/overwatch?subscription=none" active={search.subscription === "none"}>No Billing</FilterLink>
            </div>
          </div>

          <div className="flex flex-wrap gap-2">
            <FilterLink href="/overwatch?sort=newest" active={!search.sort || search.sort === "newest"}><ArrowUpDown className="mr-1 inline" size={12} />Newest</FilterLink>
            <FilterLink href="/overwatch?sort=last-active" active={search.sort === "last-active"}><ArrowUpDown className="mr-1 inline" size={12} />Last Active</FilterLink>
            <FilterLink href="/overwatch?sort=clients" active={search.sort === "clients"}><ArrowUpDown className="mr-1 inline" size={12} />Clients</FilterLink>
            <FilterLink href="/overwatch?sort=subscription" active={search.sort === "subscription"}><ArrowUpDown className="mr-1 inline" size={12} />Subscription</FilterLink>
            <FilterLink href="/overwatch?sort=name" active={search.sort === "name"}><ArrowUpDown className="mr-1 inline" size={12} />Name</FilterLink>
          </div>

          <div className="overflow-x-auto border border-white/[0.08] bg-[#101113]">
            <div className="min-w-[1060px]">
              <div className="grid grid-cols-[1.3fr_1.15fr_0.65fr_0.85fr_0.85fr_0.55fr_0.75fr] border-b border-white/[0.07] px-4 py-3 text-[10px] font-semibold uppercase tracking-[0.2em] text-white/30">
                <span>Account</span>
                <span>Email</span>
                <span>Status</span>
                <span>Subscription</span>
                <span>Trial / Billing Date</span>
                <span className="text-right">Clients</span>
                <span>Last Active</span>
              </div>
              {accounts.length > 0 ? accounts.map((coach) => (
                <div key={coach.id} className="grid grid-cols-[1.3fr_1.15fr_0.65fr_0.85fr_0.85fr_0.55fr_0.75fr] items-center border-b border-white/[0.045] px-4 py-3 last:border-b-0">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium text-white/78">{coach.displayName ?? "Unnamed coach"}</p>
                    <p className="text-[11px] text-white/30">Joined {fmtDate(coach.createdAt)}</p>
                  </div>
                  <p className="truncate text-xs text-white/42">{coach.email}</p>
                  <span className={`mr-3 border px-2 py-1 text-[10px] ${statusTone(coach.accountStatus)}`}>{labelize(coach.accountStatus)}</span>
                  <span className={`mr-3 border px-2 py-1 text-[10px] ${statusTone(coach.subscriptionStatus)}`}>{labelize(coach.subscriptionStatus)}</span>
                  <div className="min-w-0 text-xs text-white/42">
                    <p>{coach.cancelledAt ? fmtDate(coach.cancelledAt) : fmtDate(coach.currentPeriodEnd)}</p>
                    {coach.cancelAtPeriodEnd && <p className="text-amber-100/70">Cancels at period end</p>}
                  </div>
                  <p className="text-right text-sm font-semibold text-white">{coach.activeClientCount}</p>
                  <p className="text-xs text-white/42">{fmtDate(coach.lastActiveAt)}</p>
                </div>
              )) : (
                <p className="p-5 text-sm text-white/36">No accounts match the current filters.</p>
              )}
            </div>
          </div>
        </section>

        <section className="grid gap-4 lg:grid-cols-3">
          <div className="border border-white/[0.08] bg-[#101113] p-5">
            <Database size={17} className="text-[#D8B867]" />
            <p className="mt-4 text-sm font-semibold text-white">Product Inventory</p>
            <p className="mt-2 text-xs leading-relaxed text-white/42">
              {data.product.programsActive}/{data.product.programsTotal} programs active, {data.product.blueprintsActive}/{data.product.blueprintsTotal} blueprints active, {data.product.exercisesActive}/{data.product.exercisesTotal} exercises active.
            </p>
          </div>
          <div className="border border-white/[0.08] bg-[#101113] p-5">
            <ShieldCheck size={17} className="text-[#D8B867]" />
            <p className="mt-4 text-sm font-semibold text-white">Privacy Boundary</p>
            <p className="mt-2 text-xs leading-relaxed text-white/42">
              Client PII excluded from founder analytics. Overwatch shows account-level coach/trainer identity, billing state, dates, and client counts only.
            </p>
          </div>
          <div className="border border-white/[0.08] bg-[#101113] p-5">
            <Brain size={17} className="text-[#D8B867]" />
            <p className="mt-4 text-sm font-semibold text-white">AI Distribution</p>
            <p className="mt-2 text-xs leading-relaxed text-white/42">
              Providers: {data.aiOperations.providerDistribution.length > 0 ? data.aiOperations.providerDistribution.map((item) => `${item.label}: ${item.count}`).join(" / ") : "Not enough data"}.
            </p>
          </div>
        </section>
      </div>
    </main>
  );
}
