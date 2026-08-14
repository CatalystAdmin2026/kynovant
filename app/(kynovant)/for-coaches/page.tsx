import { redirect } from "next/navigation";

// This page previously rendered a standalone "For Coaches" pitch via
// the shared EnrollmentPage component (built for Catalyst Coaching
// Elite's client-facing enrollment flow; still used by app/(site)/enroll/*).
// The redesigned Kynovant homepage now covers this audience directly
// with the self-service trial path, so this legacy route redirects to
// the maintained public funnel instead of keeping a second pitch alive.
export default function ForCoachesPage() {
  redirect("/");
}
