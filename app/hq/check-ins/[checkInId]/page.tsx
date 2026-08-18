// ─────────────────────────────────────────────────────────────
// Catalyst HQ — Check-In Review Detail
//
// Server Component. Displays the full client check-in with
// comparison data (previous reviewed check-in) and the coach
// review panel (Client Component for response editing).
//
// Auth: HQ layout (requireCoachOrAdminPage).
// Returns 404 if check-in ID does not exist.
// ─────────────────────────────────────────────────────────────

import { notFound } from "next/navigation";
import Link from "next/link";
import { ChevronLeft, ArrowUpRight } from "lucide-react";
import HQBreadcrumbs from "@/components/hq/HQBreadcrumbs";
import { requireCoachOrAdminPage, coachOwnsClient } from "@/lib/auth/guards";
import {
  getCoachCheckInDetail,
  getClientGoalContext,
} from "@/lib/db/coach-check-in-service";
import CheckInReviewPanel from "@/components/hq/check-ins/CheckInReviewPanel";
import type { CheckInDetail } from "@/lib/db/check-in-service";
import { Card, Badge } from "@/components/ui";
import type { BadgeVariant } from "@/components/ui";
import { SEVERITY_TEXT, SEVERITY_BAR, type Severity } from "@/lib/ui/status";

export const dynamic = "force-dynamic";

// ─────────────────────────────────────────────────────────────
// HELPERS
// ─────────────────────────────────────────────────────────────

function fmtDate(d: string | Date | null, short = false): string {
  if (!d) return "—";
  const opts: Intl.DateTimeFormatOptions = short
    ? { month: "short", day: "numeric" }
    : { weekday: "long", month: "long", day: "numeric", year: "numeric" };
  return new Date(d instanceof Date ? d : d + "T12:00:00").toLocaleDateString("en-US", opts);
}

const STATUS_LABEL: Record<string, string> = {
  draft: "Draft",
  submitted: "Waiting for Review",
  in_review: "In Review",
  reviewed: "Reviewed",
};

const STATUS_BADGE_VARIANT: Record<string, BadgeVariant> = {
  draft: "neutral",
  submitted: "info",
  in_review: "warning",
  reviewed: "success",
};

const GOAL_TYPE_LABEL: Record<string, string> = {
  fat_loss: "Fat Loss",
  muscle_gain: "Muscle Gain",
  body_recomposition: "Body Recomposition",
  general_health: "General Health",
  maintenance: "Maintenance",
  custom: "Custom",
};

// ─────────────────────────────────────────────────────────────
// SHARED COLOR HELPERS
//
// RatingBar and ComplianceBar previously hand-rolled identical
// red/amber/emerald threshold logic independently. Both now derive
// from the shared Severity source (lib/ui/status.ts) so the same
// underlying state always renders the same hue. Thresholds are
// unchanged from the original hand-rolled versions — only the
// resulting color values are now sourced from SEVERITY_TEXT/
// SEVERITY_BAR instead of hardcoded tailwind classes.
// ─────────────────────────────────────────────────────────────

/** value/prev delta trend (RatingBar + ComplianceBar). Positive has
 *  no Severity equivalent (the module has no "good" hue), so it
 *  stays a named literal; zero/negative map cleanly onto Severity's
 *  unknown/critical buckets, which already match the prior literals
 *  exactly (text-white/25, text-red-400). */
function trendTextClass(delta: number): string {
  if (delta > 0) return "text-emerald-400";
  if (delta < 0) return SEVERITY_TEXT.critical;
  return SEVERITY_TEXT.unknown;
}

/** ComplianceBar's 0-100 compliance value, using the same 75/50
 *  thresholds the component always used. */
function complianceSeverity(value: number): Severity {
  if (value >= 75) return "ok";
  if (value >= 50) return "caution";
  return "critical";
}

/** High compliance is a positive/achievement signal, not merely
 *  "no problem" — Severity's "ok" bucket is deliberately neutral
 *  (matching StatusChip's PIL semantics), so it's overridden here
 *  with the same emerald used by trendTextClass's positive deltas,
 *  consistent with the "success" language used elsewhere in HQ
 *  (Badge's success variant, published/active status pills). */
function complianceTextClass(value: number): string {
  const sev = complianceSeverity(value);
  return sev === "ok" ? "text-emerald-400" : SEVERITY_TEXT[sev];
}
function complianceBarClass(value: number): string {
  const sev = complianceSeverity(value);
  return sev === "ok" ? "bg-emerald-400/80" : SEVERITY_BAR[sev];
}

