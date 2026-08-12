import HQPageHeader from "@/components/hq/HQPageHeader";
import ScheduleView from "@/components/hq/schedule/ScheduleView";
import { listScheduleClients } from "@/lib/db/schedule-service";
import { requireCoachOrAdminPage } from "@/lib/auth/guards";

export const dynamic = "force-dynamic";

export default async function HQSchedulePage() {
  const { dbUser } = await requireCoachOrAdminPage();
  const clients = await listScheduleClients(dbUser.id);

  return (
    <div>
      <HQPageHeader
        title="Schedule"
        subtitle="Plan coach appointments without external calendar sync."
      />
      <ScheduleView clients={clients} />
    </div>
  );
}
