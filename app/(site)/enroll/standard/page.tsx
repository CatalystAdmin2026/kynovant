import type { Metadata } from "next";
import EnrollmentPage from "@/components/EnrollmentPage";
import { STRIPE_LINKS, STANDARD_INCLUDES } from "@/lib/enrollment";

export const metadata: Metadata = {
  title: "Enroll — Catalyst Coaching Elite",
  description: "Begin your Catalyst Coaching Elite journey. Custom training, nutrition, and accountability.",
  robots: { index: false, follow: false },
};

export default function StandardEnrollPage() {
  return (
    <EnrollmentPage
      eyebrow="Catalyst Coaching Elite"
      headline="Begin"
      headlineGold="Catalyst Coaching Elite"
      subheadline="Custom coaching built around your life, your schedule, and your goals."
      body="You'll receive a fully personalized training and nutrition program, weekly check-ins, habit goals, and direct coach support — everything needed to build lasting results."
      price="$300"
      pricePeriod="/mo"
      priceNote="Cancel anytime. No contracts."
      ctaLabel="Begin Catalyst Coaching Elite"
      ctaUrl={STRIPE_LINKS.standard}
      includes={STANDARD_INCLUDES}
      coachQuote="Everyone who walks through this program gets my full attention. Your results are a direct reflection of the quality of coaching I provide."
    />
  );
}