// ─────────────────────────────────────────────────────────────
// DATA DISPLAY COMPONENTS
// ─────────────────────────────────────────────────────────────

function RatingBar({
  value,
  prev,
  label,
}: {
  value: number | null;
  prev: number | null;
  label: string;
}) {
  const fillPct = value !== null ? ((value - 1) / 9) * 100 : 0;
  const delta =
    value !== null && prev !== null ? value - prev : null;

  return (
    <div className="flex items-center gap-3 py-1.5 border-b border-white/[0.04] last:border-0">
      <p className="text-[9px] text-white/30 uppercase tracking-[0.25em] w-24 shrink-0">
        {label}
      </p>
      {value !== null ? (
        <>
          <div className="flex-1 h-1 bg-white/[0.06] relative">
            <div
              className="absolute left-0 top-0 h-full bg-gold/50"
              style={{ width: `${fillPct}%` }}
            />
          </div>
          <span className="text-gold text-xs font-bold w-8 text-right shrink-0">
            {value}/10
          </span>
          {prev !== null && (
            <span
              className={`text-[10px] w-8 text-right shrink-0 tabular-nums ${trendTextClass(delta!)}`}
            >
              {delta! > 0 ? "+" : ""}
              {delta}
            </span>
          )}
        </>
      ) : (
        <span className="text-white/25 text-xs">—</span>
      )}
    </div>
  );
}

function MetricPair({
  label,
  current,
  previous,
  suffix,
}: {
  label: string;
  current: string | number | null;
  previous?: string | number | null;
  suffix?: string;
}) {
  return (
    <div className="flex items-center gap-3 py-1.5 border-b border-white/[0.04] last:border-0">
      <p className="text-[9px] text-white/30 uppercase tracking-[0.25em] w-28 shrink-0">
        {label}
      </p>
      {current !== null ? (
        <div className="flex items-center gap-3">
          <span className="text-white text-sm font-medium">
            {current}
            {suffix}
          </span>
          {previous !== null && previous !== undefined && (
            <span className="text-white/25 text-[10px]">
              prev {previous}
              {suffix}
            </span>
          )}
        </div>
      ) : (
        <span className="text-white/25 text-xs">—</span>
      )}
    </div>
  );
}

function ComplianceBar({
  label,
  value,
  prev,
}: {
  label: string;
  value: number | null;
  prev: number | null;
}) {
  const delta = value !== null && prev !== null ? value - prev : null;
  return (
    <div className="py-1.5 border-b border-white/[0.04] last:border-0">
      <div className="flex items-center justify-between mb-1">
        <p className="text-[9px] text-white/30 uppercase tracking-[0.25em]">{label}</p>
        <div className="flex items-center gap-3">
          {value !== null ? (
            <>
              <span
                className={`text-sm font-bold tabular-nums ${complianceTextClass(value)}`}
              >
                {value}%
              </span>
              {delta !== null && (
                <span className={`text-[10px] tabular-nums ${trendTextClass(delta)}`}>
                  {delta > 0 ? "+" : ""}
                  {delta}%
                </span>
              )}
            </>
          ) : (
            <span className="text-white/25 text-xs">—</span>
          )}
        </div>
      </div>
      {value !== null && (
        <div className="h-1 bg-white/[0.06]">
          <div
            className={`h-full ${complianceBarClass(value)}`}
            style={{ width: `${value}%` }}
          />
        </div>
      )}
    </div>
  );
}

