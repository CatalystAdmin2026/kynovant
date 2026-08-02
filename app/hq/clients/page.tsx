// Catalyst HQ — Clients Directory
// Server component. Auth via layout.tsx.

import { listCoachClients } from "@/lib/db/coach-dashboard-service";
import ClientsDirectory from "@/components/hq/ClientsDirectory";
import HQPageHeader from "@/components/hq/HQPageHeader";

export const dynamic = "force-dynamic";

export default async function ClientsPage() {
  const clients = await listCoachClients();

  return (
    <div>
      <HQPageHeader
        title="Clients"
        subtitle="Manage every athlete in one place."
      />
      <ClientsDirectory clients={clients} />
    </div>
  );
}
