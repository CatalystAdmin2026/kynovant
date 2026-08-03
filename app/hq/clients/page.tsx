// Catalyst HQ — Clients Directory
// Server component. Auth via layout.tsx.

import { requireCoachOrAdminPage, resolveTenantScope } from "@/lib/auth/guards";
import { listCoachClients } from "@/lib/db/coach-dashboard-service";
import ClientsDirectory from "@/components/hq/ClientsDirectory";
import HQPageHeader from "@/components/hq/HQPageHeader";
import AddClientButton from "@/components/hq/clients/AddClientButton";

export const dynamic = "force-dynamic";

export default async function ClientsPage() {
  const { dbUser } = await requireCoachOrAdminPage();
  const { coachId } = resolveTenantScope(dbUser);
  const clients = await listCoachClients(coachId);

  return (
    <div>
      <HQPageHeader
        title="Clients"
        subtitle="Manage every athlete in one place."
        action={<AddClientButton />}
      />
      <ClientsDirectory clients={clients} />
    </div>
  );
}