function TextSection({ label, value }: { label: string; value: string | null }) {
  if (!value) return null;
  return (
    <div className="py-3 border-b border-white/[0.04] last:border-0">
      <p className="text-[9px] text-white/30 uppercase tracking-[0.3em] mb-1.5">{label}</p>
      <p className="text-white/80 text-sm leading-relaxed whitespace-pre-wrap">{value}</p>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// CHECK-IN DATA PANEL
// ─────────────────────────────────────────────────────────────

function CheckInDataPanel({
  data,
  prev,
  label,
}: {
  data: CheckInDetail;
  prev: CheckInDetail | null;
  label?: string;
}) {
  return (
    <div className="space-y-5">
      {label && (
        <p className="text-[9px] text-white/30 uppercase tracking-[0.3em]">{label}</p>
      )}

      {/* Body */}
      {(data.bodyWeightLbs !== null || data.waistInches !== null) && (
        <Card tone="dark" padding="sm">
          <p className="text-[9px] text-white/30 uppercase tracking-[0.3em] mb-2">Body</p>
          <MetricPair
            label="Weight"
            current={data.bodyWeightLbs !== null ? `${data.bodyWeightLbs}` : null}
            previous={prev?.bodyWeightLbs ?? null}
            suffix=" lbs"
          />
          <MetricPair
            label="Waist"
            current={data.waistInches !== null ? `${data.waistInches}` : null}
            previous={prev?.waistInches ?? null}
            suffix='"'
          />
        </Card>
      )}

      {/* Recovery */}
      {(data.averageStress !== null ||
        data.averageEnergy !== null ||
        data.averageHunger !== null ||
        data.digestionRating !== null ||
        data.averageSleepHours !== null) && (
        <Card tone="dark" padding="sm">
          <p className="text-[9px] text-white/30 uppercase tracking-[0.3em] mb-2">Recovery</p>
          <MetricPair
            label="Sleep"
            current={data.averageSleepHours !== null ? `${data.averageSleepHours}` : null}
            previous={prev?.averageSleepHours ?? null}
            suffix=" hrs"
          />
          <RatingBar value={data.averageStress} prev={prev?.averageStress ?? null} label="Stress" />
          <RatingBar value={data.averageEnergy} prev={prev?.averageEnergy ?? null} label="Energy" />
          <RatingBar value={data.averageHunger} prev={prev?.averageHunger ?? null} label="Hunger" />
          <RatingBar value={data.digestionRating} prev={prev?.digestionRating ?? null} label="Digestion" />
        </Card>
      )}

      {/* Habits */}
      {(data.workoutCompliancePct !== null ||
        data.nutritionCompliancePct !== null ||
        data.averageWaterOunces !== null ||
        data.averageSteps !== null) && (
        <Card tone="dark" padding="sm">
          <p className="text-[9px] text-white/30 uppercase tracking-[0.3em] mb-2">Habits</p>
          <ComplianceBar
            label="Workout compliance"
            value={data.workoutCompliancePct}
            prev={prev?.workoutCompliancePct ?? null}
          />
          <ComplianceBar
            label="Nutrition compliance"
            value={data.nutritionCompliancePct}
            prev={prev?.nutritionCompliancePct ?? null}
          />
          <MetricPair
            label="Water"
            current={data.averageWaterOunces}
            previous={prev?.averageWaterOunces ?? null}
            suffix=" oz"
          />
          <MetricPair
            label="Steps"
            current={data.averageSteps !== null ? data.averageSteps.toLocaleString() : null}
            previous={prev?.averageSteps !== null && prev?.averageSteps !== undefined ? prev.averageSteps.toLocaleString() : null}
          />
        </Card>
      )}

      {/* Reflection */}
      {(data.wins || data.challenges || data.questions || data.clientNotes) && (
        <Card tone="dark" padding="sm">
          <p className="text-[9px] text-white/30 uppercase tracking-[0.3em] mb-2">Reflection</p>
          <TextSection label="Wins" value={data.wins} />
          <TextSection label="Challenges" value={data.challenges} />
          <TextSection label="Questions" value={data.questions} />
          <TextSection label="Notes" value={data.clientNotes} />
        </Card>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// PAGE
// ─────────────────────────────────────────────────────────────

export default async function CheckInReviewPage({
  params,
}: {
  params: Promise<{ checkInId: string }>;
}) {
  const { checkInId } = await params;
  const { dbUser } = await requireCoachOrAdminPage();

  const checkIn = await getCoachCheckInDetail(checkInId);
  if (!checkIn) notFound();

  // Ownership check — admin bypasses. A coach only reaches this check-in
  // (including checkIn.coachResponse and health/compliance fields) if
  // they're actually enrolled with checkIn.clientId.
  if (dbUser.role !== "admin" && !(await coachOwnsClient(dbUser.id, checkIn.clientId))) {
    notFound();
  }

  const goalContext = await getClientGoalContext(checkIn.clientId);

  // The exact scheduled occurrence date, not just the week — a
  // Wednesday and a Sunday check-in from the same week must never
  // render this header identically (Phase 7: coach must be able to
  // tell which occurrence this is at a glance).
  const occurrenceLabel = fmtDate(checkIn.scheduledDate);

  return (
    <div className="space-y-6 max-w-5xl">
      <HQBreadcrumbs crumbs={[
        { label: "Overview", href: "/hq" },
        { label: "Check-Ins", href: "/hq/check-ins" },
        { label: checkIn.clientName },
      ]} />

      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <Badge tone="dark" variant={STATUS_BADGE_VARIANT[checkIn.status]} size="sm">
              {STATUS_LABEL[checkIn.status]}
            </Badge>
          </div>
          <h1 className="text-white text-xl font-bold tracking-wide">
            {checkIn.clientName}
          </h1>
          <p className="text-white/50 text-sm mt-0.5">{occurrenceLabel}</p>
          <div className="flex items-center gap-3 mt-1.5 flex-wrap">
            {checkIn.submittedAt && (
              <span className="text-[10px] text-white/30">
                Submitted {fmtDate(checkIn.submittedAt, true)}
              </span>
            )}
            {checkIn.lastEditedAt && (
              <>
                <span className="text-white/15 text-[10px]">·</span>
                <span className={`text-[10px] ${SEVERITY_TEXT.caution}`}>
                  Edited after submission
                </span>
                <span className="text-[10px] text-white/25">
                  ({fmtDate(checkIn.lastEditedAt, true)})
                </span>
              </>
            )}
            <Link
              href={`/hq/clients/${checkIn.clientId}`}
              className="inline-flex items-center gap-1 text-[10px] text-gold/60 uppercase tracking-[0.25em] transition-colors hover:text-gold"
            >
              View Client Workspace
              <ArrowUpRight size={11} />
            </Link>
          </div>
        </div>
        <Link
          href="/hq/check-ins"
          className="inline-flex shrink-0 items-center gap-1.5 rounded-lg border border-white/15 px-3 py-1.5 text-[10px] uppercase tracking-[0.25em] text-white/50 transition-colors hover:border-white/25 hover:text-white/80"
        >
          <ChevronLeft size={12} />
          Queue
        </Link>
      </div>

      {/* 2-column on desktop: check-in data + review panel */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Left: Client data */}
        <div className="space-y-5">
          <CheckInDataPanel
            data={checkIn}
            prev={checkIn.previousCheckIn}
            label={checkIn.previousCheckIn ? "This week · vs prior" : "This week"}
          />

          {/* Previous check-in reference */}
          {checkIn.previousCheckIn && (
            <Card tone="dark" padding="sm" className="opacity-80">
              <p className="text-[9px] text-white/25 uppercase tracking-[0.3em] mb-1">
                Previous check-in
              </p>
              <p className="text-white/40 text-xs">
                Week of {fmtDate(checkIn.previousCheckIn.weekStartDate, true)}
              </p>
              <p className="text-white/25 text-[9px] mt-0.5">
                Deltas (±) shown above in comparison columns
              </p>
            </Card>
          )}
        </div>

        {/* Right: Goal context + coach review panel */}
        <div className="space-y-5">
          {/* Goal context — lightweight summary so the coach has
              immediate context on what the client is working toward
              without navigating to the client workspace. */}
          {goalContext && (
            <Card tone="dark" padding="sm" className="space-y-2">
              <p className="text-[9px] text-white/30 uppercase tracking-[0.3em]">
                Goal Context
              </p>
              <p className="text-white text-sm font-medium">
                {GOAL_TYPE_LABEL[goalContext.goalType] ?? goalContext.goalType}
              </p>
              <p className="text-white/40 text-xs leading-relaxed">
                {goalContext.description}
              </p>
              {(goalContext.targetValue || checkIn.bodyWeightLbs || goalContext.targetDate) && (
                <div className="pt-2 space-y-1 border-t border-white/[0.04]">
                  {goalContext.targetValue && goalContext.targetUnit && (
                    <div className="flex items-center gap-3">
                      <p className="text-[9px] text-white/30 uppercase tracking-[0.25em] w-16 shrink-0">
                        Target
                      </p>
                      <p className="text-white text-sm">
                        {goalContext.targetValue} {goalContext.targetUnit}
                      </p>
                    </div>
                  )}
                  {checkIn.bodyWeightLbs && (
                    <div className="flex items-center gap-3">
                      <p className="text-[9px] text-white/30 uppercase tracking-[0.25em] w-16 shrink-0">
                        This week
                      </p>
                      <p className="text-white text-sm">
                        {checkIn.bodyWeightLbs} lbs
                      </p>
                    </div>
                  )}
                  {goalContext.targetDate && (
                    <div className="flex items-center gap-3">
                      <p className="text-[9px] text-white/30 uppercase tracking-[0.25em] w-16 shrink-0">
                        By
                      </p>
                      <p className="text-white text-sm">
                        {fmtDate(goalContext.targetDate, true)}
                      </p>
                    </div>
                  )}
                </div>
              )}
            </Card>
          )}

          <CheckInReviewPanel
            checkInId={checkIn.id}
            status={checkIn.status}
            clientName={checkIn.clientName}
            initialResponse={checkIn.coachResponse}
          />
        </div>
      </div>
    </div>
  );
}
