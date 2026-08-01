import type { Metadata } from "next";
import EnrollmentPage from "@/components/EnrollmentPage";

export const metadata: Metadata = {
  title: "Become a Founding Coach — Kynovant",
  description:
    "Run your coaching business on Kynovant. Founding Coach pricing is limited to the first 10 coaches and locked for as long as you're active.",
};

// Placeholder pricing — swap once the real Founding Coach rate is finalized.
// Kept as a single readable literal (rather than buried in JSX) so it's a
// one-line change.
const FOUNDING_COACH_PRICE = "$149";

const FOUNDING_COACH_INCLUDES = [
  "Your own coach workspace — clients, programs, and check-ins",
  "Program Builder with a reusable exercise library",
  "Client portal — workouts, nutrition targets, and progress tracking",
  "Weekly check-in review queue",
  "Agreement + onboarding flow for new clients",
  "Personal 1:1 setup — Jermaine walks you through your first client, program, and workout",
] as const;

const TRUST_INDICATORS = [
  {
    label: "Founder-Led",
    body: "Kynovant is built and used daily by a working coach — not a software vendor guessing at your workflow.",
  },
  {
    label: "No Long Contract",
    body: "Month-to-month. Cancel anytime — no cancellation fees, no buried terms.",
  },
  {
    label: "Personally Onboarded",
    body: "Every Founding Coach gets a live walkthrough setting up their first client and program, not a help article.",
  },
] as const;

export default function ForCoachesPage() {
  return (
    <EnrollmentPage
      eyebrow="Founding Coach — Limited to 10 Coaches"
      headline="Run Your Coaching"
      headlineGold="Business on Kynovant"
      subheadline="The same system built to run a real coaching practice — programming, check-ins, nutrition, and client progress — now available to a small first group of coaches."
      body="Founding Coach access is capped at 10 coaches while we personally onboard each one. The rate below is locked for as long as your account stays active."
      price={FOUNDING_COACH_PRICE}
      pricePeriod="/mo"
      privateNote="This is the Founding Coach rate — reserved for the first 10 coaches on the platform and locked for as long as your account remains active."
      ctaLabel="Apply for Founding Coach Access"
      ctaUrl="/coach-apply"
      ctaFootnote="Free to apply — no payment required until you're accepted"
      includes={FOUNDING_COACH_INCLUDES}
      trustIndicators={TRUST_INDICATORS}
      coachQuote="I built Kynovant to run my own coaching business. The Founding Coach group is the first time I'm handing the keys to anyone else — and I'm personally onboarding every one of you."
    />
  );
}
