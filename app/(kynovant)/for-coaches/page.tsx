import type { Metadata } from "next";
import EnrollmentPage from "@/components/EnrollmentPage";

export const metadata: Metadata = {
  title: "For Coaches — Kynovant",
  description:
    "Run your coaching business on Kynovant with client workspaces, programs, check-ins, nutrition targets, and progress context.",
};

const FOUNDING_COACH_INCLUDES = [
  "Your own coach workspace — clients, programs, and check-ins",
  "Program Builder with a reusable exercise library",
  "Client portal — workouts, nutrition targets, and progress tracking",
  "Weekly check-in review queue",
  "Agreement + onboarding flow for new clients",
  "Founding Coach onboarding support for your first client, program, and workout assignment",
] as const;

const TRUST_INDICATORS = [
  {
    label: "Founder-Led",
    body: "Kynovant is built around real coaching operations, with product decisions grounded in the day-to-day workflow.",
  },
  {
    label: "No Long Contract",
    body: "Month-to-month. Cancel anytime — no cancellation fees, no buried terms.",
  },
  {
    label: "Personally Onboarded",
    body: "Founding Coach access includes guided setup so your first workspace does not start from a blank page.",
  },
] as const;

export default function ForCoachesPage() {
  return (
    <EnrollmentPage
      eyebrow="For Coaches"
      headline="Run Your Coaching"
      headlineGold="Business on Kynovant"
      subheadline="The same system built to run a real coaching practice — programming, check-ins, nutrition, and client progress — now available to a small first group of coaches."
      body="Founding Coach access is handled through an application and demo conversation so onboarding can match the way your coaching business actually runs."
      price="Private"
      pricePeriod=""
      privateNote="Pricing is reviewed during the application process before any commitment is required."
      ctaLabel="Request Demo / Apply"
      ctaUrl="/coach-apply"
      ctaFootnote="No payment required to apply"
      includes={FOUNDING_COACH_INCLUDES}
      trustIndicators={TRUST_INDICATORS}
      coachQuote="Kynovant is built for the practical work coaches repeat every week: programming, review, context, and follow-through."
    />
  );
}
