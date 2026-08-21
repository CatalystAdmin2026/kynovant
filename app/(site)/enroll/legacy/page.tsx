import type { Metadata } from "next";
import EnrollmentPage from "@/components/EnrollmentPage";
import { STRIPE_LINKS, STANDARD_INCLUDES } from "@/lib/enrollment";

export const metadata: Metadata = {
  title: "Legacy Rate Enrollment",
  description: "Activate your Legacy rate. Private pricing for long-standing Kept Performance members.",
  robots: { index: false, follow: false },
};

export default function LegacyEnrollPage() {
  return (
    <EnrollmentPage
      eyebrow="Legacy Rate"
      headline="Activate Your"
      headlineGold="Legacy Rate"
      subheadline="The same complete coaching system at the exclusive rate earned through your long-term commitment."
      body="Your Legacy rate is a direct acknowledgment of the consistency and loyalty you've shown. It's private, non-transferable, and only available to members who have earned it through their tenure."
      price="$120"
      pricePeriod="/mo"
      privateNote="This rate is private and exclusively available to Legacy members. It remains active only while your enrollment is continuous and cannot be re-activated after a lapse."
      ctaLabel="Activate Legacy Rate"
      ctaUrl={STRIPE_LINKS.legacy}
      includes={STANDARD_INCLUDES}
      coachQuote="Legacy members have seen the program evolve and stayed the course. That commitment is rare — and it deserves to be recognized."
    />
  );
}
