import Link from "next/link";
import type React from "react";
import {
  Activity,
  ArrowUpDown,
  CircleDollarSign,
  Clock3,
  Database,
  ShieldCheck,
  TrendingUp,
  Users,
} from "lucide-react";
import { requireOverwatchAdminPage } from "@/lib/auth/guards";
import {
  getOverwatchFounderFirstName,
  getOverwatchMetrics,
  type OverwatchCoachRow,
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

function fmtDate(date: Date | null): string {
  if (!date) return "None";
  return new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", year: "numeric" }).format(date);
}

function fmtPercent(value: number | null): string {
  if (value === null) return "Not enough data";
  return new Intl.NumberFormat("en-US", { style: "percent", maximumFractionDigits: 0 }).format(value);
}

function greetingForNow(name: string | null): string {
  const hour = new Date().getHours();
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
    <div className="border border-white/[0.08] bg-[#101113] p-4">
      <div className="mb-5 flex items-center justify-between">
        <div className="flex h-8 w-8 items-center justify-center border border-[#C9A24D]/25 bg-[#C9A24D]/10 text-[#D8B867]">
          <Icon size={16} />
        </div>
        <span className="text-[10px] font-semibold uppercase tracking-[0.22em] text-white/24">Authoritative</span>
      </div>
      <p className="text-[10px] font-semibold uppercase tracking-[0.26em] text-white/30">{label}</p>
      <p className="mt-2 text-3xl font-semibold tracking-tight text-white">{value}</p>
      <p className="mt-2 min-h-8 text-xs leading-relaxed text-white/42">{detail}</p>
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
      className={`border px-3 py-2 text-[10px] font-semibold uppercase tracking-[0.18em] transition-colors ${
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
    const statusOk = !search.status || search.status === "all" || coach.accountStatus === search.status;
    const subOk =
      !search.subscription ||
      search.subscription === "all" ||
      (search.subscription === "none" ? !coach.subscriptionStatus : coach.subscriptionStatus === search.subscription);
    return statusOk && subOk;
  });

  return filtered.sort((a, b) => {
    switch (search.sort) {
      case "clients":
        return b.activeClientCount - a.activeClientCount;
      case "name":
        return (a.displayName ?? a.email).localeCompare(b.displayName ?? b.email);
      case "subscription":
        return labelize(a.subscriptionStatus).localeCompare(labelize(b.subscriptionStatus));
      case "newest":
      default:
        return b.createdAt.getTime() - a.createdAt.getTime();
    }
  });
}

export default async function OverwatchPage({
  searchParams,
}: {
  searchParams: Promise<Search>;
}) {
  const { dbUser } = await requireOverwatchAdminPage();
  const search = await searchParams;
  const [data, founderName] = await Promise.all([
    getOverwatchMetrics(),
    getOverwatchFounderFirstName(dbUser.id),
  ]);
  const accounts = filterAndSortAccounts(data.accounts, search);
  const funnel = [
    ["Started signup", data.acquisition.startedSignup],
    ["Invite sent", data.acquisition.inviteSent],
    ["Account activated", data.acquisition.accountActivated],
    ["Trial started", data.acquisition.trialStarted],
    ["Paid / active", data.acquisition.paidActive],
    ["Cancelled / churned", data.acquisition.cancelledChurned],
  ];
  const maxFunnel = Math.max(1, ...funnel.map(([, value]) => value as number));

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

      <div className="mx-auto max-w-[1500px] space-y-10 px-5 py-8 sm:px-8">
        <section className="grid gap-5 lg:grid-cols-[1.2fr_0.8fr]">
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-[0.34em] text-[#D8B867]/65">Executive Overview</p>
            <h1 className="mt-3 max-w-4xl text-4xl font-semibold tracking-tight text-white sm:text-5xl">
              {greetingForNow(founderName)}
            </h1>
            <p className="mt-4 max-w-3xl text-sm leading-7 text-white/46">
              Kynovant SaaS business visibility across acquisition, coach subscriptions, and platform load. Client identities and health records are intentionally excluded.
            </p>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="border border-white/[0.08] bg-[#101113] p-4">
              <p className="text-[10px] uppercase tracking-[0.24em] text-white/30">New Coaches</p>
              <p className="mt-2 text-3xl font-semibold text-white">{data.overview.newCoachAccounts30d}</p>
              <p className="mt-1 text-xs text-white/40">{data.overview.newCoachAccounts7d} in the last 7 days</p>
            </div>
            <div className="border border-white/[0.08] bg-[#101113] p-4">
              <p className="text-[10px] uppercase tracking-[0.24em] text-white/30">Trial to Paid</p>
              <p className="mt-2 text-3xl font-semibold text-white">{fmtPercent(data.acquisition.conversionRateTrialToPaid)}</p>
              <p className="mt-1 text-xs text-white/40">Only from recorded subscription states</p>
            </div>
          </div>
        </section>

        <section className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
          <MetricCard icon={Users} label="Coach Accounts" value={data.overview.totalCoachAccounts} detail={`${data.overview.activeCoachAccounts} active, ${data.overview.invitedCoachAccounts} invited.`} />
          <MetricCard icon={CircleDollarSign} label="Subscriptions" value={data.overview.activeSubscriptions} detail={`${data.overview.trialingSubscriptions} trialing, ${data.overview.pastDueSubscriptions} past due, ${data.overview.cancelledSubscriptions} cancelled/suspended.`} />
          <MetricCard icon={TrendingUp} label="Active Clients" value={data.overview.totalActiveClients} detail={`${fmtNumber(data.overview.averageClientsPerCoach)} average active clients per coach.`} />
          <MetricCard icon={Activity} label="Workouts 7d" value={data.product.completedWorkoutsLast7d} detail="Completed workout sessions across the platform." />
        </section>

        <section className="grid gap-6 xl:grid-cols-[0.95fr_1.05fr]">
          <div className="border border-white/[0.08] bg-[#101113] p-5">
            <div className="mb-5 flex items-start justify-between gap-4">
              <div>
                <p className="text-[10px] font-semibold uppercase tracking-[0.3em] text-[#D8B867]/62">Acquisition</p>
                <h2 className="mt-2 text-xl font-semibold text-white">Signup Funnel</h2>
              </div>
              <span className="border border-white/[0.08] px-3 py-1.5 text-[10px] uppercase tracking-[0.2em] text-white/34">No attempt ledger</span>
            </div>
            <div className="space-y-3">
              {funnel.map(([label, value]) => (
                <div key={label}>
                  <div className="mb-1.5 flex items-center justify-between text-xs">
                    <span className="text-white/50">{label}</span>
                    <span className="font-semibold text-white">{value}</span>
                  </div>
                  <div className="h-2 bg-white/[0.06]">
                    <div className="h-full bg-[#C9A24D]" style={{ width: `${((value as number) / maxFunnel) * 100}%` }} />
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="overflow-x-auto border border-white/[0.08] bg-[#101113]">
            <div className="min-w-[760px]">
              <div className="grid grid-cols-[1.25fr_1fr_0.7fr_0.8fr_0.8fr] border-b border-white/[0.07] px-4 py-3 text-[10px] font-semibold uppercase tracking-[0.22em] text-white/30">
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
                <p className="p-5 text-sm text-white/36">No acquisition leads have been recorded yet. Apply migration 0026 before relying on this funnel.</p>
              )}
            </div>
          </div>
        </section>

        <section className="space-y-4">
          <div className="flex flex-col justify-between gap-4 xl:flex-row xl:items-end">
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-[0.3em] text-[#D8B867]/62">Accounts</p>
              <h2 className="mt-2 text-xl font-semibold text-white">Coach and Trainer Accounts</h2>
            </div>
            <div className="flex flex-wrap gap-2">
              <FilterLink href="/overwatch?status=all" active={!search.status || search.status === "all"}>All</FilterLink>
              <FilterLink href="/overwatch?status=active" active={search.status === "active"}>Active</FilterLink>
              <FilterLink href="/overwatch?status=invited" active={search.status === "invited"}>Invited</FilterLink>
              <FilterLink href="/overwatch?subscription=trialing" active={search.subscription === "trialing"}>Trialing</FilterLink>
              <FilterLink href="/overwatch?subscription=active" active={search.subscription === "active"}>Paid</FilterLink>
              <FilterLink href="/overwatch?subscription=none" active={search.subscription === "none"}>No Billing</FilterLink>
            </div>
          </div>

          <div className="flex flex-wrap gap-2">
            <FilterLink href="/overwatch?sort=newest" active={!search.sort || search.sort === "newest"}><ArrowUpDown className="mr-1 inline" size={12} />Newest</FilterLink>
            <FilterLink href="/overwatch?sort=clients" active={search.sort === "clients"}><ArrowUpDown className="mr-1 inline" size={12} />Client Count</FilterLink>
            <FilterLink href="/overwatch?sort=name" active={search.sort === "name"}><ArrowUpDown className="mr-1 inline" size={12} />Name</FilterLink>
            <FilterLink href="/overwatch?sort=subscription" active={search.sort === "subscription"}><ArrowUpDown className="mr-1 inline" size={12} />Subscription</FilterLink>
          </div>

          <div className="overflow-x-auto border border-white/[0.08] bg-[#101113]">
            <div className="min-w-[980px]">
              <div className="grid grid-cols-[1.35fr_1.15fr_0.65fr_0.85fr_0.9fr_0.55fr] border-b border-white/[0.07] px-4 py-3 text-[10px] font-semibold uppercase tracking-[0.22em] text-white/30">
                <span>Coach</span>
                <span>Email</span>
                <span>Status</span>
                <span>Subscription</span>
                <span>Billing Date</span>
                <span className="text-right">Clients</span>
              </div>
              {accounts.length > 0 ? accounts.map((coach) => (
                <div key={coach.id} className="grid grid-cols-[1.35fr_1.15fr_0.65fr_0.85fr_0.9fr_0.55fr] items-center border-b border-white/[0.045] px-4 py-3 last:border-b-0">
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
            <Clock3 size={17} className="text-[#D8B867]" />
            <p className="mt-4 text-sm font-semibold text-white">Recent Activity</p>
            <p className="mt-2 text-xs leading-relaxed text-white/42">
              {data.platform.activity.length > 0
                ? data.platform.activity.map((item) => `${labelize(item.eventType)}: ${item.count}`).join(" · ")
                : "No aggregate timeline events in the last 7 days."}
            </p>
          </div>
          <div className="border border-white/[0.08] bg-[#101113] p-5">
            <ShieldCheck size={17} className="text-[#D8B867]" />
            <p className="mt-4 text-sm font-semibold text-white">Data Minimization</p>
            <p className="mt-2 text-xs leading-relaxed text-white/42">
              Overwatch shows account email/name, billing state, dates, and active client counts. Client names, emails, health data, check-ins, messages, documents, and programs are not exposed.
            </p>
          </div>
        </section>
      </div>
    </main>
  );
}
