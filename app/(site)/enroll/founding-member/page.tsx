import type { Metadata } from "next";
import EnrollmentPage from "@/components/EnrollmentPage";
import { STRIPE_LINKS, STANDARD_INCLUDES } from "@/lib/enrollment";

export const metadata: Metadata = {
  title: "Founding Member Enrollment — Kynovant",
  description: "Activate your Founding Member rate. Private pricing for early supporters of Kynovant.",
  robots: { index: false, follow: false },
};

export default function FoundingMemberEnrollPage() {
  return (
    <EnrollmentPage
      eyebrow="Founding Member"
      headline="Activate Your"
      headlineGold="Founding Rate"
      subheadline="The same complete coaching system at the rate locked in for our earliest members."
      body="As a Founding Member, you've earned a private rate that reflects your trust in this program from the beginning. This rate is yours to keep as long as you remain enrolled."
      price="$150"
      pricePeriod="/mo"
      privateNote="This rate is private and reserved for Founding Members. It is locked for as long as your enrollment remains active and cannot be re-activated after cancellation."
      ctaLabel="Activate Founding Member Rate"
      ctaUrl={STRIPE_LINKS.foundingMember}
      includes={STANDARD_INCLUDES}
      coachQuote="Founding Members took a chance on this program early. That loyalty means everything — and this rate is my way of honoring it."
    />
  );
}
