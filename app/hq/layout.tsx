import {
  requireCoachOrAdminPage,
  resolveTenantScope,
} from "@/lib/auth/guards";
import { listCoachClients } from "@/lib/db/coach-dashboard-service";
import { listProgramTemplates } from "@/lib/db/program-builder-service";
import HQShell from "@/components/hq/HQShell";

export default async function HQLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const { dbUser } = await requireCoachOrAdminPage();
  const { coachId } = resolveTenantScope(dbUser);

  const [clients, programs] = await Promise.all([
    listCoachClients(coachId),
    listProgramTemplates(coachId),
  ]);

  return (
    <HQShell
      coachName={dbUser.email}
      onboardingComplete={clients.length > 0 && programs.length > 0}
    >
      {children}
    </HQShell>
  );
}