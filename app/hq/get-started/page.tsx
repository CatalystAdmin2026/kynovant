// Catalyst HQ — Get Started Checklist
// Server component. Auth via layout.tsx. Checklist state is derived
// from real data (does the coach have any clients / programs yet?)
// rather than persisted client-side, so this page can't get stuck on
// a stale completion screen — see components/hq/onboarding/OnboardingWizard.tsx.

import { requireCoachOrAdminPage } from "@/lib/auth/guards";
import { listCoachClients } from "@/lib/db/coach-dashboard-service";
import { listProgramTemplates } from "@/lib/db/program-builder-service";
import HQPageHeader from "@/components/hq/HQPageHeader";
import OnboardingWizard from "@/components/hq/onboarding/OnboardingWizard";

export const dynamic = "force-dynamic";

export default async function GetStartedPage() {
  await requireCoachOrAdminPage();

  const [clients, templates] = await Promise.all([
    listCoachClients(),
    listProgramTemplates(),
  ]);

  return (
    <div>
      <HQPageHeader
        title="Get Started"
        subtitle="A quick checklist for getting your first client set up. Nothing here is required more than once — visit Clients or Programs directly anytime after."
      />
      <OnboardingWizard
        initialHasClients={clients.length > 0}
        initialHasPrograms={templates.length > 0}
      />
    </div>
  );
}
