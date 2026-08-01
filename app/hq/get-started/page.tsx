// Catalyst HQ — Onboarding Wizard
// Server component. Auth via layout.tsx; resolved again here only to
// read the coach's id for wizard progress persistence.

import { requireCoachOrAdminPage } from "@/lib/auth/guards";
import HQPageHeader from "@/components/hq/HQPageHeader";
import OnboardingWizard from "@/components/hq/onboarding/OnboardingWizard";

export const dynamic = "force-dynamic";

export default async function GetStartedPage() {
  const { dbUser } = await requireCoachOrAdminPage();

  return (
    <div>
      <HQPageHeader
        title="Get Started"
        subtitle="Three steps to your first client on a program: add a client, set up a program, assign the first workout."
      />
      <OnboardingWizard coachId={dbUser.id} />
    </div>
  );
}
